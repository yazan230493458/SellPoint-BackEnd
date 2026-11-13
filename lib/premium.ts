import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./http.js";
import prisma from "./prisma.js";

const FREE_AD_LIMIT = 50;

export const expireEntitlements = async () => {
  const now = new Date();
  await prisma.userSubscription.updateMany({
    where: {
      status: "ACTIVE",
      endsAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
};

export const activeSubscriptionWhere = (now = new Date()) => ({
  status: "ACTIVE" as const,
  endsAt: { gt: now },
  OR: [{ startsAt: null }, { startsAt: { lte: now } }],
  plan: { isActive: true },
});

export const featuredSubscriptionWhere = (now = new Date()) => ({
  status: "ACTIVE" as const,
  endsAt: { gt: now },
  OR: [{ startsAt: null }, { startsAt: { lte: now } }],
  plan: { isActive: true, featuredPlacement: true },
});

export const getActiveSubscription = async (userId: number) => {
  await expireEntitlements();
  return prisma.userSubscription.findFirst({
    where: { userId, ...activeSubscriptionWhere() },
    include: { plan: true },
    orderBy: { endsAt: "desc" },
  });
};

export const usersWithFeaturedPlacement = async (userIds: number[]) => {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set<number>();
  await expireEntitlements();
  const rows = await prisma.userSubscription.findMany({
    where: { userId: { in: ids }, ...featuredSubscriptionWhere() },
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
};

export const planSummary = (plan: {
  id: number;
  name: string;
  adLimit: number;
  featuredPlacement: boolean;
  visibilityBoost: number;
  features: string[];
}) => ({
  id: plan.id,
  name: plan.name,
  adLimit: plan.adLimit,
  featuredPlacement: plan.featuredPlacement,
  visibilityBoost: plan.visibilityBoost,
  features: plan.features,
});

export const adLimit = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      next();
      return;
    }
    const subscription = await getActiveSubscription(req.userId);
    const limit = subscription?.plan.adLimit ?? FREE_AD_LIMIT;
    if (limit < 0) {
      next();
      return;
    }
    const count = await prisma.ads.count({
      where: { userId: req.userId, isDeleted: false },
    });
    if (count >= limit) {
      next(new HttpError(403, "You have reached the maximum number of ads."));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
