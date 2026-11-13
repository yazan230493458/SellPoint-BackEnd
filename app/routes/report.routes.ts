import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { createNotification, notifyAdmins } from "../../lib/notify.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { reportRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

const reportSchema = z.object({
  targetType: z.enum(["AD", "USER", "MESSAGE", "COMMENT", "REVIEW"]),
  targetId: z.number().int().positive(),
  reason: z.enum([
    "SPAM",
    "SCAM",
    "HARASSMENT",
    "INAPPROPRIATE",
    "COUNTERFEIT",
    "OTHER",
    "FAKE_ACCOUNT",
    "IMPERSONATION",
    "MISLEADING",
    "INCORRECT_PRICE",
    "PROHIBITED",
    "DUPLICATE",
    "INAPPROPRIATE_IMAGES",
  ]),
  description: z.string().trim().max(1000).optional(),
});

const assertTarget = async (targetType: z.infer<typeof reportSchema>["targetType"], targetId: number, userId: number) => {
  if (targetType === "AD") {
    const ad = await prisma.ads.findFirst({ where: { id: targetId, isDeleted: false }, select: { id: true, userId: true } });
    if (!ad) throw new HttpError(404, "Advertisement not found");
    if (ad.userId === userId) throw new HttpError(400, "You cannot report your own advertisement");
    return;
  }
  if (targetType === "USER") {
    if (targetId === userId) throw new HttpError(400, "You cannot report yourself");
    const user = await prisma.users.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } });
    if (!user) throw new HttpError(404, "User not found");
    return;
  }
  if (targetType === "MESSAGE") {
    const message = await prisma.chatMessage.findUnique({
      where: { id: targetId },
      include: { chat: { select: { buyerId: true, sellerId: true } } },
    });
    if (!message || (message.chat.buyerId !== userId && message.chat.sellerId !== userId)) {
      throw new HttpError(404, "Message not found");
    }
    return;
  }
  if (targetType === "COMMENT") {
    const comment = await prisma.comment.findUnique({ where: { id: targetId }, select: { id: true, userId: true } });
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.userId === userId) throw new HttpError(400, "You cannot report your own comment");
    return;
  }
  const review = await prisma.review.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!review) throw new HttpError(404, "Review not found");
};

router.post("/reports", authMiddleware, reportRateLimit, validate({ body: reportSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof reportSchema>;
  await assertTarget(body.targetType, body.targetId, req.userId);
  const duplicate = await prisma.report.findFirst({
    where: {
      reporterId: req.userId,
      targetType: body.targetType,
      targetId: body.targetId,
      status: { in: ["PENDING", "REVIEWING"] },
    },
    select: { id: true },
  });
  if (duplicate) throw new HttpError(409, "This report is already open");

  const recentCount = await prisma.report.count({
    where: { reporterId: req.userId, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recentCount >= 10) throw new HttpError(429, "Too many reports");

  const report = await prisma.report.create({
    data: {
      reporterId: req.userId,
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason,
      ...(body.description !== undefined ? { description: body.description } : {}),
    },
  });
  await notifyAdmins({
    title: "New report",
    message: `A ${body.targetType.toLowerCase()} report is waiting for review.`,
    type: "REPORT",
    channel: "reportsChannel",
    href: "/dashboard",
    dedupeKey: `report:${report.id}`,
  });
  await createNotification({
    userId: req.userId,
    title: "Report submitted",
    message: "Your report was received.",
    type: "REPORT",
    channel: "reportsChannel",
    dedupeKey: `report-received:${report.id}`,
  });
  res.status(201).json({
    report: {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
}));

router.get("/reports/mine", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const reports = await prisma.report.findMany({
    where: { reporterId: req.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  });
  res.status(200).json({ reports });
}));

export default router;
