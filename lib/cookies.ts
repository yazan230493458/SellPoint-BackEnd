import type { Response } from "express";

export const accessCookieName = "sp_access";
export const refreshCookieName = "sp_refresh";
export const deviceCookieName = "sp_device";

/**
 * Secure cookies in production by default.
 * Set COOKIE_SECURE=0 only for local HTTP debugging.
 */
export const secureCookie = () => {
  if (process.env.COOKIE_SECURE === "0") return false;
  if (process.env.COOKIE_SECURE === "1") return true;
  return process.env.NODE_ENV === "production";
};

const serialize = (name: string, value: string, maxAge: number) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secureCookie()) parts.push("Secure");
  return parts.join("; ");
};

export const readCookie = (header: string | undefined, name: string) => {
  if (!header) return "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return "";
};

export const setSessionCookies = (res: Response, session: { accessToken: string; refreshToken: string }) => {
  res.append("Set-Cookie", serialize(accessCookieName, session.accessToken, 15 * 60));
  res.append("Set-Cookie", serialize(refreshCookieName, session.refreshToken, 7 * 24 * 60 * 60));
};

export const clearSessionCookies = (res: Response) => {
  res.append("Set-Cookie", serialize(accessCookieName, "", 0));
  res.append("Set-Cookie", serialize(refreshCookieName, "", 0));
};

export const setDeviceCookie = (res: Response, deviceToken: string) => {
  res.append(
    "Set-Cookie",
    serialize(deviceCookieName, deviceToken, 400 * 24 * 60 * 60),
  );
};

export const readDeviceCookie = (header: string | undefined) =>
  readCookie(header, deviceCookieName);

const oauthStateCookieName = "sp_oauth_state";

export const setOAuthStateCookie = (res: Response, state: string) => {
  res.append("Set-Cookie", serialize(oauthStateCookieName, state, 10 * 60));
};

export const clearOAuthStateCookie = (res: Response) => {
  res.append("Set-Cookie", serialize(oauthStateCookieName, "", 0));
};

export const readOAuthState = (header: string | undefined) =>
  readCookie(header, oauthStateCookieName);
