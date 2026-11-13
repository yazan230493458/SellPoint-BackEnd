import type { Request, Response } from "express";
import prisma from "./prisma.js";
import { randomToken, sha256 } from "./crypto.js";

export const frontendBase = () =>
  (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

export const oauthHandoffHash = (code: string) => sha256(`oauth-handoff:${code}`);

export const redirectOAuthError = (res: Response, provider: "google" | "github") => {
  res.redirect(`${frontendBase()}/en/log-in?error=${provider}`);
};

/**
 * OAuth callbacks run on the Backend host. Session cookies must be set on the Frontend
 * host via the same-origin API proxy, so we issue a short-lived opaque handoff code
 * (not a JWT/access/refresh token) and redirect to the Frontend exchange page.
 */
export const completeOAuthLogin = async (
  _req: Request,
  res: Response,
  account: {
    id: number;
    username: string | null;
    email: string;
    role: string;
    tokenVersion: number;
  },
) => {
  const code = randomToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: account.id,
      tokenHash: oauthHandoffHash(code),
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    },
  });

  const url = new URL(`${frontendBase()}/oauth/complete`);
  url.searchParams.set("code", code);
  res.redirect(url.toString());
};
