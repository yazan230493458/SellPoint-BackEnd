import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { createNotification } from "../../lib/notify.js";
import { messageAttachmentPath } from "../../lib/uploads.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { messageRateLimit } from "../middleware/rate-limit.middleware.js";
import upload, { verifyUploadedImages } from "../middleware/upload.middleware.js";

const router = Router();

const requireUser = (userId?: number) => {
  if (!userId) throw new HttpError(401, "Unauthorized");
  return userId;
};

const memberChat = async (chatId: number, userId: number) => {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, OR: [{ buyerId: userId }, { sellerId: userId }] },
  });
  if (!chat) throw new HttpError(404, "Conversation not found");
  return chat;
};

const conversationSchema = z.object({
  sellerId: z.number().int().positive(),
  adId: z.number().int().positive().optional(),
});

router.post("/conversations", authMiddleware, validate({ body: conversationSchema }), asyncHandler(async (req, res) => {
  const userId = requireUser(req.userId);
  const body = req.input?.body as z.infer<typeof conversationSchema>;
  if (body.sellerId === userId) throw new HttpError(400, "You cannot message yourself");
  const seller = await prisma.users.findFirst({
    where: { id: body.sellerId, isActive: true, deletedAt: null },
    select: { id: true, username: true, preference: { select: { allowDirectMessages: true, bannedUsernames: true } } },
  });
  if (!seller) throw new HttpError(404, "Seller not found");
  if (seller.preference && !seller.preference.allowDirectMessages) {
    throw new HttpError(403, "This user is not accepting messages");
  }
  if (req.username && seller.preference?.bannedUsernames.includes(req.username)) {
    throw new HttpError(403, "You cannot message this user");
  }
  if (body.adId) {
    const ad = await prisma.ads.findFirst({
      where: { id: body.adId, userId: seller.id, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!ad) throw new HttpError(404, "Ad not found");
  }
  const existing = await prisma.chat.findFirst({
    where: { buyerId: userId, sellerId: seller.id, adId: body.adId ?? null },
  });
  if (existing) {
    res.status(200).json({ conversation: existing });
    return;
  }
  const conversation = await prisma.chat.create({
    data: {
      buyerId: userId,
      sellerId: seller.id,
      ...(body.adId !== undefined ? { adId: body.adId } : {}),
    },
  });
  res.status(201).json({ conversation });
}));

router.get("/conversations", authMiddleware, asyncHandler(async (req, res) => {
  const userId = requireUser(req.userId);
  const conversations = await prisma.chat.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: {
      buyer: { select: { id: true, username: true, avatarUrl: true } },
      seller: { select: { id: true, username: true, avatarUrl: true } },
      ad: { select: { id: true, adName: true, images: true, mainImageIndex: true } },
      messages: {
        where: { deletedAt: null, isRead: false, senderId: { not: userId } },
        select: { id: true },
      },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  res.status(200).json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      ad: conversation.ad,
      buyer: conversation.buyer,
      seller: conversation.seller,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: conversation.messages.length,
    })),
  });
}));

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

router.get("/conversations/:id/messages", authMiddleware, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const userId = requireUser(req.userId);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid conversation");
  await memberChat(id, userId);
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const [total, messages] = await Promise.all([
    prisma.chatMessage.count({ where: { chatId: id } }),
    prisma.chatMessage.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { sender: { select: { id: true, username: true } } },
    }),
  ]);
  res.status(200).json({
    messages: messages.reverse().map((message) => ({
      id: message.id,
      senderId: message.senderId,
      sender: message.sender,
      text: message.deletedAt ? "" : message.text,
      imageUrl: message.deletedAt ? null : message.imageUrl,
      deleted: Boolean(message.deletedAt),
      isRead: message.isRead,
      createdAt: message.createdAt,
    })),
    total,
    page: query.page,
    limit: query.limit,
  });
}));

const messageSchema = z.object({
  text: z.string().trim().max(2000).optional(),
  imageUrl: z.string().trim().max(300).optional(),
}).refine((value) => Boolean(value.text) || Boolean(value.imageUrl), { message: "Message is empty" });

router.post("/conversations/:id/attachments", authMiddleware, asyncHandler(async (req, res, next) => {
  const userId = requireUser(req.userId);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid conversation");
  await memberChat(id, userId);
  next();
}), upload.single("messageImage"), verifyUploadedImages, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file || !req.username) throw new HttpError(400, "Image is required");
  const imageUrl = `/api/conversations/${id}/attachments/${req.file.filename}`;
  res.status(201).json({ imageUrl });
}));

router.get("/conversations/:id/attachments/:filename", authMiddleware, asyncHandler(async (req, res) => {
  const userId = requireUser(req.userId);
  const id = Number(req.params.id);
  const filename = String(req.params.filename ?? "");
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid conversation");
  await memberChat(id, userId);
  const imageUrl = `/api/conversations/${id}/attachments/${filename}`;
  const message = await prisma.chatMessage.findFirst({
    where: { chatId: id, imageUrl, deletedAt: null },
    select: { id: true },
  });
  const filePath = messageAttachmentPath(id, filename);
  if (!message || !filePath) throw new HttpError(404, "Attachment not found");
  res.sendFile(filePath);
}));

router.post("/conversations/:id/messages", authMiddleware, messageRateLimit, validate({ body: messageSchema }), asyncHandler(async (req, res) => {
  const userId = requireUser(req.userId);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid conversation");
  const chat = await memberChat(id, userId);
  const body = req.input?.body as z.infer<typeof messageSchema>;
  const text = body.text ?? "";
  if (body.imageUrl) {
    const filename = body.imageUrl.split("/").at(-1) ?? "";
    const expected = `/api/conversations/${id}/attachments/${filename}`;
    if (body.imageUrl !== expected || !messageAttachmentPath(id, filename)) {
      throw new HttpError(400, "Invalid attachment");
    }
  }
  const recipientId = chat.buyerId === userId ? chat.sellerId : chat.buyerId;
  const message = await prisma.chatMessage.create({
    data: {
      chatId: id,
      senderId: userId,
      text,
      ...(body.imageUrl ? { imageUrl: body.imageUrl } : {}),
    },
  });
  await prisma.chat.update({
    where: { id },
    data: { lastMessage: (text || "Image").slice(0, 180), lastMessageAt: new Date() },
  });
  await createNotification({
    userId: recipientId,
    title: "New message",
    message: `${req.username ?? "Someone"} sent you a message.`,
    type: "MESSAGE",
    channel: "messagesChannel",
    href: `/my-chat/${encodeURIComponent(req.username ?? "")}`,
    dedupeKey: `message:${message.id}`,
  });
  res.status(201).json({
    message: {
      id: message.id,
      senderId: message.senderId,
      text: message.text,
      imageUrl: message.imageUrl,
      isRead: message.isRead,
      createdAt: message.createdAt,
    },
  });
}));

router.patch("/conversations/:id/read", authMiddleware, asyncHandler(async (req, res) => {
  const userId = requireUser(req.userId);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid conversation");
  await memberChat(id, userId);
  const result = await prisma.chatMessage.updateMany({
    where: { chatId: id, senderId: { not: userId }, isRead: false, deletedAt: null },
    data: { isRead: true },
  });
  res.status(200).json({ updated: result.count });
}));

router.delete("/messages/:id", authMiddleware, asyncHandler(async (req, res) => {
  const userId = requireUser(req.userId);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid message");
  const message = await prisma.chatMessage.findFirst({
    where: { id, senderId: userId, deletedAt: null },
    select: { id: true, chatId: true },
  });
  if (!message) throw new HttpError(404, "Message not found");
  await memberChat(message.chatId, userId);
  await prisma.chatMessage.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  res.status(200).json({ message: "Message deleted" });
}));

export default router;
