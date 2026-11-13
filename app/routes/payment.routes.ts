import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { authRateLimit } from "../middleware/rate-limit.middleware.js";
import {
  PAYMENT_METHODS,
  getGatewayCatalogForClient,
  getActiveProviderId,
  getPaymentGateway,
  isPaymentProviderConfigured,
  settlePaymentSuccess,
  settlePaymentFailure,
  recordWebhookEvent,
  verifyMoyasarWebhookSecret,
  moyasarWebhookSecretConfigured,
  type PaymentMethodId,
} from "../../lib/payments/index.js";

const router = Router();

const parseSellPointPaymentId = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const fromMeta = value.trim();
    if (/^\d+$/.test(fromMeta)) return Number(fromMeta);
    const matched = fromMeta.match(/sp_payment:(\d+)/i);
    if (matched) return Number(matched[1]);
  }
  return null;
};

router.get("/plans", asyncHandler(async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      currency: true,
      durationDays: true,
      features: true,
      adLimit: true,
      featuredPlacement: true,
      visibilityBoost: true,
    },
  });
  const catalog = getGatewayCatalogForClient();
  let publishableKey: string | null = null;
  try {
    const gateway = getPaymentGateway(catalog.activeProvider);
    publishableKey = gateway.isConfigured() ? gateway.getPublishableKey() : null;
  } catch {
    publishableKey = null;
  }
  res.status(200).json({
    plans: plans.map((plan) => ({ ...plan, price: plan.price.toString() })),
    providerConfigured: isPaymentProviderConfigured(),
    activeProvider: catalog.activeProvider,
    gateways: catalog.gateways,
    publishableKey,
  });
}));

router.get("/payments/gateways", asyncHandler(async (_req, res) => {
  const catalog = getGatewayCatalogForClient();
  res.status(200).json({
    ...catalog,
    providerConfigured: isPaymentProviderConfigured(),
    webhookConfigured: moyasarWebhookSecretConfigured(),
  });
}));

const checkoutSchema = z.object({
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  planId: z.number().int().positive().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default("mada"),
  locale: z.enum(["en", "ar"]).default("en"),
}).refine((value) => Boolean(value.planId || value.billingCycle), {
  message: "A subscription plan is required",
});

router.post("/payments/checkout", authMiddleware, authRateLimit, validate({ body: checkoutSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof checkoutSchema>;
  const namedPlan = body.billingCycle
    ? body.billingCycle === "yearly" ? "Premium Yearly" : "Premium"
    : null;
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
  });
  const plan = body.planId
    ? plans.find((item) => item.id === body.planId)
    : plans.find((item) => item.name === namedPlan)
      ?? plans.find((item) =>
        body.billingCycle === "yearly" ? item.durationDays >= 300 : item.durationDays > 0 && item.durationDays <= 40,
      );
  if (!plan) throw new HttpError(503, "Subscription plan is not configured");
  if (plan.currency.toUpperCase() !== "SAR") {
    throw new HttpError(500, "Subscription plan currency must be SAR");
  }

  const providerId = getActiveProviderId();
  const paymentMethod = body.paymentMethod as PaymentMethodId;

  const subscription = await prisma.userSubscription.create({
    data: {
      userId: req.userId,
      planId: plan.id,
      status: "PENDING",
      autoRenew: false,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      subscriptionId: subscription.id,
      amount: plan.price,
      currency: "SAR",
      status: "PENDING",
      provider: providerId,
      paymentMethod,
      metadata: {
        billingCycle: body.billingCycle ?? null,
        locale: body.locale,
      },
    },
  });

  if (!isPaymentProviderConfigured()) {
    res.status(202).json({
      message: "Payment provider credentials are not configured. The subscription remains pending until a real gateway checkout is available.",
      providerConfigured: false,
      payment: {
        id: payment.id,
        amount: payment.amount.toString(),
        currency: payment.currency,
        status: payment.status,
        paymentMethod,
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planId: plan.id,
        planName: plan.name,
      },
      checkout: null,
    });
    return;
  }

  const gateway = getPaymentGateway(providerId);
  const checkout = await gateway.createCheckout({
    paymentId: payment.id,
    subscriptionId: subscription.id,
    userId: req.userId,
    amount: payment.amount.toString(),
    currency: payment.currency,
    description: `sp_payment:${payment.id} ${plan.name}`,
    paymentMethod,
    locale: body.locale,
    successPath: `/plans/payment/result?paymentId=${payment.id}`,
    backPath: `/plans/payment?planId=${plan.id}`,
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerIntentId: checkout.intentId ?? null,
      metadata: {
        billingCycle: body.billingCycle ?? null,
        locale: body.locale,
        checkoutMode: checkout.mode,
        amountMinor: checkout.amountMinor,
      },
    },
  });

  res.status(202).json({
    message: "Checkout session created. Complete payment through the official gateway component.",
    providerConfigured: true,
    payment: {
      id: payment.id,
      amount: payment.amount.toString(),
      currency: payment.currency,
      status: payment.status,
      paymentMethod,
      provider: providerId,
    },
    subscription: {
      id: subscription.id,
      status: subscription.status,
      planId: plan.id,
      planName: plan.name,
    },
    checkout: {
      provider: checkout.provider,
      mode: checkout.mode,
      intentId: checkout.intentId,
      clientSecret: checkout.clientSecret,
      publishableKey: checkout.publishableKey,
      amountMinor: checkout.amountMinor,
      currency: checkout.currency,
      description: checkout.description,
      callbackUrl: checkout.callbackUrl,
      methods: checkout.methods,
      supportedNetworks: checkout.supportedNetworks,
      checkoutUrl: checkout.checkoutUrl ?? null,
    },
  });
}));

const verifySchema = z.object({
  paymentId: z.number().int().positive(),
  providerPaymentId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
});

const settleFromProviderPayment = async (input: {
  paymentId: number;
  providerReference: string;
  status: string;
  amountMinor: number;
  currency: string;
}) => {
  await prisma.payment.update({
    where: { id: input.paymentId },
    data: { providerReference: input.providerReference },
  });

  if (input.status === "paid") {
    return settlePaymentSuccess({
      paymentId: input.paymentId,
      providerReference: input.providerReference,
      amountMinor: input.amountMinor,
      currency: input.currency,
    });
  }

  if (input.status === "failed") {
    return settlePaymentFailure({
      paymentId: input.paymentId,
      providerReference: input.providerReference,
    });
  }

  return null;
};

router.post("/payments/verify", authMiddleware, authRateLimit, validate({ body: verifySchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof verifySchema>;
  const payment = await prisma.payment.findFirst({
    where: { id: body.paymentId, subscription: { userId: req.userId } },
    include: { subscription: { include: { plan: true } } },
  });
  if (!payment) throw new HttpError(404, "Payment not found");

  const gateway = getPaymentGateway((payment.provider as "moyasar") || getActiveProviderId());
  const invoiceId = body.invoiceId ?? payment.providerIntentId ?? undefined;

  if (body.providerPaymentId) {
    const remote = await gateway.fetchPayment(body.providerPaymentId);
    const linkedPaymentId = parseSellPointPaymentId(remote.metadata?.sellpoint_payment_id)
      ?? parseSellPointPaymentId(remote.description);
    if (linkedPaymentId && linkedPaymentId !== payment.id) {
      throw new HttpError(409, "Provider payment does not belong to this checkout");
    }
    if (payment.providerReference && payment.providerReference !== remote.id) {
      throw new HttpError(409, "Payment reference mismatch");
    }

    const settled = await settleFromProviderPayment({
      paymentId: payment.id,
      providerReference: remote.id,
      status: remote.status,
      amountMinor: remote.amountMinor,
      currency: remote.currency,
    });

    if (settled) {
      res.status(200).json({
        message: settled.alreadySettled ? "Payment already settled" : "Payment verified",
        payment: {
          id: payment.id,
          status: remote.status === "paid" ? "COMPLETED" : "FAILED",
          amount: payment.amount.toString(),
          currency: payment.currency,
          providerReference: remote.id,
        },
      });
      return;
    }

    res.status(202).json({
      message: "Payment is still pending provider confirmation",
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount.toString(),
        currency: payment.currency,
        providerReference: remote.id,
        providerStatus: remote.status,
      },
    });
    return;
  }

  if (!invoiceId || !gateway.fetchInvoice) {
    throw new HttpError(400, "A provider payment id or invoice id is required");
  }

  const invoice = await gateway.fetchInvoice(invoiceId);
  const linkedPaymentId = parseSellPointPaymentId(invoice.metadata?.sellpoint_payment_id)
    ?? parseSellPointPaymentId(invoice.description);
  if (linkedPaymentId && linkedPaymentId !== payment.id) {
    throw new HttpError(409, "Provider invoice does not belong to this checkout");
  }

  const paidAttempt = invoice.payments.find((item) => item.status === "paid")
    ?? invoice.payments[invoice.payments.length - 1];

  if (invoice.status === "paid" && paidAttempt) {
    const settled = await settlePaymentSuccess({
      paymentId: payment.id,
      providerReference: paidAttempt.id,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
    });
    res.status(200).json({
      message: settled.alreadySettled ? "Payment already verified" : "Payment verified",
      payment: {
        id: payment.id,
        status: "COMPLETED",
        amount: payment.amount.toString(),
        currency: payment.currency,
        providerReference: paidAttempt.id,
      },
    });
    return;
  }

  if (invoice.status === "failed" || paidAttempt?.status === "failed") {
    const reference = paidAttempt?.id ?? invoice.id;
    const settled = await settlePaymentFailure({
      paymentId: payment.id,
      providerReference: reference,
    });
    res.status(200).json({
      message: settled.alreadySettled ? "Payment already failed" : "Payment marked as failed",
      payment: {
        id: payment.id,
        status: "FAILED",
        amount: payment.amount.toString(),
        currency: payment.currency,
        providerReference: reference,
      },
    });
    return;
  }

  res.status(202).json({
    message: "Payment is still pending provider confirmation",
    payment: {
      id: payment.id,
      status: payment.status,
      amount: payment.amount.toString(),
      currency: payment.currency,
      providerReference: payment.providerReference,
      providerStatus: invoice.status,
      invoiceId: invoice.id,
    },
  });
}));

router.post("/payments/webhooks/moyasar/invoice", asyncHandler(async (req, res) => {
  const invoicePayload = req.body as {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    description?: string;
    metadata?: Record<string, string>;
    payments?: Array<{ id?: string; status?: string; amount?: number; currency?: string }>;
  };

  if (!invoicePayload.id) throw new HttpError(400, "Invalid invoice callback payload");

  const gateway = getPaymentGateway("moyasar");
  if (!gateway.fetchInvoice) throw new HttpError(503, "Invoice verification is unavailable");
  const invoice = await gateway.fetchInvoice(invoicePayload.id);

  const sellPointPaymentId = parseSellPointPaymentId(invoice.metadata?.sellpoint_payment_id)
    ?? parseSellPointPaymentId(invoice.description);
  if (!sellPointPaymentId) {
    res.status(200).json({ message: "Invoice callback ignored: payment not linked" });
    return;
  }

  const eventId = `moyasar-invoice:${invoice.id}:${invoice.status}`;
  const recorded = await recordWebhookEvent({
    id: eventId,
    provider: "moyasar",
    eventType: `invoice_${invoice.status}`,
    paymentId: sellPointPaymentId,
  });
  if (recorded.duplicate) {
    res.status(200).json({ message: "Invoice callback already processed" });
    return;
  }

  const paidAttempt = invoice.payments.find((item) => item.status === "paid");
  if (invoice.status === "paid" && paidAttempt) {
    await settlePaymentSuccess({
      paymentId: sellPointPaymentId,
      providerReference: paidAttempt.id,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
    });
    res.status(200).json({ message: "Invoice payment verified" });
    return;
  }

  if (invoice.status === "failed") {
    await settlePaymentFailure({
      paymentId: sellPointPaymentId,
      providerReference: paidAttempt?.id ?? invoice.id,
    });
    res.status(200).json({ message: "Invoice payment failed" });
    return;
  }

  res.status(200).json({ message: "Invoice callback accepted" });
}));

router.post("/payments/webhooks/moyasar", asyncHandler(async (req, res) => {
  const body = req.body as {
    id?: string;
    type?: string;
    secret_token?: string;
    live?: boolean;
    data?: {
      id?: string;
      status?: string;
      amount?: number;
      currency?: string;
      description?: string;
      metadata?: Record<string, string>;
      verification_code?: string;
    };
  };

  verifyMoyasarWebhookSecret(body.secret_token);

  if (body.type === "webhook_verification") {
    res.status(200).json({
      message: "Webhook endpoint verified",
      verificationCode: body.data?.verification_code ?? null,
    });
    return;
  }

  if (!body.id || !body.type) throw new HttpError(400, "Invalid Moyasar webhook payload");

  const recorded = await recordWebhookEvent({
    id: body.id,
    provider: "moyasar",
    eventType: body.type,
  });
  if (recorded.duplicate) {
    res.status(200).json({ message: "Webhook already processed" });
    return;
  }

  if (process.env.MOYASAR_LIVE_MODE === "true" && body.live === false) {
    throw new HttpError(409, "Test webhook rejected in live mode");
  }

  const providerPaymentId = body.data?.id;
  if (!providerPaymentId) {
    res.status(200).json({ message: "Webhook ignored: missing payment id" });
    return;
  }

  const gateway = getPaymentGateway("moyasar");
  const remote = await gateway.fetchPayment(providerPaymentId);

  let payment = await prisma.payment.findFirst({
    where: { providerReference: remote.id },
  });
  if (!payment) {
    const sellPointPaymentId = parseSellPointPaymentId(remote.metadata?.sellpoint_payment_id)
      ?? parseSellPointPaymentId(body.data?.metadata?.sellpoint_payment_id)
      ?? parseSellPointPaymentId(remote.description)
      ?? parseSellPointPaymentId(body.data?.description);
    if (sellPointPaymentId) {
      payment = await prisma.payment.findUnique({ where: { id: sellPointPaymentId } });
    }
  }
  if (!payment) {
    res.status(200).json({ message: "Webhook ignored: payment not found" });
    return;
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: body.id },
    data: { paymentId: payment.id },
  }).catch(() => undefined);

  if (body.type === "payment_paid" || remote.status === "paid") {
    await settlePaymentSuccess({
      paymentId: payment.id,
      providerReference: remote.id,
      amountMinor: remote.amountMinor,
      currency: remote.currency,
    });
    res.status(200).json({ message: "Payment verified from webhook" });
    return;
  }

  if (body.type === "payment_faild" || remote.status === "failed") {
    await settlePaymentFailure({
      paymentId: payment.id,
      providerReference: remote.id,
    });
    res.status(200).json({ message: "Payment failed from webhook" });
    return;
  }

  res.status(200).json({ message: "Webhook accepted" });
}));

router.get("/payments/me", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const payments = await prisma.payment.findMany({
    where: { subscription: { userId: req.userId } },
    orderBy: { createdAt: "desc" },
    include: { subscription: { include: { plan: { select: { name: true } } } } },
  });
  res.status(200).json({
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toString(),
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      providerReference: payment.providerReference,
      paymentMethod: payment.paymentMethod,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      planName: payment.subscription.plan.name,
      subscriptionStatus: payment.subscription.status,
    })),
  });
}));

router.get("/payments/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const id = Number(req.params.id);
  const payment = await prisma.payment.findFirst({
    where: { id, subscription: { userId: req.userId } },
    include: { subscription: { include: { plan: { select: { name: true, featuredPlacement: true, adLimit: true, visibilityBoost: true } } } } },
  });
  if (!payment) throw new HttpError(404, "Payment not found");
  res.status(200).json({
    payment: {
      id: payment.id,
      amount: payment.amount.toString(),
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      providerReference: payment.providerReference,
      paymentMethod: payment.paymentMethod,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      subscription: {
        id: payment.subscription.id,
        status: payment.subscription.status,
        startsAt: payment.subscription.startsAt,
        endsAt: payment.subscription.endsAt,
        planName: payment.subscription.plan.name,
      },
    },
  });
}));

router.post("/subscriptions/cancel", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const subscription = await prisma.userSubscription.findFirst({
    where: { userId: req.userId, status: "ACTIVE", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" },
  });
  if (!subscription) throw new HttpError(404, "Active subscription not found");
  const updated = await prisma.userSubscription.update({
    where: { id: subscription.id },
    data: { autoRenew: false, cancelledAt: new Date() },
  });
  res.status(200).json({
    message: "Automatic renewal cancelled. The current subscription remains active until it ends.",
    subscription: {
      id: updated.id,
      status: updated.status,
      endsAt: updated.endsAt,
      cancelledAt: updated.cancelledAt,
    },
  });
}));

export default router;
