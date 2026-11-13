import prisma from "./prisma.js";
import { randomToken, sha256 } from "./crypto.js";
import { signAccessToken } from "./jwt.js";

const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export const issueSession = async (user: {
  id: number;
  username: string;
  role: string;
  tokenVersion: number;
}) => {
  const access = signAccessToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + refreshLifetimeMs);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt,
    },
  });

  return {
    accessToken: access.token,
    refreshToken,
    accessExpiresAt: access.expiresAt.toISOString(),
  };
};

export const revokeRefreshToken = async (refreshToken: string, userId?: number) => {
  const tokenHash = sha256(refreshToken);
  await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
      ...(userId !== undefined ? { userId } : {}),
    },
    data: { revokedAt: new Date() },
  });
};

export const revokeAllRefreshTokens = async (userId: number) => {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};
