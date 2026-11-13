import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../../generator/prisma/client.js";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { accountUserSelect } from "../../lib/sanitize.js";
import { revokeAllRefreshTokens } from "../../lib/session.js";
import { createNotification, writeAudit } from "../../lib/notify.js";
import { expireEntitlements, featuredSubscriptionWhere, usersWithFeaturedPlacement } from "../../lib/premium.js";
import authMiddleware, { requireAdmin, requireOwner } from "../middleware/auth.middleware.js";
import adminMiddleware from "../middleware/admin.middleware.js";
import ownerMiddleware from "../middleware/owner.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { unlinkOwnedAvatar, unlinkOwnedImages } from "../../lib/uploads.js";

const router = Router();
router.use((req, res, next) => {
  const path = req.path;
  const owned = path.startsWith("/admin") || path === "/get-all-admin" || path === "/set-admin" || path === "/delete-admin";
  if (!owned) {
    next();
    return;
  }
  authMiddleware(req, res, next);
});

const pageSchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  role: z.enum(["USER", "ADMIN", "OWNER"]).optional(),
  status: z.enum(["active", "inactive", "featured", "pending", "resolved", "dismissed", "reviewing"]).optional(),
  targetType: z.enum(["AD", "USER", "MESSAGE", "COMMENT", "REVIEW"]).optional(),
});

const confirmSchema = z.object({
  userId: z.number().int().positive(),
  confirm: z.literal(true),
});

const actorId = (req: { userId?: number }) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  return req.userId;
};

router.get("/get-all-admin", adminMiddleware, asyncHandler(async (_req, res) => {
  const admins = await prisma.admin.findMany({
    include: { user: { select: accountUserSelect } },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ admins });
}));

router.patch("/set-admin", ownerMiddleware, validate({ body: confirmSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const body = req.input?.body as z.infer<typeof confirmSchema>;
  const target = await prisma.users.findUnique({ where: { id: body.userId }, select: accountUserSelect });
  if (!target || target.role === "OWNER") throw new HttpError(404, "Eligible user not found");
  if (target.role === "ADMIN") {
    res.status(200).json({ message: "User is already an administrator", user: target });
    return;
  }
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.users.update({
      where: { id: target.id },
      data: { role: "ADMIN", tokenVersion: { increment: 1 } },
      select: accountUserSelect,
    });
    await tx.admin.upsert({
      where: { userId: target.id },
      update: { isActive: true, role: "ADMIN" },
      create: { userId: target.id, role: "ADMIN", isActive: true },
    });
    return updated;
  });
  await revokeAllRefreshTokens(target.id);
  await writeAudit({ actorId: actor, action: "PROMOTE_ADMIN", targetType: "USER", targetId: String(target.id) });
  await createNotification({
    userId: target.id,
    title: "Administrator access granted",
    message: "An owner granted you administrator access.",
    type: "SECURITY",
    channel: "securityChannel",
    dedupeKey: `promote:${target.id}:${Date.now()}`,
  });
  res.status(200).json({ message: "User set as admin successfully", user });
}));

router.delete("/delete-admin", ownerMiddleware, validate({ body: confirmSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const body = req.input?.body as z.infer<typeof confirmSchema>;
  const target = await prisma.users.findUnique({ where: { id: body.userId }, select: { id: true, role: true } });
  if (!target || target.role !== "ADMIN") throw new HttpError(404, "Administrator not found");
  const user = await prisma.$transaction(async (tx) => {
    await tx.admin.deleteMany({ where: { userId: target.id } });
    return tx.users.update({
      where: { id: target.id },
      data: { role: "USER", tokenVersion: { increment: 1 } },
      select: accountUserSelect,
    });
  });
  await revokeAllRefreshTokens(target.id);
  await writeAudit({ actorId: actor, action: "REVOKE_ADMIN", targetType: "USER", targetId: String(target.id) });
  res.status(200).json({ message: "Administrator access revoked", user });
}));

router.get("/admin/stats", requireAdmin, asyncHandler(async (_req, res) => {
  await expireEntitlements();
  const now = new Date();
  const [users, administrators, advertisements, activeAds, inactiveAds, featuredAds, messages, comments, reviews, subscriptions, reportGroups, paymentGroups] = await Promise.all([
    prisma.users.count({ where: { deletedAt: null } }),
    prisma.users.count({ where: { role: { in: ["ADMIN", "OWNER"] }, deletedAt: null } }),
    prisma.ads.count({ where: { isDeleted: false } }),
    prisma.ads.count({ where: { isDeleted: false, isActive: true } }),
    prisma.ads.count({ where: { isDeleted: false, isActive: false } }),
    prisma.ads.count({
      where: {
        isDeleted: false,
        isActive: true,
        users: { subscriptions: { some: featuredSubscriptionWhere(now) } },
      },
    }),
    prisma.chatMessage.count(),
    prisma.comment.count(),
    prisma.review.count(),
    prisma.userSubscription.count({ where: { status: "ACTIVE", endsAt: { gt: now } } }),
    prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const reports = Object.fromEntries(reportGroups.map((group) => [group.status, group._count._all]));
  const payments = paymentGroups.map((group) => ({
    status: group.status,
    count: group._count._all,
    amount: group._sum.amount?.toString() ?? "0",
  }));
  res.status(200).json({
    stats: {
      users,
      administrators,
      advertisements,
      activeAds,
      inactiveAds,
      featuredAds,
      messages,
      comments,
      reviews,
      premiumSubscriptions: subscriptions,
      reports,
      payments,
    },
  });
}));

router.get("/admin/trends", requireAdmin, asyncHandler(async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [ads, users, reports] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; count: number }>>(Prisma.sql`SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count FROM ads WHERE created_at >= ${since} AND is_deleted = false GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<Array<{ day: Date; count: number }>>(Prisma.sql`SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count FROM users WHERE created_at >= ${since} AND deleted_at IS NULL GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<Array<{ day: Date; count: number }>>(Prisma.sql`SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count FROM reports WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`),
  ]);
  const normalize = (rows: Array<{ day: Date; count: number }>) => rows.map((row) => ({ day: row.day, count: Number(row.count) }));
  res.status(200).json({ ads: normalize(ads), users: normalize(users), reports: normalize(reports) });
}));

router.get("/admin/users", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const where: Prisma.UsersWhereInput = {
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status === "active" ? { isActive: true } : {}),
    ...(query.status === "inactive" ? { isActive: false } : {}),
    ...(query.q
      ? {
          OR: [
            { username: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
            { mobileNumber: { contains: query.q } },
            { firstName: { contains: query.q, mode: "insensitive" } },
            { lastName: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, users] = await Promise.all([
    prisma.users.count({ where }),
    prisma.users.findMany({
      where,
      select: {
        ...accountUserSelect,
        _count: { select: { ads: true, reportsFiled: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  res.status(200).json({ users, total, page: query.page, limit: query.limit });
}));

router.get("/admin/users/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      ...accountUserSelect,
      ads: { where: { isDeleted: false }, select: { id: true, adName: true, isActive: true }, take: 20 },
      reportsFiled: { select: { id: true, status: true, targetType: true, reason: true }, take: 20, orderBy: { createdAt: "desc" } },
    },
  });
  if (!user) throw new HttpError(404, "User not found");
  res.status(200).json({ user });
}));

const statusSchema = z.object({ isActive: z.boolean(), confirm: z.literal(true) });

router.patch("/admin/users/:id/status", requireAdmin, validate({ body: statusSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  const body = req.input?.body as z.infer<typeof statusSchema>;
  const target = await prisma.users.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) throw new HttpError(404, "User not found");
  if (target.id === actor) throw new HttpError(409, "You cannot change your own status");
  if (target.role === "OWNER" && req.role !== "OWNER") throw new HttpError(403, "Forbidden");
  if (target.role === "OWNER" && !body.isActive) {
    const owners = await prisma.users.count({ where: { role: "OWNER", isActive: true, deletedAt: null } });
    if (owners <= 1) throw new HttpError(409, "The final owner cannot be disabled");
  }
  const user = await prisma.users.update({
    where: { id },
    data: { isActive: body.isActive, tokenVersion: { increment: 1 } },
    select: accountUserSelect,
  });
  await revokeAllRefreshTokens(id);
  await writeAudit({ actorId: actor, action: body.isActive ? "ACTIVATE_USER" : "SUSPEND_USER", targetType: "USER", targetId: String(id) });
  res.status(200).json({ user });
}));

router.delete("/admin/users/:id", requireAdmin, validate({ body: z.object({ confirm: z.literal(true) }) }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid user");
  const target = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      username: true,
      avatarUrl: true,
      deletedAt: true,
      ads: { select: { id: true, images: true } },
    },
  });
  if (!target || target.deletedAt) throw new HttpError(404, "User not found");
  if (target.id === actor) throw new HttpError(409, "You cannot delete your own account here");
  if (target.role === "OWNER") throw new HttpError(403, "Owner accounts cannot be deleted");
  if (target.role === "ADMIN" && req.role !== "OWNER") throw new HttpError(403, "Forbidden");
  await prisma.$transaction([
    prisma.ads.updateMany({ where: { userId: id }, data: { isDeleted: true, isActive: false } }),
    prisma.users.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date(), tokenVersion: { increment: 1 }, avatarUrl: null },
    }),
  ]);
  await revokeAllRefreshTokens(id);
  await unlinkOwnedAvatar(target.avatarUrl, target.username ?? "").catch((error) => {
    console.error(error instanceof Error ? error.message : "Avatar cleanup failed");
  });
  for (const ad of target.ads) {
    await unlinkOwnedImages(ad.images, target.username, ad.id);
  }
  await writeAudit({ actorId: actor, action: "DELETE_USER", targetType: "USER", targetId: String(id) });
  res.status(200).json({ message: "Account deleted" });
}));

router.get("/admin/admins", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const where: Prisma.UsersWhereInput = {
    role: query.role === "OWNER" || query.role === "ADMIN" ? query.role : { in: ["ADMIN", "OWNER"] },
    deletedAt: null,
    ...(query.status === "active" ? { isActive: true } : {}),
    ...(query.status === "inactive" ? { isActive: false } : {}),
    ...(query.q
      ? {
          OR: [
            { username: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, users] = await Promise.all([
    prisma.users.count({ where }),
    prisma.users.findMany({
      where,
      select: accountUserSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  res.status(200).json({ users, total, page: query.page, limit: query.limit });
}));

router.post("/admin/roles/promote", requireOwner, validate({ body: confirmSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const body = req.input?.body as z.infer<typeof confirmSchema>;
  const target = await prisma.users.findUnique({ where: { id: body.userId }, select: { id: true, role: true, isActive: true } });
  if (!target || !target.isActive || target.role !== "USER") throw new HttpError(404, "Eligible user not found");
  await prisma.$transaction([
    prisma.users.update({ where: { id: target.id }, data: { role: "ADMIN", tokenVersion: { increment: 1 } } }),
    prisma.admin.upsert({
      where: { userId: target.id },
      update: { isActive: true, role: "ADMIN" },
      create: { userId: target.id, role: "ADMIN", isActive: true },
    }),
  ]);
  await revokeAllRefreshTokens(target.id);
  await writeAudit({ actorId: actor, action: "PROMOTE_ADMIN", targetType: "USER", targetId: String(target.id) });
  res.status(200).json({ message: "Administrator access granted" });
}));

router.post("/admin/roles/demote", requireOwner, validate({ body: confirmSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const body = req.input?.body as z.infer<typeof confirmSchema>;
  const target = await prisma.users.findUnique({ where: { id: body.userId }, select: { id: true, role: true } });
  if (!target || target.role !== "ADMIN") throw new HttpError(404, "Administrator not found");
  await prisma.$transaction([
    prisma.admin.deleteMany({ where: { userId: target.id } }),
    prisma.users.update({ where: { id: target.id }, data: { role: "USER", tokenVersion: { increment: 1 } } }),
  ]);
  await revokeAllRefreshTokens(target.id);
  await writeAudit({ actorId: actor, action: "REVOKE_ADMIN", targetType: "USER", targetId: String(target.id) });
  res.status(200).json({ message: "Administrator access revoked" });
}));

router.get("/admin/ads", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const where: Prisma.AdsWhereInput = {
    isDeleted: false,
    ...(query.status === "active" ? { isActive: true } : {}),
    ...(query.status === "inactive" ? { isActive: false } : {}),
    ...(query.status === "featured"
      ? { users: { subscriptions: { some: featuredSubscriptionWhere() } } }
      : {}),
    ...(query.q
      ? {
          OR: [
            { adName: { contains: query.q, mode: "insensitive" } },
            { username: { contains: query.q, mode: "insensitive" } },
            { category: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, ads] = await Promise.all([
    prisma.ads.count({ where }),
    prisma.ads.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        adName: true,
        username: true,
        category: true,
        price: true,
        isActive: true,
        views: true,
        images: true,
        mainImageIndex: true,
        createdAt: true,
        userId: true,
      },
    }),
  ]);
  const placement = await usersWithFeaturedPlacement(ads.map((ad) => ad.userId));
  res.status(200).json({
    ads: ads.map((ad) => ({
      ...ad,
      price: ad.price.toString(),
      featuredPlacement: placement.has(ad.userId),
    })),
    total,
    page: query.page,
    limit: query.limit,
  });
}));

router.get("/admin/ads/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const ad = await prisma.ads.findUnique({
    where: { id },
    include: { users: { select: { id: true, username: true, email: true, role: true } } },
  });
  if (!ad) throw new HttpError(404, "Ad not found");
  res.status(200).json({ ad: { ...ad, price: ad.price.toString() } });
}));

const adStatusSchema = z.object({ isActive: z.boolean(), confirm: z.literal(true) });

router.patch("/admin/ads/:id", requireAdmin, validate({ body: adStatusSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  const body = req.input?.body as z.infer<typeof adStatusSchema>;
  const ad = await prisma.ads.update({
    where: { id },
    data: { isActive: body.isActive },
    select: { id: true, userId: true, adName: true, isActive: true },
  });
  await writeAudit({ actorId: actor, action: body.isActive ? "ACTIVATE_AD" : "DEACTIVATE_AD", targetType: "AD", targetId: String(id) });
  await createNotification({
    userId: ad.userId,
    title: "Advertisement updated",
    message: `${ad.adName} was ${ad.isActive ? "activated" : "deactivated"} by moderation.`,
    type: "AD",
    channel: "adStatusChannel",
    dedupeKey: `moderation-ad:${id}:${ad.isActive}`,
  });
  res.status(200).json({ ad });
}));

router.delete("/admin/ads/:id", requireAdmin, validate({ body: z.object({ confirm: z.literal(true) }) }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  const existing = await prisma.ads.findUnique({
    where: { id },
    select: { id: true, images: true, users: { select: { username: true } } },
  });
  if (!existing) throw new HttpError(404, "Advertisement not found");
  const ad = await prisma.ads.update({
    where: { id },
    data: { isDeleted: true, isActive: false },
    select: { id: true, userId: true, adName: true },
  });
  await unlinkOwnedImages(existing.images, existing.users.username, existing.id);
  await writeAudit({ actorId: actor, action: "DELETE_AD", targetType: "AD", targetId: String(id) });
  await createNotification({
    userId: ad.userId,
    title: "Advertisement removed",
    message: `${ad.adName} was removed by moderation.`,
    type: "WARNING",
    channel: "adStatusChannel",
    dedupeKey: `delete-ad:${id}`,
  });
  res.status(200).json({ message: "Advertisement removed" });
}));

router.get("/admin/reports", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const status = query.status === "pending" || query.status === "resolved" || query.status === "dismissed" || query.status === "reviewing"
    ? query.status.toUpperCase() as "PENDING" | "REVIEWING" | "RESOLVED" | "DISMISSED"
    : undefined;
  const where: Prisma.ReportWhereInput = {
    ...(status ? { status } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
  };
  const [total, reports] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { reporter: { select: { id: true, username: true } } },
    }),
  ]);
  const adIds = reports.filter((report) => report.targetType === "AD").map((report) => report.targetId);
  const userIds = reports.filter((report) => report.targetType === "USER").map((report) => report.targetId);
  const [ads, users] = await Promise.all([
    adIds.length ? prisma.ads.findMany({ where: { id: { in: adIds } }, select: { id: true, adName: true } }) : Promise.resolve([]),
    userIds.length ? prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } }) : Promise.resolve([]),
  ]);
  const adNames = new Map(ads.map((ad) => [ad.id, ad.adName]));
  const usernames = new Map(users.map((user) => [user.id, user.username]));
  res.status(200).json({
    reports: reports.map((report) => ({
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      targetName: report.targetType === "AD" ? adNames.get(report.targetId) ?? null : report.targetType === "USER" ? usernames.get(report.targetId) ?? null : null,
      reason: report.reason,
      description: report.description,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      reporter: report.reporter,
    })),
    total,
    page: query.page,
    limit: query.limit,
  });
}));

router.get("/admin/reports/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const report = await prisma.report.findUnique({
    where: { id },
    include: { reporter: { select: { id: true, username: true } }, resolvedBy: { select: { id: true, username: true } } },
  });
  if (!report) throw new HttpError(404, "Report not found");
  let target: unknown = null;
  if (report.targetType === "AD") {
    target = await prisma.ads.findUnique({ where: { id: report.targetId }, select: { id: true, adName: true, username: true, isActive: true, images: true } });
  } else if (report.targetType === "USER") {
    target = await prisma.users.findUnique({ where: { id: report.targetId }, select: { id: true, username: true, role: true, isActive: true } });
  } else if (report.targetType === "MESSAGE") {
    const message = await prisma.chatMessage.findUnique({
      where: { id: report.targetId },
      select: { id: true, text: true, createdAt: true, sender: { select: { id: true, username: true } } },
    });
    target = message;
  } else if (report.targetType === "COMMENT") {
    target = await prisma.comment.findUnique({ where: { id: report.targetId }, select: { id: true, text: true, adId: true, userId: true } });
  } else if (report.targetType === "REVIEW") {
    target = await prisma.review.findUnique({ where: { id: report.targetId }, select: { id: true, rating: true, text: true, reviewerId: true, reviewedUserId: true } });
  }
  res.status(200).json({ report, target });
}));

const resolveSchema = z.object({
  status: z.enum(["REVIEWING", "RESOLVED", "DISMISSED"]),
  adminNote: z.string().trim().max(1000).optional(),
  confirm: z.literal(true),
});

router.patch("/admin/reports/:id", requireAdmin, validate({ body: resolveSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  const body = req.input?.body as z.infer<typeof resolveSchema>;
  const existing = await prisma.report.findUnique({ where: { id }, select: { id: true, reporterId: true } });
  if (!existing) throw new HttpError(404, "Report not found");
  const report = await prisma.report.update({
    where: { id },
    data: {
      status: body.status,
      ...(body.adminNote !== undefined ? { adminNote: body.adminNote } : {}),
      ...(body.status === "RESOLVED" || body.status === "DISMISSED"
        ? { resolvedById: actor, resolvedAt: new Date() }
        : {}),
    },
  });
  await writeAudit({ actorId: actor, action: `REPORT_${body.status}`, targetType: "REPORT", targetId: String(id) });
  if (body.status === "RESOLVED" || body.status === "DISMISSED") {
    await createNotification({
      userId: existing.reporterId,
      title: "Report updated",
      message: `Your report was ${body.status.toLowerCase()}.`,
      type: "REPORT",
      channel: "reportsChannel",
      dedupeKey: `report-status:${id}:${body.status}`,
    });
  }
  res.status(200).json({ report: { id: report.id, status: report.status, adminNote: report.adminNote, resolvedAt: report.resolvedAt } });
}));

router.get("/admin/comments", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const where: Prisma.CommentWhereInput = {
    isHidden: false,
    ...(query.q ? { text: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const [total, comments] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { user: { select: { id: true, username: true } }, ad: { select: { id: true, adName: true } } },
    }),
  ]);
  res.status(200).json({ comments, total, page: query.page, limit: query.limit });
}));

router.patch("/admin/comments/:id", requireAdmin, validate({ body: z.object({ isHidden: z.boolean(), confirm: z.literal(true) }) }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  const body = req.input?.body as { isHidden: boolean; confirm: true };
  const comment = await prisma.comment.update({ where: { id }, data: { isHidden: body.isHidden } });
  await writeAudit({ actorId: actor, action: body.isHidden ? "HIDE_COMMENT" : "SHOW_COMMENT", targetType: "COMMENT", targetId: String(id) });
  res.status(200).json({ comment });
}));

router.delete("/admin/comments/:id", requireAdmin, validate({ body: z.object({ confirm: z.literal(true) }) }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  await prisma.comment.delete({ where: { id } });
  await writeAudit({ actorId: actor, action: "DELETE_COMMENT", targetType: "COMMENT", targetId: String(id) });
  res.status(200).json({ message: "Comment deleted" });
}));

router.get("/admin/reviews", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const where: Prisma.ReviewWhereInput = query.q ? { text: { contains: query.q, mode: "insensitive" } } : {};
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        reviewer: { select: { id: true, username: true } },
        reviewedUser: { select: { id: true, username: true } },
      },
    }),
  ]);
  res.status(200).json({ reviews, total, page: query.page, limit: query.limit });
}));

router.delete("/admin/reviews/:id", requireAdmin, validate({ body: z.object({ confirm: z.literal(true) }) }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  const review = await prisma.review.delete({ where: { id } });
  if (!review.adId) {
    const aggregate = await prisma.review.aggregate({
      where: { reviewedUserId: review.reviewedUserId, adId: null },
      _avg: { rating: true },
    });
    await prisma.users.update({ where: { id: review.reviewedUserId }, data: { evaluation: aggregate._avg.rating ?? 0 } });
  }
  await writeAudit({ actorId: actor, action: "DELETE_REVIEW", targetType: "REVIEW", targetId: String(id) });
  res.status(200).json({ message: "Review deleted" });
}));

router.get("/admin/subscriptions", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const [total, subscriptions] = await Promise.all([
    prisma.userSubscription.count(),
    prisma.userSubscription.findMany({
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            durationDays: true,
            featuredPlacement: true,
            adLimit: true,
            visibilityBoost: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            amount: true,
            currency: true,
            provider: true,
            providerReference: true,
            paymentMethod: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
  ]);
  res.status(200).json({
    subscriptions: subscriptions.map((item) => {
      const latestPayment = item.payments[0] ?? null;
      return {
        id: item.id,
        status: item.status,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        autoRenew: item.autoRenew,
        cancelledAt: item.cancelledAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        durationDays: item.plan.durationDays,
        planName: item.plan.name,
        amount: item.plan.price.toString(),
        currency: item.plan.currency,
        user: item.user,
        plan: {
          ...item.plan,
          price: item.plan.price.toString(),
        },
        latestPayment: latestPayment
          ? {
              ...latestPayment,
              amount: latestPayment.amount.toString(),
            }
          : null,
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  });
}));

router.get("/admin/payments", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const [total, payments] = await Promise.all([
    prisma.payment.count(),
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        subscription: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                currency: true,
                durationDays: true,
              },
            },
          },
        },
      },
    }),
  ]);
  res.status(200).json({
    payments: payments.map((payment) => {
      const subscription = payment.subscription;
      const plan = subscription?.plan;
      const user = subscription?.user;
      return {
        id: payment.id,
        amount: payment.amount.toString(),
        currency: payment.currency,
        status: payment.status,
        provider: payment.provider,
        providerReference: payment.providerReference,
        providerIntentId: payment.providerIntentId,
        paymentMethod: payment.paymentMethod,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        subscriptionId: payment.subscriptionId,
        subscriptionStatus: subscription?.status ?? null,
        startsAt: subscription?.startsAt ?? null,
        endsAt: subscription?.endsAt ?? null,
        autoRenew: subscription?.autoRenew ?? null,
        cancelledAt: subscription?.cancelledAt ?? null,
        durationDays: plan?.durationDays ?? null,
        planName: plan?.name ?? null,
        planPrice: plan?.price?.toString() ?? null,
        planCurrency: plan?.currency ?? null,
        user: user ?? null,
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  });
}));

const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  price: z.coerce.number().finite().min(0),
  currency: z.string().trim().length(3).default("USD"),
  durationDays: z.number().int().min(1).max(3650),
  isActive: z.boolean().default(true),
  adLimit: z.number().int().min(-1).max(100000).default(50),
  featuredPlacement: z.boolean().default(false),
  visibilityBoost: z.number().int().min(0).max(1000).default(0),
  features: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

router.get("/admin/plans", requireAdmin, asyncHandler(async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: "asc" } });
  res.status(200).json({ plans: plans.map((plan) => ({ ...plan, price: plan.price.toString() })) });
}));

router.post("/admin/plans", requireOwner, validate({ body: planSchema }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const body = req.input?.body as z.infer<typeof planSchema>;
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
      price: body.price,
      currency: body.currency.toUpperCase(),
      durationDays: body.durationDays,
      isActive: body.isActive,
      adLimit: body.adLimit,
      featuredPlacement: body.featuredPlacement,
      visibilityBoost: body.visibilityBoost,
      features: body.features,
    },
  });
  await writeAudit({ actorId: actor, action: "CREATE_PLAN", targetType: "PLAN", targetId: String(plan.id) });
  res.status(201).json({ plan: { ...plan, price: plan.price.toString() } });
}));

router.patch("/admin/plans/:id", requireOwner, validate({ body: planSchema.partial() }), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const id = Number(req.params.id);
  const body = req.input?.body as Partial<z.infer<typeof planSchema>>;
  const plan = await prisma.subscriptionPlan.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.price !== undefined ? { price: body.price } : {}),
      ...(body.currency !== undefined ? { currency: body.currency.toUpperCase() } : {}),
      ...(body.durationDays !== undefined ? { durationDays: body.durationDays } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.adLimit !== undefined ? { adLimit: body.adLimit } : {}),
      ...(body.featuredPlacement !== undefined ? { featuredPlacement: body.featuredPlacement } : {}),
      ...(body.visibilityBoost !== undefined ? { visibilityBoost: body.visibilityBoost } : {}),
      ...(body.features !== undefined ? { features: body.features } : {}),
    },
  });
  await writeAudit({ actorId: actor, action: "UPDATE_PLAN", targetType: "PLAN", targetId: String(id) });
  res.status(200).json({ plan: { ...plan, price: plan.price.toString() } });
}));

const settingValues = {
  registrationEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
  maxImagesPerAd: z.number().int().min(1).max(8),
};

router.get("/admin/settings", requireAdmin, asyncHandler(async (_req, res) => {
  const settings = await prisma.platformSetting.findMany({ orderBy: { key: "asc" } });
  res.status(200).json({ settings });
}));

router.put("/admin/settings/:key", requireOwner, asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const key = String(req.params.key);
  const schema = settingValues[key as keyof typeof settingValues];
  if (!schema) throw new HttpError(404, "Setting not found");
  const parsed = schema.safeParse(req.body?.value);
  if (!parsed.success) throw new HttpError(400, "Invalid setting value");
  const setting = await prisma.platformSetting.upsert({
    where: { key },
    update: { value: parsed.data, updatedById: actor },
    create: { key, value: parsed.data, updatedById: actor },
  });
  await writeAudit({ actorId: actor, action: "UPDATE_SETTING", targetType: "SETTING", targetId: key });
  res.status(200).json({ setting });
}));

router.get("/admin/audit", requireAdmin, validate({ query: pageSchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof pageSchema>;
  const [total, entries] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { actor: { select: { id: true, username: true, role: true } } },
    }),
  ]);
  res.status(200).json({ entries, total, page: query.page, limit: query.limit });
}));

router.get("/admin/categories", requireAdmin, asyncHandler(async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { children: { select: { id: true, name: true, slug: true, isActive: true } } },
  });
  res.status(200).json({ categories });
}));

export default router;
