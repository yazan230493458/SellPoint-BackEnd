import type { NextFunction, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { accessCookieName, readCookie } from "../../lib/cookies.js";
import { verifyAccessToken } from "../../lib/jwt.js";
import { sendLocalized } from "../../lib/i18n/respond.js";

const readAccessToken = (req: Request) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return token;
  }
  return readCookie(req.headers.cookie, accessCookieName);
};

const authenticate = async (req: Request, res: Response, next: NextFunction, optional: boolean) => {
  const token = readAccessToken(req);
  if (!token) {
    if (optional) {
      next();
      return;
    }
    sendLocalized(req, res, 401, "Unauthorized");
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    const revoked = await prisma.revokedAccessToken.findUnique({
      where: { jti: decoded.jti },
      select: { expiresAt: true },
    });
    if (revoked && revoked.expiresAt > new Date()) {
      sendLocalized(req, res, 401, "Invalid token");
      return;
    }

    const user = await prisma.users.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        deletedAt: true,
        tokenVersion: true,
      },
    });

    if (
      !user ||
      user.deletedAt ||
      user.username !== decoded.username ||
      user.tokenVersion !== decoded.tokenVersion
    ) {
      sendLocalized(req, res, 401, "Invalid token");
      return;
    }

    if (!user.isActive) {
      sendLocalized(req, res, 403, "Account is disabled");
      return;
    }

    req.userId = user.id;
    req.username = user.username;
    req.role = user.role;
    next();
  } catch (error) {
    if (error instanceof Error && (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.message === "Invalid token")) {
      sendLocalized(req, res, 401, "Invalid token");
      return;
    }
    next(error);
  }
};

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  authenticate(req, res, next, false).catch(next);
};

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  authenticate(req, res, next, true).catch(next);
};

export const requireRoles = (...roles: Array<"USER" | "ADMIN" | "OWNER">) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role as "USER" | "ADMIN" | "OWNER")) {
      sendLocalized(req, res, 403, "Forbidden");
      return;
    }
    next();
  };

export const requireAdmin = requireRoles("ADMIN", "OWNER");

export const requireOwner = requireRoles("OWNER");

export default authMiddleware;
