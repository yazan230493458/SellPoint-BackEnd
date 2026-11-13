
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../../generator/prisma/client.js";
import prisma from "../../lib/prisma.js";
import categoryOptions from "../../data/categoryOptions.js";
import { asyncHandler } from "../../lib/http.js";
import { activeSubscriptionWhere, expireEntitlements } from "../../lib/premium.js";
import { validate } from "../middleware/validate.middleware.js";
import { searchRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).max(120).optional(),
);

const optionalNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().finite().min(0).optional(),
);

const searchSchema = z.object({
  q: optionalText,
  category: optionalText,
  subcategory: optionalText,
  country: optionalText,
  region: optionalText,
  city: optionalText,
  minPrice: optionalNumber,
  maxPrice: optionalNumber,
  sort: z
    .enum(["newest", "oldest", "price_asc", "price_desc", "views"])
    .default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

const categoryNames = async (
  category?: string,
  subcategory?: string,
) => {
  const names = new Set<string>();

  if (subcategory) names.add(subcategory);

  if (category) {
    names.add(category);

    for (const group of categoryOptions) {
      if (group.value === category) {
        group.items.forEach((item) => names.add(item));
      }
    }

    const record = await prisma.category.findFirst({
      where: {
        OR: [{ name: category }, { slug: category }],
      },
      include: {
        children: {
          select: { name: true, slug: true },
        },
      },
    });

    if (record) {
      names.add(record.name);
      names.add(record.slug);

      record.children.forEach((child) => {
        names.add(child.name);
        names.add(child.slug);
      });
    }
  }

  return [...names];
};

router.get(
  "/search/ads",
  searchRateLimit,
  validate({ query: searchSchema }),
  asyncHandler(async (req, res) => {
    const query = req.input?.query as z.infer<typeof searchSchema>;

    await expireEntitlements();

    const names = await categoryNames(
      query.category,
      query.subcategory,
    );

    const words = (query.q ?? "")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean)
      .slice(0, 8);

    const now = new Date();

    const where: Prisma.AdsWhereInput = {
      isActive: true,
      isDeleted: false,
      users: {
        isActive: true,
        deletedAt: null,
      },
      ...(query.country
        ? { selectedCountry: query.country }
        : {}),
      ...(query.city
        ? { selectedCity: query.city }
        : {}),
      ...(query.region
        ? {
            OR: [
              { selectedRegion: query.region },
              { selectedCountry: query.region },
            ],
          }
        : {}),
      ...(names.length > 0
        ? { category: { in: names } }
        : {}),
      ...(query.minPrice !== undefined ||
      query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined
                ? { gte: query.minPrice }
                : {}),
              ...(query.maxPrice !== undefined
                ? { lte: query.maxPrice }
                : {}),
            },
          }
        : {}),
      ...(words.length > 0
        ? {
            AND: words.map((word) => ({
              OR: [
                {
                  adName: {
                    contains: word,
                    mode: "insensitive" as const,
                  },
                },
                {
                  description: {
                    contains: word,
                    mode: "insensitive" as const,
                  },
                },
                {
                  category: {
                    contains: word,
                    mode: "insensitive" as const,
                  },
                },
              ],
            })),
          }
        : {}),
    };

    const [ads, total] = await Promise.all([
      prisma.ads.findMany({
        where,
        include: {
          users: {
            select: {
              subscriptions: {
                where: activeSubscriptionWhere(now),
                include: {
                  plan: true,
                },
                orderBy: {
                  endsAt: "desc",
                },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.ads.count({ where }),
    ]);

    ads.sort((a, b) => {
      const aPlan = a.users.subscriptions[0]?.plan;
      const bPlan = b.users.subscriptions[0]?.plan;

      const featuredDifference =
        Number(Boolean(bPlan?.featuredPlacement)) -
        Number(Boolean(aPlan?.featuredPlacement));

      if (featuredDifference !== 0) {
        return featuredDifference;
      }

      const boostDifference =
        (bPlan?.visibilityBoost ?? 0) -
        (aPlan?.visibilityBoost ?? 0);

      if (boostDifference !== 0) {
        return boostDifference;
      }

      switch (query.sort) {
        case "oldest":
          return a.createdAt.getTime() - b.createdAt.getTime();

        case "price_asc":
          return Number(a.price) - Number(b.price);

        case "price_desc":
          return Number(b.price) - Number(a.price);

        case "views":
          return b.views - a.views;

        case "newest":
        default:
          return b.createdAt.getTime() - a.createdAt.getTime();
      }
    });

    const start = (query.page - 1) * query.limit;

    const paginatedAds = ads
      .slice(start, start + query.limit)
      .map((ad) => {
        const { mobileNumber: _mobileNumber, users, price, ...publicAd } = ad;
        return {
          ...publicAd,
          price: price.toString(),
          featuredActive: Boolean(users.subscriptions[0]?.plan.featuredPlacement),
        };
      });

    res.status(200).json({
      ads: paginatedAds,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    });
  }),
);

export default router;
