import { Prisma, type NotificationType } from "../generator/prisma/client.js";
import prisma from "./prisma.js";
import { normalizeLocale } from "./i18n/locales.js";
import { translateMessage } from "./i18n/messages.js";

export type NotificationChannel =
  | "messagesChannel"
  | "offersChannel"
  | "adStatusChannel"
  | "securityChannel"
  | "reviewsChannel"
  | "priceDropsChannel"
  | "recommendationsChannel"
  | "reportsChannel"
  | "subscriptionChannel";

type NotificationInput = {
  userId: number;
  title: string;
  message: string;
  type: NotificationType;
  channel: NotificationChannel;
  href?: string;
  dedupeKey?: string;
};

export const createNotification = async (input: NotificationInput) => {
  const preference = await prisma.userPreference.findUnique({
    where: { userId: input.userId },
  });
  const channelValue = preference?.[input.channel] ?? 1;
  if (channelValue !== 1) {
    return null;
  }

  const locale = normalizeLocale(preference?.language);
  const title = translateMessage(input.title, locale);
  const message = translateMessage(input.message, locale);

  if (input.dedupeKey) {
    const existing = await prisma.notification.findUnique({
      where: {
        userId_dedupeKey: {
          userId: input.userId,
          dedupeKey: input.dedupeKey,
        },
      },
    });

    if (existing && !existing.dismissedAt) {
      return existing;
    }

    if (existing) {
      return prisma.notification.update({
        where: { id: existing.id },
        data: {
          title,
          message,
          type: input.type,
          isRead: false,
          dismissedAt: null,
          ...(input.href !== undefined ? { href: input.href } : {}),
          createdAt: new Date(),
        },
      });
    }
  }

  return prisma.notification.create({
    data: {
      userId: input.userId,
      title,
      message,
      type: input.type,
      ...(input.href !== undefined ? { href: input.href } : {}),
      ...(input.dedupeKey !== undefined ? { dedupeKey: input.dedupeKey } : {}),
    },
  });
};

export const notifyAdmins = async (input: Omit<NotificationInput, "userId">) => {
  const admins = await prisma.users.findMany({
    where: {
      role: { in: ["ADMIN", "OWNER"] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  await Promise.all(admins.map((admin) => createNotification({ ...input, userId: admin.id })));
};

export const writeAudit = async (input: {
  actorId: number;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}) => {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
};
