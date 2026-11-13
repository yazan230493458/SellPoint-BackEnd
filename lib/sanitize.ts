import type { Prisma } from "../generator/prisma/client.js";

export const accountUserSelect = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  mobileNumber: true,
  region: true,
  city: true,
  bio: true,
  avatarUrl: true,
  role: true,
  evaluation: true,
  isActive: true,
  is2FAEnabled: true,
  verifiedEmail: true,
  verifiedMobilePhone: true,
  acceptTerms: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsersSelect;

export const publicUserSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  bio: true,
  avatarUrl: true,
  evaluation: true,
  createdAt: true,
  role: true,
} satisfies Prisma.UsersSelect;

export type AccountUser = Prisma.UsersGetPayload<{ select: typeof accountUserSelect }>;

export const toPublicProfile = (
  user: AccountUser,
  preference: {
    mobileVisibility: string;
    emailVisibility: string;
    cityVisibility: string;
  } | null,
  viewerId?: number,
) => {
  const isSelf = viewerId === user.id;
  const showMobile = isSelf || preference?.mobileVisibility === "Everyone";
  const showEmail = isSelf || preference?.emailVisibility === "Everyone";
  const showCity = isSelf || preference?.cityVisibility !== "Just Me";

  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    evaluation: user.evaluation,
    region: user.region,
    city: showCity ? user.city : null,
    email: showEmail ? user.email : null,
    mobileNumber: showMobile ? user.mobileNumber : null,
    createdAt: user.createdAt,
    role: isSelf ? user.role : undefined,
  };
};
