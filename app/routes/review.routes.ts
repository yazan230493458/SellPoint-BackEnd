import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { createNotification } from "../../lib/notify.js";
import authMiddleware, { optionalAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

const reviewSchema = z.object({
  reviewedUserId: z.number().int().positive(),
  adId: z.number().int().positive().optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).default(""),
});

const updateSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  text: z.string().trim().max(1000).optional(),
}).refine((value) => value.rating !== undefined || value.text !== undefined, {
  message: "No changes provided",
});

const refreshEvaluation = async (userId: number) => {
  const aggregate = await prisma.review.aggregate({
    where: { reviewedUserId: userId, adId: null },
    _avg: { rating: true },
  });
  await prisma.users.update({
    where: { id: userId },
    data: { evaluation: aggregate._avg.rating ?? 0 },
  });
};

const advertisementRating = async (adId: number) => {
  const aggregate = await prisma.review.aggregate({
    where: { adId },
    _avg: { rating: true },
  });
  return aggregate._avg.rating ?? 0;
};

router.get("/users/:userId/reviews", optionalAuth, asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new HttpError(400, "Invalid user");
  const reviews = await prisma.review.findMany({
    where: { reviewedUserId: userId, adId: null },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { id: true, username: true, avatarUrl: true } } },
  });
  const average = reviews.length === 0 ? 0 : reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  res.status(200).json({ reviews, average, total: reviews.length });
}));

router.post("/reviews", authMiddleware, validate({ body: reviewSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof reviewSchema>;
  if (body.reviewedUserId === req.userId) throw new HttpError(400, "You cannot review yourself");
  const target = await prisma.users.findFirst({
    where: { id: body.reviewedUserId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!target) throw new HttpError(404, "User not found");
  const existing = await prisma.review.findFirst({
    where: body.adId
      ? { reviewerId: req.userId, adId: body.adId }
      : { reviewerId: req.userId, reviewedUserId: target.id, adId: null },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(409, body.adId ? "You have already reviewed this advertisement" : "You have already reviewed this user");
  }
  let reviewedAdId: number | null = null;
  if (body.adId) {
    const ad = await prisma.ads.findFirst({
      where: { id: body.adId, isActive: true, isDeleted: false },
      select: { id: true, userId: true },
    });
    if (!ad || ad.userId !== target.id) throw new HttpError(404, "Ad not found");
    reviewedAdId = ad.id;
  }
  const review = await prisma.review.create({
    data: {
      reviewerId: req.userId,
      reviewedUserId: target.id,
      adId: reviewedAdId,
      rating: body.rating,
      text: body.text,
    },
  });
  if (reviewedAdId) {
    await createNotification({
      userId: target.id,
      title: "New review",
      message: `${req.username ?? "Someone"} left you a review.`,
      type: "REVIEW",
      channel: "reviewsChannel",
      dedupeKey: `review:${review.id}`,
    });
    res.status(201).json({ review, rating: await advertisementRating(reviewedAdId) });
    return;
  }
  await refreshEvaluation(target.id);
  await createNotification({
    userId: target.id,
    title: "New review",
    message: `${req.username ?? "Someone"} left you a review.`,
    type: "REVIEW",
    channel: "reviewsChannel",
    dedupeKey: `review:${review.id}`,
  });
  res.status(201).json({ review });
}));

router.patch("/reviews/:id", authMiddleware, validate({ body: updateSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const id = Number(req.params.id);
  const existing = await prisma.review.findFirst({ where: { id, reviewerId: req.userId } });
  if (!existing) throw new HttpError(404, "Review not found");
  const body = req.input?.body as z.infer<typeof updateSchema>;
  const review = await prisma.review.update({
    where: { id },
    data: {
      ...(body.rating !== undefined ? { rating: body.rating } : {}),
      ...(body.text !== undefined ? { text: body.text } : {}),
    },
  });
  if (existing.adId) {
    res.status(200).json({ review, rating: await advertisementRating(existing.adId) });
    return;
  }
  await refreshEvaluation(existing.reviewedUserId);
  res.status(200).json({ review });
}));

router.delete("/reviews/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const id = Number(req.params.id);
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Review not found");
  const isStaff = req.role === "ADMIN" || req.role === "OWNER";
  if (existing.reviewerId !== req.userId && !isStaff) throw new HttpError(403, "Forbidden");
  await prisma.review.delete({ where: { id } });
  if (existing.adId) {
    res.status(200).json({ message: "Review deleted", rating: await advertisementRating(existing.adId) });
    return;
  }
  await refreshEvaluation(existing.reviewedUserId);
  res.status(200).json({ message: "Review deleted" });
}));

export default router;
