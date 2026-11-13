import type { Request, Response } from "express";
import prisma from "./prisma.js";
import { randomToken, sha256 } from "./crypto.js";
import {
  clearSessionCookies,
  deviceCookieName,
  readCookie,
  readDeviceCookie,
  refreshCookieName,
  setDeviceCookie,
  setSessionCookies,
} from "./cookies.js";
import { issueSession, revokeRefreshToken } from "./session.js";
import { HttpError } from "./http.js";

export const MAX_SWITCHER_ACCOUNTS = 5;

const deviceSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  deletedAt: true,
} as const;

export type SwitcherAccountView = {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  role: "USER" | "ADMIN" | "OWNER";
  active: boolean;
};

const ensureDevice = async (req: Request, res: Response) => {
  const existing = readDeviceCookie(req.headers.cookie);
  if (existing) {
    const hashed = sha256(existing);
    const device = await prisma.authDevice.findUnique({
      where: { tokenHash: hashed },
      select: { id: true },
    });
    if (device) {
      return { deviceId: device.id, deviceToken: existing };
    }
  }

  const deviceToken = randomToken(32);
  const device = await prisma.authDevice.create({
    data: { tokenHash: sha256(deviceToken) },
    select: { id: true },
  });
  setDeviceCookie(res, deviceToken);
  return { deviceId: device.id, deviceToken };
};

export const rememberSwitcherAccount = async (
  req: Request,
  res: Response,
  userId: number,
  refreshToken: string,
) => {
  const { deviceId } = await ensureDevice(req, res);
  const refreshHash = sha256(refreshToken);

  const existing = await prisma.deviceAccount.findUnique({
    where: { deviceId_userId: { deviceId, userId } },
    select: { id: true },
  });

  if (!existing) {
    const count = await prisma.deviceAccount.count({ where: { deviceId } });
    if (count >= MAX_SWITCHER_ACCOUNTS) {
      const oldest = await prisma.deviceAccount.findFirst({
        where: { deviceId },
        orderBy: { lastUsedAt: "asc" },
        select: { id: true, refreshHash: true },
      });
      if (oldest) {
        await prisma.refreshToken.updateMany({
          where: { tokenHash: oldest.refreshHash, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await prisma.deviceAccount.delete({ where: { id: oldest.id } });
      }
    }
  }

  await prisma.deviceAccount.upsert({
    where: { deviceId_userId: { deviceId, userId } },
    create: {
      deviceId,
      userId,
      refreshHash,
      lastUsedAt: new Date(),
    },
    update: {
      refreshHash,
      lastUsedAt: new Date(),
    },
  });
};

export const establishBrowserSession = async (
  req: Request,
  res: Response,
  user: {
    id: number;
    username: string;
    role: string;
    tokenVersion: number;
  },
) => {
  const session = await issueSession(user);
  setSessionCookies(res, session);
  await rememberSwitcherAccount(req, res, user.id, session.refreshToken);
  return session;
};

export const listSwitcherAccounts = async (req: Request, res: Response) => {
  const deviceToken = readDeviceCookie(req.headers.cookie);
  if (!deviceToken) {
    return { accounts: [] as SwitcherAccountView[] };
  }

  const device = await prisma.authDevice.findUnique({
    where: { tokenHash: sha256(deviceToken) },
    select: { id: true },
  });
  if (!device) {
    return { accounts: [] as SwitcherAccountView[] };
  }

  // Ensure cookie persists while browsing
  setDeviceCookie(res, deviceToken);

  const rows = await prisma.deviceAccount.findMany({
    where: { deviceId: device.id },
    orderBy: { lastUsedAt: "desc" },
    include: { user: { select: deviceSelect } },
  });

  const activeUserId = req.userId ?? null;
  const accounts: SwitcherAccountView[] = [];

  for (const row of rows) {
    const token = await prisma.refreshToken.findUnique({
      where: { tokenHash: row.refreshHash },
      select: { revokedAt: true, expiresAt: true },
    });
    if (
      !token ||
      token.revokedAt ||
      token.expiresAt <= new Date() ||
      !row.user.isActive ||
      row.user.deletedAt
    ) {
      await prisma.deviceAccount.delete({ where: { id: row.id } }).catch(() => undefined);
      continue;
    }

    accounts.push({
      id: row.user.id,
      username: row.user.username,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      email: row.user.email,
      avatarUrl: row.user.avatarUrl,
      role: row.user.role,
      active: activeUserId === row.user.id,
    });
  }

  return { accounts };
};

export const switchSwitcherAccount = async (
  req: Request,
  res: Response,
  targetUserId: number,
) => {
  const { deviceId } = await ensureDevice(req, res);
  if (req.userId && req.userId === targetUserId) {
    throw new HttpError(400, "Account already active");
  }

  const slot = await prisma.deviceAccount.findUnique({
    where: { deviceId_userId: { deviceId, userId: targetUserId } },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          tokenVersion: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!slot || !slot.user.username) {
    throw new HttpError(404, "Saved account not found");
  }
  if (!slot.user.isActive || slot.user.deletedAt) {
    await prisma.deviceAccount.delete({ where: { id: slot.id } }).catch(() => undefined);
    throw new HttpError(403, "Account is disabled");
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: slot.refreshHash },
    select: { id: true, revokedAt: true, expiresAt: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    await prisma.deviceAccount.delete({ where: { id: slot.id } }).catch(() => undefined);
    throw new HttpError(401, "Saved account session expired");
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const session = await issueSession({
    id: slot.user.id,
    username: slot.user.username,
    role: slot.user.role,
    tokenVersion: slot.user.tokenVersion,
  });
  setSessionCookies(res, session);
  await prisma.deviceAccount.update({
    where: { id: slot.id },
    data: {
      refreshHash: sha256(session.refreshToken),
      lastUsedAt: new Date(),
    },
  });

  return slot.user.id;
};

export const removeSwitcherAccount = async (
  req: Request,
  res: Response,
  targetUserId: number,
) => {
  const deviceToken = readDeviceCookie(req.headers.cookie);
  if (!deviceToken) throw new HttpError(404, "Saved account not found");

  const device = await prisma.authDevice.findUnique({
    where: { tokenHash: sha256(deviceToken) },
    select: { id: true },
  });
  if (!device) throw new HttpError(404, "Saved account not found");

  const slot = await prisma.deviceAccount.findUnique({
    where: { deviceId_userId: { deviceId: device.id, userId: targetUserId } },
    select: { id: true, refreshHash: true },
  });
  if (!slot) throw new HttpError(404, "Saved account not found");

  await prisma.refreshToken.updateMany({
    where: { tokenHash: slot.refreshHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.deviceAccount.delete({ where: { id: slot.id } });

  if (req.userId === targetUserId) {
    const currentRefresh = readCookie(req.headers.cookie, refreshCookieName);
    if (currentRefresh) {
      await revokeRefreshToken(currentRefresh, targetUserId);
    }
    clearSessionCookies(res);
  }

  setDeviceCookie(res, deviceToken);
};

export const prepareAddSwitcherAccount = async (req: Request, res: Response) => {
  // Keep stored device sessions; only drop the active browser cookies.
  // Do not revoke the current refresh hash so the account remains switchable.
  await ensureDevice(req, res);
  clearSessionCookies(res);
};

export { deviceCookieName };
