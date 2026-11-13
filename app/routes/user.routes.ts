import { Router } from "express";
import bcrypt from "bcrypt";
import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import type { Prisma } from "../../generator/prisma/client.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { passwordSchema } from "../../lib/password.js";
import { accountUserSelect, toPublicProfile } from "../../lib/sanitize.js";
import { issueSession, revokeAllRefreshTokens } from "../../lib/session.js";
import { setSessionCookies, clearSessionCookies } from "../../lib/cookies.js";
import { rememberSwitcherAccount } from "../../lib/account-switcher.js";
import { createNotification } from "../../lib/notify.js";
import { decryptSecret, encryptSecret, generateTotpSecret, otpauthUrl, verifyTotp } from "../../lib/totp.js";
import { getActiveSubscription, planSummary } from "../../lib/premium.js";
import authMiddleware, { optionalAuth, requireAdmin } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { authRateLimit } from "../middleware/rate-limit.middleware.js";
import { BACKEND_LOCALES } from "../../lib/i18n/locales.js";

const router = Router();

const channelSchema = z.union([z.literal(1), z.literal(2)]);
const languageSchema = z.enum(
  BACKEND_LOCALES as unknown as [string, ...string[]],
);

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  username: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9._-]+$/).optional(),
  email: z.string().trim().email().max(120).optional(),
  mobileNumber: z.string().trim().refine((value) => isValidPhoneNumber(value), {
    message: "Invalid mobile number",
  }).optional(),
  region: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(500).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No changes provided" });

const preferenceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: languageSchema.optional(),
  emailSummary: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  mobileVisibility: z.enum(["Everyone", "Just Me"]).optional(),
  emailVisibility: z.enum(["Everyone", "Just Me"]).optional(),
  cityVisibility: z.enum(["Everyone", "Just Me"]).optional(),
  allowDirectMessages: z.boolean().optional(),
  bannedUsernames: z.array(z.string().trim().min(3).max(20)).max(100).optional(),
  messagesChannel: channelSchema.optional(),
  offersChannel: channelSchema.optional(),
  adStatusChannel: channelSchema.optional(),
  securityChannel: channelSchema.optional(),
  reviewsChannel: channelSchema.optional(),
  priceDropsChannel: channelSchema.optional(),
  recommendationsChannel: channelSchema.optional(),
  reportsChannel: channelSchema.optional(),
  subscriptionChannel: channelSchema.optional(),
});

const withPremium = async (userId: number) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: accountUserSelect,
  });
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  const subscription = await getActiveSubscription(userId);
  return {
    ...user,
    premium: Boolean(subscription),
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          startsAt: subscription.startsAt,
          endsAt: subscription.endsAt,
          cancelledAt: subscription.cancelledAt,
          autoRenew: subscription.autoRenew,
          plan: planSummary(subscription.plan),
        }
      : null,
  };
};

router.get("/me", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  res.status(200).json({ user: await withPremium(req.userId) });
}));

router.patch("/me", authMiddleware, validate({ body: profileSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof profileSchema>;
  const data = {
    ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
    ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
    ...(body.username !== undefined ? { username: body.username } : {}),
    ...(body.email !== undefined ? { email: body.email.toLowerCase(), verifiedEmail: false } : {}),
    ...(body.mobileNumber !== undefined ? { mobileNumber: body.mobileNumber, verifiedMobilePhone: false } : {}),
    ...(body.region !== undefined ? { region: body.region } : {}),
    ...(body.city !== undefined ? { city: body.city } : {}),
    ...(body.bio !== undefined ? { bio: body.bio } : {}),
  };
  const user = await prisma.users.update({
    where: { id: req.userId },
    data,
    select: accountUserSelect,
  });
  res.status(200).json({ message: "Profile updated", user });
}));

const passwordChangeSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

router.patch("/me/password", authMiddleware, authRateLimit, validate({ body: passwordChangeSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof passwordChangeSchema>;
  const user = await prisma.users.findUnique({
    where: { id: req.userId },
    select: { passwordHash: true },
  });
  if (!user || !user.passwordHash || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect");
  }
  const updated = await prisma.users.update({
    where: { id: req.userId },
    data: {
      passwordHash: await bcrypt.hash(body.newPassword, 12),
      tokenVersion: { increment: 1 },
    },
    select: { id: true, username: true, role: true, tokenVersion: true },
  });
  await revokeAllRefreshTokens(req.userId);
  const session = await issueSession({
    ...updated,
    username: updated.username ?? "user",
  });
  setSessionCookies(res, session);
  await rememberSwitcherAccount(req, res, req.userId, session.refreshToken);
  await createNotification({
    userId: req.userId,
    title: "Password changed",
    message: "Your account password was changed.",
    type: "SECURITY",
    channel: "securityChannel",
    dedupeKey: `password-change:${Date.now()}`,
  });
  res.status(200).json({ message: "Password updated" });
}));

const deleteSchema = z.object({ confirm: z.literal("DELETE") });

router.delete("/me", authMiddleware, validate({ body: deleteSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const user = await prisma.users.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });
  if (user?.role === "OWNER") {
    const owners = await prisma.users.count({ where: { role: "OWNER", deletedAt: null } });
    if (owners <= 1) {
      throw new HttpError(409, "The final owner account cannot be removed");
    }
  }
  await prisma.users.update({
    where: { id: req.userId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
  });
  await revokeAllRefreshTokens(req.userId);
  clearSessionCookies(res);
  res.status(200).json({ message: "Account deleted" });
}));

router.get("/me/preferences", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const preference = await prisma.userPreference.upsert({
    where: { userId: req.userId },
    update: {},
    create: { userId: req.userId },
  });
  res.status(200).json({ preference });
}));

router.put("/me/preferences", authMiddleware, validate({ body: preferenceSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof preferenceSchema>;
  const preferenceData = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  );
  const preference = await prisma.userPreference.upsert({
    where: { userId: req.userId },
    update: preferenceData as Prisma.UserPreferenceUncheckedUpdateInput,
    create: {
      ...(preferenceData as Prisma.UserPreferenceUncheckedCreateInput),
      userId: req.userId,
    },
  });
  res.status(200).json({ message: "Preferences saved", preference });
}));

router.get("/users/:username", optionalAuth, asyncHandler(async (req, res) => {
  const username = String(req.params.username ?? "");
  const user = await prisma.users.findFirst({
    where: { username, deletedAt: null, isActive: true },
    select: accountUserSelect,
  });
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  const preference = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { mobileVisibility: true, emailVisibility: true, cityVisibility: true },
  });
  const subscription = await getActiveSubscription(user.id);
  res.status(200).json({
    user: {
      ...toPublicProfile(user, preference, req.userId),
      premium: Boolean(subscription),
    },
  });
}));

const userQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get("/get-users", authMiddleware, requireAdmin, validate({ query: userQuerySchema }), asyncHandler(async (req, res) => {
  const query = req.input?.query as z.infer<typeof userQuerySchema>;
  const where = {
    deletedAt: null,
    ...(query.q
      ? {
          OR: [
            { username: { contains: query.q, mode: "insensitive" as const } },
            { email: { contains: query.q, mode: "insensitive" as const } },
            { mobileNumber: { contains: query.q } },
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

const twoFactorCodeSchema = z.object({
  currentPassword: passwordSchema,
  code: z.string().regex(/^\d{6}$/),
});

router.post("/me/2fa/setup", authMiddleware, authRateLimit, asyncHandler(async (req, res) => {
  if (!req.userId || !req.username) throw new HttpError(401, "Unauthorized");
  const user = await prisma.users.findUnique({ where: { id: req.userId }, select: { is2FAEnabled: true } });
  if (!user) throw new HttpError(401, "Unauthorized");
  if (user.is2FAEnabled) throw new HttpError(409, "Two-factor authentication is already enabled");
  const secret = generateTotpSecret();
  await prisma.users.update({
    where: { id: req.userId },
    data: { totpSecret: encryptSecret(secret), is2FAEnabled: false },
  });
  res.status(200).json({ secret, otpauthUrl: otpauthUrl(req.username, secret) });
}));

router.post("/me/2fa/enable", authMiddleware, authRateLimit, validate({ body: twoFactorCodeSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof twoFactorCodeSchema>;
  const user = await prisma.users.findUnique({ where: { id: req.userId } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect");
  }
  if (user.is2FAEnabled) throw new HttpError(409, "Two-factor authentication is already enabled");
  const secret = user.totpSecret ? decryptSecret(user.totpSecret) : "";
  if (!secret || !verifyTotp(secret, body.code)) throw new HttpError(400, "Invalid authenticator code");
  await prisma.users.update({ where: { id: user.id }, data: { is2FAEnabled: true } });
  res.status(200).json({ message: "Two-factor authentication enabled", is2FAEnabled: true });
}));

router.post("/me/2fa/disable", authMiddleware, authRateLimit, validate({ body: twoFactorCodeSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof twoFactorCodeSchema>;
  const user = await prisma.users.findUnique({ where: { id: req.userId } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect");
  }
  const secret = user.totpSecret ? decryptSecret(user.totpSecret) : "";
  if (!user.is2FAEnabled || !secret || !verifyTotp(secret, body.code)) {
    throw new HttpError(400, "Invalid authenticator code");
  }
  const updated = await prisma.users.update({
    where: { id: user.id },
    data: { is2FAEnabled: false, totpSecret: null, tokenVersion: { increment: 1 } },
  });
  await revokeAllRefreshTokens(user.id);
  const session = await issueSession({
    ...updated,
    username: updated.username ?? "user",
  });
  const safeUser = await withPremium(updated.id);
  setSessionCookies(res, session);
  await rememberSwitcherAccount(req, res, user.id, session.refreshToken);
  await createNotification({
    userId: user.id,
    title: "Two-factor authentication disabled",
    message: "Authenticator protection was turned off.",
    type: "SECURITY",
    channel: "securityChannel",
    dedupeKey: `2fa-disabled:${user.id}:${Date.now()}`,
  });
  res.status(200).json({
    message: "Two-factor authentication disabled",
    is2FAEnabled: false,
    user: safeUser,
  });
}));

export default router;
