import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { writeAudit } from "../../lib/notify.js";
import authMiddleware, { optionalAuth, requireAdmin } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { contactRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

const clean = (value: string) => value.replace(/[\u0000-\u001F\u007F]/g, "").trim();

const contactSchema = z.object({
  name: z.string().trim().min(2).max(80).transform(clean),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  subject: z.string().trim().min(3).max(120).transform(clean),
  message: z.string().trim().min(10).max(2000).transform(clean),
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["new", "read", "resolved"]).optional(),
});

const statusSchema = z.object({
  status: z.enum(["READ", "RESOLVED", "NEW"]),
});

router.post("/contact", optionalAuth, contactRateLimit, validate({ body: contactSchema }), asyncHandler(async (req, res) => {
  const body = req.input?.body as z.infer<typeof contactSchema>;
  const recent = await prisma.contactMessage.findFirst({
    where: {
      email: body.email,
      subject: body.subject,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (recent) throw new HttpError(409, "This message was already sent");
  const message = await prisma.contactMessage.create({
    data: {
      name: body.name,
      email: body.email,
      subject: body.subject,
      message: body.message,
      ...(req.userId ? { userId: req.userId } : {}),
    },
  });
  res.status(201).json({
    message: {
      id: message.id,
      subject: message.subject,
      status: message.status,
      createdAt: message.createdAt,
    },
  });
}));

router.use("/admin/contact", authMiddleware, requireAdmin);

router.get("/admin/contact", validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const where = query.status ? { status: query.status.toUpperCase() as "NEW" | "READ" | "RESOLVED" } : {};
  const [total, messages] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, username: true } },
      },
    }),
  ]);
  res.status(200).json({ messages, total, page: query.page, limit: query.limit });
}));

router.patch("/admin/contact/:id", validate({ body: statusSchema }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid message");
  const body = req.input?.body as z.infer<typeof statusSchema>;
  const existing = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Message not found");
  const message = await prisma.contactMessage.update({
    where: { id },
    data: { status: body.status },
    select: { id: true, status: true, subject: true },
  });
  if (req.userId) {
    await writeAudit({ actorId: req.userId, action: "UPDATE_CONTACT", targetType: "CONTACT", targetId: String(id) });
  }
  res.status(200).json({ message });
}));

router.delete("/admin/contact/:id", validate({ body: z.object({ confirm: z.literal(true) }) }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid message");
  const existing = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Message not found");
  await prisma.contactMessage.delete({ where: { id } });
  if (req.userId) {
    await writeAudit({ actorId: req.userId, action: "DELETE_CONTACT", targetType: "CONTACT", targetId: String(id) });
  }
  res.status(200).json({ message: "Message deleted" });
}));

export default router;
