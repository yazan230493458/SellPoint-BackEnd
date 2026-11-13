import type { RequestHandler } from "express";

const isProduction = () => process.env.NODE_ENV === "production";

/** HSTS only on HTTPS production deployments; no includeSubDomains/preload. */
export const hstsEnabled = () =>
  isProduction() &&
  (process.env.COOKIE_SECURE === "1" || process.env.ENABLE_HSTS === "1");

export const permissionsPolicyValue =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

/**
 * Extra headers not covered by helmet defaults / needing explicit values.
 * Helmet still owns CSP, frameguard, nosniff, referrer-policy, and HSTS.
 */
export const additionalSecurityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("Permissions-Policy", permissionsPolicyValue);
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
};
