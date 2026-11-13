import type { Request, Response } from "express";
import { establishBrowserSession } from "./account-switcher.js";

export const frontendBase = () =>
  (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

export const redirectOAuthError = (res: Response, provider: "google" | "github") => {
  res.redirect(`${frontendBase()}/en/log-in?error=${provider}`);
};

export const completeOAuthLogin = async (
  req: Request,
  res: Response,
  account: {
    id: number;
    username: string | null;
    email: string;
    role: string;
    tokenVersion: number;
  },
) => {
  await establishBrowserSession(req, res, {
    id: account.id,
    username: account.username ?? account.email,
    role: account.role,
    tokenVersion: account.tokenVersion,
  });
  res.redirect(frontendBase());
};
