import type { RequestHandler } from "express";
import { translateMessage } from "../../lib/i18n/messages.js";
import { normalizeLocale } from "../../lib/i18n/locales.js";

export const notFoundMiddleware: RequestHandler = (req, res) => {
  const locale = normalizeLocale(req.locale ?? req.header("x-locale"));
  res.status(404).json({
    message: translateMessage("Endpoint not found", locale),
  });
};
