import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

router.get("/notifications", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const notifications = await prisma.notification.findMany({
    where: { userId: req.userId, dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.status(200).json({ notifications });
}));

router.get("/notifications/unread-count", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const count = await prisma.notification.count({
    where: { userId: req.userId, isRead: false, dismissedAt: null },
  });
  res.status(200).json({ count });
}));

router.patch("/notifications/read-all", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const result = await prisma.notification.updateMany({
    where: { userId: req.userId, isRead: false, dismissedAt: null },
    data: { isRead: true },
  });
  res.status(200).json({ updated: result.count });
}));

router.patch("/notifications/:id/read", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const id = Number(req.params.id);
  const result = await prisma.notification.updateMany({
    where: { id, userId: req.userId, dismissedAt: null },
    data: { isRead: true },
  });
  if (result.count === 0) throw new HttpError(404, "Notification not found");
  res.status(200).json({ message: "Notification marked as read" });
}));

router.delete("/notifications/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const id = Number(req.params.id);
  const result = await prisma.notification.updateMany({
    where: { id, userId: req.userId, dismissedAt: null },
    data: { dismissedAt: new Date(), isRead: true },
  });
  if (result.count === 0) throw new HttpError(404, "Notification not found");
  res.status(200).json({ message: "Notification dismissed" });
}));

export default router;
