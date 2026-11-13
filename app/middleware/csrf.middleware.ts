import type { NextFunction, Request, Response } from "express";
import { accessCookieName, readCookie, refreshCookieName } from "../../lib/cookies.js";
import { sendLocalized } from "../../lib/i18n/respond.js";

const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!unsafe.has(req.method)) {
    next();
    return;
  }
  const hasSessionCookie = Boolean(readCookie(req.headers.cookie, accessCookieName) || readCookie(req.headers.cookie, refreshCookieName));
  const bearer = req.headers.authorization?.startsWith("Bearer ");
  if (!hasSessionCookie || bearer) {
    next();
    return;
  }
  const origin = req.get("origin");
  if (!origin || origin !== process.env.CORS_ORIGIN) {
    sendLocalized(req, res, 403, "Cross-site request blocked");
    return;
  }
  next();
};

export default csrfMiddleware;
