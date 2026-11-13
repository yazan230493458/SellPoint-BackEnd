import type { Request, Response } from "express";
import { normalizeLocale } from "./locales.js";
import { translateMessage } from "./messages.js";

export const localeOf = (req: Request) =>
  normalizeLocale(req.locale ?? req.header("x-locale"));

export const sendLocalized = (
  req: Request,
  res: Response,
  status: number,
  message: string,
  extra?: Record<string, unknown>,
) => {
  res.status(status).json({
    message: translateMessage(message, localeOf(req)),
    ...(extra ?? {}),
  });
};
