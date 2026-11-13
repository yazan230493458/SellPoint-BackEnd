import jwt, { type JwtPayload } from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error("JWT_SECRET is not defined");
}

export type AccessTokenPayload = {
  userId: number;
  username: string;
  role: string;
  tokenVersion: number;
  jti: string;
  exp?: number;
};

const isAccessPayload = (value: string | JwtPayload): value is AccessTokenPayload => {
  if (typeof value === "string") {
    return false;
  }

  return (
    typeof value.userId === "number" &&
    typeof value.username === "string" &&
    typeof value.role === "string" &&
    typeof value.tokenVersion === "number" &&
    typeof value.jti === "string"
  );
};

export const signAccessToken = (input: Omit<AccessTokenPayload, "jti">) => {
  const jti = randomUUID();
  const token = jwt.sign(
    {
      userId: input.userId,
      username: input.username,
      role: input.role,
      tokenVersion: input.tokenVersion,
      jti,
    },
    secret,
    { expiresIn: "15m" },
  );
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded !== "string" ? decoded.exp : undefined;
  const expiresAt = typeof exp === "number" ? new Date(exp * 1000) : new Date(Date.now() + 15 * 60 * 1000);

  return { token, jti, expiresAt };
};

export const verifyAccessToken = (token: string) => {
  const decoded = jwt.verify(token, secret);
  if (!isAccessPayload(decoded)) {
    throw new Error("Invalid token");
  }
  return {
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
    tokenVersion: decoded.tokenVersion,
    jti: decoded.jti,
    ...(typeof decoded.exp === "number" ? { exp: decoded.exp } : {}),
  };
};

export const generateToken = (userId: number, username: string, role: string, tokenVersion = 0) =>
  signAccessToken({ userId, username, role, tokenVersion }).token;

export const verifyToken = (token: string) => verifyAccessToken(token);
