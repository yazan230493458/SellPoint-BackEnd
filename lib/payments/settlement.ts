import prisma from "../prisma.js";
import { createNotification } from "../notify.js";
import { HttpError } from "../http.js";
import { minorUnitsMatch, assertSarCurrency } from "./money.js";

type SettleSuccessInput = {
  paymentId: number;
  providerReference: string;
  amountMinor: number;
  currency: string;
};

type SettleFailureInput = {
  paymentId: number;
  providerReference: string;
};

const loadPayment = async (paymentId: number) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!payment) throw new HttpError(404, "Payment not found");
  return payment;
};

export const settlePaymentSuccess = async (input: SettleSuccessInput) => {
  const payment = await loadPayment(input.paymentId);
  assertSarCurrency(input.currency);
  assertSarCurrency(payment.currency);

  if (!minorUnitsMatch(payment.amount.toString(), input.amountMinor, payment.currency)) {
    throw new HttpError(409, "Payment amount mismatch");
  }

  if (payment.providerReference && payment.providerReference !== input.providerReference) {
    throw new HttpError(409, "Payment reference mismatch");
  }

  if (payment.status === "COMPLETED") {
    return { alreadySettled: true as const, payment };
  }

  if (payment.status === "REFUNDED") {
    throw new HttpError(409, "Payment was refunded");
  }

  const now = new Date();
  const current = await prisma.userSubscription.findFirst({
    where: {
      userId: payment.subscription.userId,
      status: "ACTIVE",
      endsAt: { gt: now },
    },
    orderBy: { endsAt: "desc" },
  });
  const startsAt = current?.endsAt && current.endsAt > now ? current.endsAt : now;
  const endsAt = new Date(
    startsAt.getTime() + payment.subscription.plan.durationDays * 24 * 60 * 60 * 1000,
  );

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "COMPLETED",
        providerReference: input.providerReference,
        paidAt: now,
      },
    }),
    prisma.userSubscription.update({
      where: { id: payment.subscriptionId },
      data: { status: "ACTIVE", startsAt, endsAt },
    }),
  ]);

  await createNotification({
    userId: payment.subscription.userId,
    title: "Subscription active",
    message: "Your payment was verified and your subscription is now active.",
    type: "SUCCESS",
    channel: "subscriptionChannel",
    href: "/plans",
    dedupeKey: `payment:${payment.id}`,
  });

  return { alreadySettled: false as const, payment: updatedPayment };
};

export const settlePaymentFailure = async (input: SettleFailureInput) => {
  const payment = await loadPayment(input.paymentId);

  if (payment.providerReference && payment.providerReference !== input.providerReference) {
    throw new HttpError(409, "Payment reference mismatch");
  }

  if (payment.status === "COMPLETED") {
    throw new HttpError(409, "Completed payments cannot be marked failed");
  }

  if (payment.status === "FAILED") {
    return { alreadySettled: true as const, payment };
  }

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        providerReference: input.providerReference,
      },
    }),
    prisma.userSubscription.update({
      where: { id: payment.subscriptionId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
  ]);

  return { alreadySettled: false as const, payment: updatedPayment };
};

export const recordWebhookEvent = async (input: {
  id: string;
  provider: string;
  eventType: string;
  paymentId?: number | null;
}) => {
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        id: input.id,
        provider: input.provider,
        eventType: input.eventType,
        paymentId: input.paymentId ?? null,
      },
    });
    return { duplicate: false as const };
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: string }).code === "P2002"
    ) {
      return { duplicate: true as const };
    }
    throw error;
  }
};
