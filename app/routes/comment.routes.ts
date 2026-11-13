import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { createNotification } from "../../lib/notify.js";
import authMiddleware, { optionalAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const commentSchema = z.object({ text: z.string().trim().min(1).max(1000) });

router.get("/ads/:adId/comments", optionalAuth, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const adId = Number(req.params.adId);
  if (!Number.isSafeInteger(adId) || adId <= 0) throw new HttpError(400, "Invalid ad ID");
  const ad = await prisma.ads.findFirst({
    where: { id: adId, isDeleted: false, isActive: true },
    select: { id: true },
  });
  if (!ad) throw new HttpError(404, "Ad not found");
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const where = { adId, isHidden: false };
  const [total, comments] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    }),
  ]);
  res.status(200).json({ comments, total, page: query.page, limit: query.limit });
}));

router.post("/ads/:adId/comments", authMiddleware, validate({ body: commentSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const adId = Number(req.params.adId);
  if (!Number.isSafeInteger(adId) || adId <= 0) throw new HttpError(400, "Invalid ad ID");
  const ad = await prisma.ads.findFirst({
    where: { id: adId, isDeleted: false, isActive: true },
    select: { id: true, userId: true, adName: true },
  });
  if (!ad) throw new HttpError(404, "Ad not found");
  const body = req.input?.body as z.infer<typeof commentSchema>;
  const comment = await prisma.comment.create({
    data: { adId, userId: req.userId, text: body.text },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  if (ad.userId !== req.userId) {
    await createNotification({
      userId: ad.userId,
      title: "New comment",
      message: `${req.username ?? "Someone"} commented on ${ad.adName}.`,
      type: "AD",
      channel: "adStatusChannel",
      href: `/search/ad/${ad.id}`,
      dedupeKey: `comment:${comment.id}`,
    });
  }
  res.status(201).json({ comment });
}));

router.patch("/comments/:id", authMiddleware, validate({ body: commentSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const id = Number(req.params.id);
  const body = req.input?.body as z.infer<typeof commentSchema>;
  const existing = await prisma.comment.findFirst({ where: { id, userId: req.userId, isHidden: false } });
  if (!existing) throw new HttpError(404, "Comment not found");
  const comment = await prisma.comment.update({
    where: { id },
    data: { text: body.text },
  });
  res.status(200).json({ comment });
}));

router.delete("/comments/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const id = Number(req.params.id);
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Comment not found");
  const isStaff = req.role === "ADMIN" || req.role === "OWNER";
  if (existing.userId !== req.userId && !isStaff) throw new HttpError(403, "Forbidden");
  await prisma.comment.delete({ where: { id } });
  res.status(200).json({ message: "Comment deleted" });
}));

export default router;
