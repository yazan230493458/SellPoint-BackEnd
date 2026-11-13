import type { RequestHandler } from "express";
import { normalizeLocale, type BackendLocale } from "../../lib/i18n/locales.js";

declare global {
  namespace Express {
    interface Request {
      locale?: BackendLocale;
    }
  }
}

export const localeMiddleware: RequestHandler = (req, _res, next) => {
  const headerLocale =
    req.header("x-locale") ||
    req.header("X-Locale") ||
    req.header("accept-language")?.split(",")[0];
  req.locale = normalizeLocale(headerLocale);
  next();
};
