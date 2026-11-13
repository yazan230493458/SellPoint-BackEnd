import { Router } from "express";
import bcrypt from "bcrypt";
import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { passwordSchema } from "../../lib/password.js";
import { randomInt } from "node:crypto";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { accountUserSelect } from "../../lib/sanitize.js";
import { issueSession, revokeAllRefreshTokens, revokeRefreshToken } from "../../lib/session.js";
import { verifyAccessToken } from "../../lib/jwt.js";
import { createNotification } from "../../lib/notify.js";
import { clearSessionCookies, readCookie, refreshCookieName, setSessionCookies } from "../../lib/cookies.js";
import {
  establishBrowserSession,
  rememberSwitcherAccount,
  removeSwitcherAccount,
} from "../../lib/account-switcher.js";
import { isOpenChallenge, isUsableRecoveryToken, nextFailedAttempt } from "../../lib/challenge-policy.js";
import { decryptSecret, verifyTotp } from "../../lib/totp.js";
import { getActiveSubscription } from "../../lib/premium.js";
import { passwordResetDeliveryConfigured, sendPasswordResetEmail } from "../../lib/mail.js";
import { oauthHandoffHash } from "../../lib/oauth-login.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { authRateLimit, recoveryRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

const identifierSchema = z.object({
  identifier: z.string().trim().min(3).max(100).optional(),
  username: z.string().trim().min(3).max(20).optional(),
  email: z.string().trim().email().optional(),
  mobileNumber: z.string().trim().min(8).max(20).optional(),
  password: passwordSchema,
}).refine((value) => Boolean(value.identifier || value.username || value.email || value.mobileNumber), {
  message: "An account identifier is required",
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9._-]+$/),
  email: z.string().trim().email().max(120),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  mobileNumber: z.string().trim().refine(
    (value) =>
      /^\+[1-9]\d{1,14}$/.test(value) &&
      isValidPhoneNumber(value),
    { message: "Invalid mobile number" },
  ),
  region: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  password: passwordSchema,
  acceptTerms: z.literal(true, { message: "You must accept the terms and conditions" }),
});

const sessionIdentity = (user: {
  id: number;
  username: string | null;
  email?: string | null;
  role: string;
  tokenVersion: number;
}) => ({
  id: user.id,
  username: user.username ?? user.email ?? `user-${user.id}`,
  role: user.role,
  tokenVersion: user.tokenVersion,
});

const sessionUser = async (userId: number) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: accountUserSelect,
  });
  if (!user) {
    throw new HttpError(401, "Invalid token");
  }
  const subscription = await getActiveSubscription(user.id);
  return {
    ...user,
    premium: Boolean(subscription),
  };
};

router.get("/me", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const user = await sessionUser(req.userId);

  res.status(200).json({
    message: "Session retrieved",
    user: user
  });
}));

router.post("/log-in", authRateLimit, validate({ body: identifierSchema }), asyncHandler(async (req, res) => {
  const body = req.input?.body as z.infer<typeof identifierSchema>;
  const identifier = body.identifier ?? body.username ?? body.email ?? body.mobileNumber ?? "";
  const user = await prisma.users.findFirst({
    where: {
      deletedAt: null,
      OR: [{ username: identifier }, { email: identifier.toLowerCase() }, { mobileNumber: identifier }],
    },
  });

  const valid = user?.passwordHash ? await bcrypt.compare(body.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new HttpError(400, "Invalid credentials");
  }
  if (!user.isActive) {
    throw new HttpError(403, "Account is disabled");
  }

  if (user.is2FAEnabled) {
    if (!user.totpSecret) throw new HttpError(403, "Two-factor authentication is not enrolled");
    const challengeToken = randomToken();
    await prisma.loginChallenge.create({
      data: {
        userId: user.id,
        tokenHash: sha256(challengeToken),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    res.status(200).json({
      twoFactorRequired: true,
      challengeToken,
      message: "Two-factor authentication is required",
    });
    return;
  }

  await establishBrowserSession(req, res, sessionIdentity(user));
  const safeUser = await sessionUser(user.id);
  res.status(200).json({ message: "Login successful", user: safeUser });
}));

router.post("/register", authRateLimit, validate({ body: registerSchema }), asyncHandler(async (req, res) => {
  const body = req.input?.body as z.infer<typeof registerSchema>;
  const existing = await prisma.users.findFirst({
    where: {
      OR: [{ username: body.username }, { email: body.email }, { mobileNumber: body.mobileNumber }],
    },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(409, "User already exists");
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.users.create({
    data: {
      username: body.username,
      email: body.email.toLowerCase(),
      firstName: body.firstName,
      lastName: body.lastName,
      mobileNumber: body.mobileNumber,
      region: body.region,
      city: body.city,
      passwordHash,
      role: "USER",
      evaluation: 0,
      acceptTerms: true,
      preference: { create: {} },
    },
  });

  await establishBrowserSession(req, res, sessionIdentity(user));
  const safeUser = await sessionUser(user.id);
  res.status(201).json({ message: "User registered successfully", user: safeUser });
}));

router.post("/log-out", authMiddleware, asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || readCookie(req.headers.cookie, "sp_access");
  if (!token || !req.userId) {
    throw new HttpError(401, "Unauthorized");
  }
  const decoded = verifyAccessToken(token);
  await prisma.revokedAccessToken.upsert({
    where: { jti: decoded.jti },
    update: { expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000) },
    create: {
      jti: decoded.jti,
      userId: req.userId,
      expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : readCookie(req.headers.cookie, refreshCookieName);
  if (refreshToken) {
    await revokeRefreshToken(refreshToken, req.userId);
  }
  // Drop this account from the device switcher; other saved accounts stay.
  await removeSwitcherAccount(req, res, req.userId).catch(() => undefined);
  clearSessionCookies(res);
  res.status(200).json({ message: "Logged out" });
}));

const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200).optional() });

router.post("/refresh", authRateLimit, validate({ body: refreshSchema }), asyncHandler(async (req, res) => {
  const body = req.input?.body as z.infer<typeof refreshSchema>;
  const refreshToken = readCookie(req.headers.cookie, refreshCookieName) || body.refreshToken || "";
  if (!refreshToken) throw new HttpError(401, "Invalid token");
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: {
      user: {
        select: { id: true, username: true, role: true, tokenVersion: true, isActive: true, deletedAt: true },
      },
    },
  });

  if (!stored || stored.revokedAt || stored.expiresAt <= new Date() || !stored.user.isActive || stored.user.deletedAt) {
    throw new HttpError(401, "Invalid token");
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  const session = await issueSession(sessionIdentity(stored.user));
  const safeUser = await sessionUser(stored.user.id);
  setSessionCookies(res, session);
  await rememberSwitcherAccount(req, res, stored.user.id, session.refreshToken);
  res.status(200).json({ message: "Session renewed", user: safeUser });
}));

const oauthHandoffSchema = z.object({
  code: z.string().trim().min(20).max(200),
});

router.post(
  "/auth/oauth/complete",
  authRateLimit,
  validate({ body: oauthHandoffSchema }),
  asyncHandler(async (req, res) => {
    const body = req.input?.body as z.infer<typeof oauthHandoffSchema>;
    const handoff = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: oauthHandoffHash(body.code) },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            tokenVersion: true,
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!isUsableRecoveryToken(handoff) || !handoff.user || handoff.user.deletedAt) {
      throw new HttpError(400, "Invalid or expired verification challenge");
    }
    if (!handoff.user.isActive) {
      throw new HttpError(403, "Account is disabled");
    }

    await prisma.passwordResetToken.update({
      where: { id: handoff.id },
      data: { usedAt: new Date() },
    });

    await establishBrowserSession(req, res, sessionIdentity(handoff.user));
    const safeUser = await sessionUser(handoff.user.id);
    res.status(200).json({ message: "Login successful", user: safeUser });
  }),
);

const twoFactorLoginSchema = z.object({
  challengeToken: z.string().min(20).max(200),
  code: z.string().regex(/^\d{6}$/),
});

router.post("/log-in/2fa", authRateLimit, validate({ body: twoFactorLoginSchema }), asyncHandler(async (req, res) => {
  const body = req.input?.body as z.infer<typeof twoFactorLoginSchema>;
  const challenge = await prisma.loginChallenge.findUnique({
    where: { tokenHash: sha256(body.challengeToken) },
    include: { user: true },
  });
  if (!isOpenChallenge(challenge)) {
    throw new HttpError(400, "Invalid or expired verification challenge");
  }
  const secret = challenge.user.totpSecret ? decryptSecret(challenge.user.totpSecret) : "";
  if (!secret || !verifyTotp(secret, body.code)) {
    const failed = nextFailedAttempt(challenge.attempts);
    await prisma.loginChallenge.update({
      where: { id: challenge.id },
      data: { attempts: failed.attempts, ...(failed.consumed ? { consumedAt: new Date() } : {}) },
    });
    throw new HttpError(400, "Invalid or expired verification challenge");
  }
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });
  if (!challenge.user.isActive || challenge.user.deletedAt) throw new HttpError(403, "Account is disabled");
  await establishBrowserSession(req, res, sessionIdentity(challenge.user));
  const safeUser = await sessionUser(challenge.user.id);
  res.status(200).json({ message: "Login successful", user: safeUser });
}));

const forgotSchema = z.object({
  email: z.string().trim().email().max(120),
});

router.post("/password/forgot", recoveryRateLimit, validate({ body: forgotSchema }), asyncHandler(async (req, res) => {
  const body = req.input?.body as z.infer<typeof forgotSchema>;
  const email = body.email.toLowerCase();
  const generic = {
    message: "If an account with that email exists and delivery succeeds, a password reset message will arrive shortly.",
    deliveryConfigured: true,
  };
  if (!passwordResetDeliveryConfigured()) {
    res.status(503).json({
      message: "Password recovery email is not configured.",
      deliveryConfigured: false,
    });
    return;
  }
  const user = await prisma.users.findFirst({
    where: { email, deletedAt: null, isActive: true },
    select: { id: true, email: true },
  });
  if (!user) {
    res.status(200).json(generic);
    return;
  }
  const token = randomToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    }),
  ]);
  try {
    await sendPasswordResetEmail(user.email, token);
  } catch {
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    console.error("Password reset email delivery failed");
    res.status(200).json(generic);
    return;
  }
  res.status(200).json(generic);
}));

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

router.post("/password/reset", recoveryRateLimit, validate({ body: resetSchema }), asyncHandler(async (req, res) => {
  const body = req.input?.body as z.infer<typeof resetSchema>;
  const tokenHash = sha256(body.token);
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!isUsableRecoveryToken(stored)) {
    throw new HttpError(400, "Invalid or expired recovery token");
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const reset = await prisma.$transaction(async (tx) => {
    const current = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!isUsableRecoveryToken(current)) return null;
    const account = await tx.users.findFirst({
      where: { id: current.userId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!account) return null;
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: current.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return null;
    await tx.users.update({
      where: { id: account.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { userId: account.id, tokenId: current.id };
  });
  if (!reset) throw new HttpError(400, "Invalid or expired recovery token");
  await revokeAllRefreshTokens(reset.userId);
  clearSessionCookies(res);
  await createNotification({
    userId: reset.userId,
    title: "Password changed",
    message: "Your password was reset.",
    type: "SECURITY",
    channel: "securityChannel",
    dedupeKey: `password-reset:${reset.tokenId}`,
  });
  res.status(200).json({ message: "Password updated" });
}));

const verificationRequestSchema = z.object({
  channel: z.enum(["EMAIL", "MOBILE"]),
});

router.post("/verification/request", authMiddleware, recoveryRateLimit, validate({ body: verificationRequestSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) {
    throw new HttpError(401, "Unauthorized");
  }
  const configured = req.input?.body && (req.input.body as { channel: "EMAIL" | "MOBILE" }).channel === "EMAIL"
    ? Boolean(process.env.SMTP_HOST)
    : Boolean(process.env.SMS_PROVIDER);
  if (!configured) {
    res.status(200).json({
      message: "Verification delivery is not configured.",
      deliveryConfigured: false,
    });
    return;
  }

  const code = String(randomInt(100000, 1000000));
  const body = req.input?.body as z.infer<typeof verificationRequestSchema>;
  await prisma.verificationChallenge.create({
    data: {
      userId: req.userId,
      channel: body.channel,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  res.status(200).json({ message: "Verification code created.", deliveryConfigured: true });
}));

const verificationConfirmSchema = z.object({
  channel: z.enum(["EMAIL", "MOBILE"]),
  code: z.string().regex(/^\d{6}$/),
});

router.post("/verification/confirm", authMiddleware, recoveryRateLimit, validate({ body: verificationConfirmSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) {
    throw new HttpError(401, "Unauthorized");
  }
  const body = req.input?.body as z.infer<typeof verificationConfirmSchema>;
  const challenge = await prisma.verificationChallenge.findFirst({
    where: {
      userId: req.userId,
      channel: body.channel,
      codeHash: sha256(body.code),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) {
    throw new HttpError(400, "Invalid or expired verification code");
  }

  await prisma.$transaction([
    prisma.verificationChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    }),
    prisma.users.update({
      where: { id: req.userId },
      data: body.channel === "EMAIL" ? { verifiedEmail: true } : { verifiedMobilePhone: true },
    }),
  ]);
  res.status(200).json({ message: "Verification completed" });
}));

export default router;
