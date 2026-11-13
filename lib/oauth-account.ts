import { randomBytes } from "node:crypto";
import prisma from "./prisma.js";
import { HttpError } from "./http.js";

type OAuthProvider = "google" | "github";

type OAuthProfile = {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

const providerData = (provider: OAuthProvider, providerId: string) =>
  provider === "google" ? { googleId: providerId } : { githubId: providerId };

const availableUsername = async (firstName: string, email: string) => {
  const base =
    (firstName || email.split("@")[0] || "user")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 12) || "user";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = attempt === 0 ? "" : randomBytes(3).toString("hex");
    const username = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    const taken = await prisma.users.findUnique({ where: { username } });
    if (!taken) return username;
  }

  throw new HttpError(409, "A username could not be reserved");
};

export const connectOAuthAccount = async (profile: OAuthProfile) => {
  const linked = await prisma.users.findFirst({
    where: providerData(profile.provider, profile.providerId),
  });

  if (linked) {
    if (linked.deletedAt || !linked.isActive) {
      throw new HttpError(403, "Account is disabled");
    }
    if (profile.avatarUrl && !linked.avatarUrl) {
      return prisma.users.update({
        where: { id: linked.id },
        data: { avatarUrl: profile.avatarUrl },
      });
    }
    return linked;
  }

  const email = profile.email.trim().toLowerCase();
  if (!email || profile.emailVerified !== true) {
    throw new HttpError(400, "A verified email is required");
  }

  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) {
    if (existing.deletedAt || !existing.isActive) {
      throw new HttpError(403, "Account is disabled");
    }
    if (!existing.verifiedEmail) {
      throw new HttpError(409, "Verify the existing account email before linking this sign-in method");
    }
    return prisma.users.update({
      where: { id: existing.id },
      data: {
        ...providerData(profile.provider, profile.providerId),
        ...(profile.avatarUrl && !existing.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      },
    });
  }

  return prisma.users.create({
    data: {
      ...providerData(profile.provider, profile.providerId),
      username: await availableUsername(profile.firstName, email),
      email,
      firstName: profile.firstName.trim() || "User",
      lastName: profile.lastName.trim() || "User",
      passwordHash: null,
      mobileNumber: null,
      region: null,
      city: null,
      verifiedEmail: true,
      evaluation: 0,
      acceptTerms: false,
      avatarUrl: profile.avatarUrl,
      preference: { create: {} },
    },
  });
};
