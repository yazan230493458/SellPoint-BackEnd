import { Router } from "express";
import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";
import { Prisma } from "../../generator/prisma/client.js";
import prisma from "../../lib/prisma.js";
import countriesData from "../../data/locationData.js";
import categoryOptions from "../../data/categoryOptions.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { sha256 } from "../../lib/crypto.js";
import { adLimit, usersWithFeaturedPlacement } from "../../lib/premium.js";
import { createNotification } from "../../lib/notify.js";
import { isOwnedAdImage, unlinkOwnedImage, unlinkOwnedImages } from "../../lib/uploads.js";
import authMiddleware, { optionalAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { viewRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

const countryNames = Object.keys(countriesData);

const adFields = {
  adName: z.string().trim().min(3).max(100),
  mobileNumber: z.string().trim().refine((value) => isValidPhoneNumber(value) || /^\+?[0-9]{8,15}$/.test(value), {
    message: "Invalid mobile number",
  }),
  selectedCountry: z.string().trim().min(1).max(80),
  selectedRegion: z.string().trim().max(80).optional(),
  selectedCity: z.string().trim().min(1).max(80),
  description: z.string().trim().min(10).max(1000),
  category: z.string().trim().min(2).max(120),
  price: z.coerce.number().finite().min(0).max(1000000000),
  showPrice: z.boolean(),
  mainImageIndex: z.number().int().min(0).default(0),
  preferredContactMethod: z.enum(["MOBILECALL", "WHATSAPP", "BOTH", "EMAIL"]),
  acceptTerms: z.literal(true, { message: "You must accept the terms and conditions" }),
};

const createAdSchema = z.object(adFields);
const editAdSchema = z.object({ adID: z.number().int().positive(), ...adFields });

const assertLocation = (country: string, city: string) => {
  if (!countryNames.includes(country)) {
    throw new HttpError(400, "Invalid country");
  }
  const record = countriesData[country as keyof typeof countriesData];
  if (!(record.cities as readonly string[]).includes(city)) {
    throw new HttpError(400, "Invalid city");
  }
  return record.region;
};

const assertCategory = async (category: string) => {
  const staticMatch = categoryOptions.some((option) => option.value === category || option.items.includes(category));
  if (staticMatch) return;
  const dbCategory = await prisma.category.findFirst({
    where: { isActive: true, OR: [{ name: category }, { slug: category }] },
    select: { id: true },
  });
  if (!dbCategory) {
    throw new HttpError(400, "Invalid category");
  }
};

type AdRecord = {
  price: Prisma.Decimal;
  mobileNumber: string;
  userId: number;
};

const shapeAd = <T extends AdRecord>(ad: T, includeContact: boolean, featuredActive: boolean) => {
  const { mobileNumber, price, ...rest } = ad;
  return {
    ...rest,
    price: price.toString(),
    featuredActive,
    ...(includeContact ? { mobileNumber } : {}),
  };
};

const presentAd = async <T extends AdRecord>(ad: T, includeContact: boolean) => {
  const featured = await usersWithFeaturedPlacement([ad.userId]);
  return shapeAd(ad, includeContact, featured.has(ad.userId));
};

const advertisementRating = async (adId: number) => {
  const aggregate = await prisma.review.aggregate({
    where: { adId },
    _avg: { rating: true },
  });
  return aggregate._avg.rating ?? 0;
};

const viewerReaction = async (userId: number | undefined, adId: number) => {
  if (!userId) return null;
  const reaction = await prisma.adReactions.findUnique({
    where: { userId_adId: { userId, adId } },
    select: { reaction: true },
  });
  return reaction?.reaction ?? null;
};

const presentAds = async <T extends AdRecord>(ads: T[], includeContact: boolean) => {
  const featured = await usersWithFeaturedPlacement(ads.map((ad) => ad.userId));
  return ads.map((ad) => shapeAd(ad, includeContact, featured.has(ad.userId)));
};

const requireUser = (req: { userId?: number; username?: string }) => {
  if (!req.userId || !req.username) {
    throw new HttpError(401, "Unauthorized");
  }
  return { userId: req.userId, username: req.username };
};

router.post("/create-ad", authMiddleware, adLimit, validate({ body: createAdSchema }), asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const body = req.input?.body as z.infer<typeof createAdSchema>;
  const region = assertLocation(body.selectedCountry, body.selectedCity);
  await assertCategory(body.category);
  const ad = await prisma.ads.create({
    data: {
      userId: actor.userId,
      username: actor.username,
      adName: body.adName,
      mobileNumber: body.mobileNumber,
      selectedCountry: body.selectedCountry,
      selectedRegion: body.selectedRegion || region,
      selectedCity: body.selectedCity,
      description: body.description,
      category: body.category,
      price: body.price,
      showPrice: body.showPrice,
      images: [],
      mainImageIndex: 0,
      preferredContactMethod: body.preferredContactMethod,
      acceptTerms: true,
    },
  });
  res.status(201).json({ message: "Ad created successfully", ad: await presentAd(ad, true) });
}));

router.get("/get-ads", authMiddleware, asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const ads = await prisma.ads.findMany({
    where: { userId: actor.userId, isDeleted: false },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ ads: await presentAds(ads, true) });
}));

const removeSchema = z.object({ adID: z.number().int().positive() });

router.post("/remove-ad", authMiddleware, validate({ body: removeSchema }), asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const body = req.input?.body as z.infer<typeof removeSchema>;
  const existing = await prisma.ads.findFirst({
    where: { id: body.adID, userId: actor.userId, isDeleted: false },
    select: { id: true, images: true, users: { select: { username: true } } },
  });
  if (!existing) {
    throw new HttpError(404, "Ad not found");
  }
  await prisma.ads.update({
    where: { id: existing.id },
    data: { isDeleted: true, isActive: false },
  });
  await unlinkOwnedImages(existing.images, existing.users.username, existing.id);
  res.status(200).json({ message: "Ad removed successfully" });
}));

router.post("/edit-ad", authMiddleware, validate({ body: editAdSchema }), asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const body = req.input?.body as z.infer<typeof editAdSchema>;
  const region = assertLocation(body.selectedCountry, body.selectedCity);
  await assertCategory(body.category);
  const existing = await prisma.ads.findFirst({
    where: { id: body.adID, userId: actor.userId, isDeleted: false },
  });
  if (!existing) {
    throw new HttpError(404, "Ad not found");
  }
  const mainImageIndex = existing.images.length === 0 ? 0 : Math.min(body.mainImageIndex, existing.images.length - 1);
  const ad = await prisma.ads.update({
    where: { id: existing.id },
    data: {
      adName: body.adName,
      mobileNumber: body.mobileNumber,
      selectedCountry: body.selectedCountry,
      selectedRegion: body.selectedRegion || region,
      selectedCity: body.selectedCity,
      description: body.description,
      category: body.category,
      price: body.price,
      showPrice: body.showPrice,
      mainImageIndex,
      preferredContactMethod: body.preferredContactMethod,
      acceptTerms: true,
    },
  });
  res.status(200).json({ message: "Ad updated successfully", ad: await presentAd(ad, true) });
}));

router.get("/ads/lookup", optionalAuth, asyncHandler(async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!name || name.length > 100) {
    throw new HttpError(400, "Invalid ad name");
  }
  const ad = await prisma.ads.findFirst({
    where: {
      isDeleted: false,
      isActive: true,
      OR: [{ adName: { equals: name, mode: "insensitive" } }, { username: { equals: name, mode: "insensitive" } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!ad) throw new HttpError(404, "Ad not found");
  const [reaction, rating] = await Promise.all([
    viewerReaction(req.userId, ad.id),
    advertisementRating(ad.id),
  ]);
  res.status(200).json({
    ad: {
      ...(await presentAd(ad, true)),
      viewerReaction: reaction,
      rating,
    },
  });
}));

router.get("/ads/:id", optionalAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid ad ID");
  const ad = await prisma.ads.findFirst({
    where: {
      id,
      OR: [
        { isDeleted: false, isActive: true },
        ...(req.userId ? [{ userId: req.userId }] : []),
        ...(req.role === "ADMIN" || req.role === "OWNER" ? [{ id }] : []),
      ],
    },
  });
  if (!ad || (ad.isDeleted && req.userId !== ad.userId && req.role !== "ADMIN" && req.role !== "OWNER")) {
    throw new HttpError(404, "Ad not found");
  }
  const [reaction, rating] = await Promise.all([
    viewerReaction(req.userId, ad.id),
    advertisementRating(ad.id),
  ]);
  res.status(200).json({
    ad: {
      ...(await presentAd(ad, true)),
      viewerReaction: reaction,
      rating,
    },
  });
}));

const mainImageSchema = z.object({ mainImageIndex: z.number().int().min(0) });

router.patch("/ads/:id/main-image", authMiddleware, validate({ body: mainImageSchema }), asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const id = Number(req.params.id);
  const body = req.input?.body as z.infer<typeof mainImageSchema>;
  const ad = await prisma.ads.findFirst({ where: { id, userId: actor.userId, isDeleted: false } });
  if (!ad) throw new HttpError(404, "Ad not found");
  if (body.mainImageIndex >= ad.images.length) throw new HttpError(400, "Invalid main image index");
  const updated = await prisma.ads.update({
    where: { id },
    data: { mainImageIndex: body.mainImageIndex },
  });
  res.status(200).json({ ad: await presentAd(updated, true) });
}));

router.post("/ads/:id/view", optionalAuth, viewRateLimit, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid ad ID");
  const ad = await prisma.ads.findFirst({
    where: { id, isActive: true, isDeleted: false },
    select: { id: true, userId: true },
  });
  if (!ad) throw new HttpError(404, "Ad not found");
  if (req.userId === ad.userId) {
    res.status(200).json({ counted: false });
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const identity = req.userId ? `user:${req.userId}` : `ip:${req.ip ?? "unknown"}`;
  const viewerKey = sha256(`${identity}:${day}`);
  try {
    await prisma.adImpression.create({ data: { adId: id, viewerKey } });
    await prisma.ads.update({ where: { id }, data: { views: { increment: 1 } } });
    res.status(200).json({ counted: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(200).json({ counted: false });
      return;
    }
    throw error;
  }
}));

const reactionSchema = z.object({ reaction: z.enum(["LIKE", "DISLIKE"]) });

router.post("/ads/:id/reactions", authMiddleware, validate({ body: reactionSchema }), asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const id = Number(req.params.id);
  const body = req.input?.body as z.infer<typeof reactionSchema>;
  const ad = await prisma.ads.findFirst({ where: { id, isActive: true, isDeleted: false } });
  if (!ad) throw new HttpError(404, "Ad not found");
  const existing = await prisma.adReactions.findUnique({
    where: { userId_adId: { userId: actor.userId, adId: id } },
  });
  if (existing?.reaction === body.reaction) {
    res.status(200).json({
      ad: {
        ...(await presentAd(ad, actor.userId === ad.userId)),
        viewerReaction: existing.reaction,
      },
    });
    return;
  }
  if (existing) {
    await prisma.adReactions.update({ where: { id: existing.id }, data: { reaction: body.reaction } });
  } else {
    await prisma.adReactions.create({ data: { userId: actor.userId, adId: id, reaction: body.reaction } });
  }
  const [likes, dislikes] = await Promise.all([
    prisma.adReactions.count({ where: { adId: id, reaction: "LIKE" } }),
    prisma.adReactions.count({ where: { adId: id, reaction: "DISLIKE" } }),
  ]);
  const updated = await prisma.ads.update({ where: { id }, data: { likes, dislikes } });
  const currentReaction = await viewerReaction(actor.userId, id);
  if (ad.userId !== actor.userId) {
    await createNotification({
      userId: ad.userId,
      title: "Advertisement activity",
      message: `Someone reacted to ${ad.adName}.`,
      type: "AD",
      channel: "adStatusChannel",
      href: `/search/ad/${ad.id}`,
      dedupeKey: `reaction:${id}:${actor.userId}`,
    });
  }
  res.status(200).json({
    ad: {
      ...(await presentAd(updated, actor.userId === ad.userId)),
      viewerReaction: currentReaction,
    },
  });
}));

export const replaceAdImages = async (adId: number, username: string, nextImages: string[], mainImageIndex: number) => {
  const ad = await prisma.ads.findFirst({ where: { id: adId, username, isDeleted: false } });
  if (!ad) throw new HttpError(404, "Ad not found");
  if (nextImages.some((image) => !isOwnedAdImage(image, username, adId))) {
    throw new HttpError(400, "Invalid image path");
  }
  const removed = ad.images.filter((image) => !nextImages.includes(image));
  const updated = await prisma.ads.update({
    where: { id: adId },
    data: {
      images: nextImages,
      mainImageIndex: nextImages.length === 0 ? 0 : Math.min(mainImageIndex, nextImages.length - 1),
    },
  });
  await Promise.all(removed.map((image) => unlinkOwnedImage(image, username, adId)));
  return updated;
};

export default router;
