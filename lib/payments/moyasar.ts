import { timingSafeEqual } from "node:crypto";
import { HttpError } from "../http.js";
import { toMinorUnits, assertSarCurrency } from "./money.js";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentGateway,
  PaymentMethodId,
  ProviderInvoiceSnapshot,
  ProviderPaymentSnapshot,
} from "./types.js";

const MOYASAR_API_BASE = () =>
  (process.env.MOYASAR_API_BASE ?? "https://api.moyasar.com/v1").replace(/\/$/, "");

type MoyasarPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  description?: string | null;
  invoice_id?: string | null;
  metadata?: Record<string, string> | null;
};

type MoyasarInvoice = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  description?: string | null;
  url: string;
  metadata?: Record<string, string> | null;
  payments?: MoyasarPayment[];
};

const secretsEqual = (provided: string, expected: string) => {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const authHeader = (secretKey: string) =>
  `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

const moyasarRequest = async <T>(
  path: string,
  init: RequestInit & { secretKey: string },
): Promise<T> => {
  const response = await fetch(`${MOYASAR_API_BASE()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(init.secretKey),
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    type?: string;
    message?: string;
    errors?: unknown;
  } & T;
  if (!response.ok) {
    const detail = typeof payload.message === "string" ? payload.message : "Moyasar request failed";
    throw new HttpError(502, detail, payload.errors ?? payload.type ?? null);
  }
  return payload;
};

const methodConfig = (method: PaymentMethodId) => {
  switch (method) {
    case "mada":
      return { methods: ["creditcard"], supportedNetworks: ["mada"] };
    case "visa":
      return { methods: ["creditcard"], supportedNetworks: ["visa"] };
    case "mastercard":
      return { methods: ["creditcard"], supportedNetworks: ["mastercard"] };
    case "applepay":
      return { methods: ["applepay"], supportedNetworks: ["mada", "visa", "mastercard"] };
    case "stcpay":
      return { methods: ["stcpay"], supportedNetworks: [] as string[] };
    default:
      return { methods: ["creditcard"], supportedNetworks: ["mada", "visa", "mastercard"] };
  }
};

const frontendBase = () => {
  const value = process.env.FRONTEND_URL?.replace(/\/$/, "");
  if (!value) throw new HttpError(500, "FRONTEND_URL is not configured");
  return value;
};

const apiPublicBase = () => {
  const value = (process.env.PUBLIC_API_URL ?? process.env.BACKEND_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!value) {
    // Fall back to deriving from common local defaults only for callback construction hints.
    const port = process.env.PORT || "1000";
    return `http://localhost:${port}`;
  }
  return value;
};

export class MoyasarGateway implements PaymentGateway {
  id = "moyasar" as const;

  isConfigured() {
    return Boolean(process.env.MOYASAR_SECRET_KEY?.trim());
  }

  getPublishableKey() {
    return process.env.MOYASAR_PUBLISHABLE_KEY?.trim() || null;
  }

  private secretKey() {
    const key = process.env.MOYASAR_SECRET_KEY?.trim();
    if (!key) throw new HttpError(503, "Moyasar secret key is not configured");
    return key;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    assertSarCurrency(input.currency);
    const amountMinor = toMinorUnits(input.amount, input.currency);
    const successUrl = `${frontendBase()}/${input.locale}${input.successPath}`;
    const backUrl = `${frontendBase()}/${input.locale}${input.backPath}`;
    const callbackUrl = `${apiPublicBase()}/api/payments/webhooks/moyasar/invoice`;

    const invoice = await moyasarRequest<MoyasarInvoice>("/invoices", {
      method: "POST",
      secretKey: this.secretKey(),
      body: JSON.stringify({
        amount: amountMinor,
        currency: "SAR",
        description: input.description,
        success_url: successUrl,
        back_url: backUrl,
        callback_url: callbackUrl,
        metadata: {
          sellpoint_payment_id: String(input.paymentId),
          sellpoint_subscription_id: String(input.subscriptionId),
          sellpoint_user_id: String(input.userId),
          sellpoint_payment_method: input.paymentMethod,
        },
      }),
    });

    const selected = methodConfig(input.paymentMethod);
    return {
      provider: "moyasar",
      mode: "hosted_redirect",
      checkoutUrl: invoice.url,
      intentId: invoice.id,
      amountMinor,
      currency: "SAR",
      description: input.description,
      callbackUrl: successUrl,
      methods: selected.methods,
      supportedNetworks: selected.supportedNetworks,
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot> {
    const payment = await moyasarRequest<MoyasarPayment>(`/payments/${providerPaymentId}`, {
      method: "GET",
      secretKey: this.secretKey(),
    });
    return {
      id: payment.id,
      status: payment.status,
      amountMinor: payment.amount,
      currency: payment.currency,
      description: payment.description ?? null,
      invoiceId: payment.invoice_id ?? null,
      metadata: payment.metadata ?? null,
    };
  }

  async fetchInvoice(invoiceId: string): Promise<ProviderInvoiceSnapshot> {
    const invoice = await moyasarRequest<MoyasarInvoice>(`/invoices/${invoiceId}`, {
      method: "GET",
      secretKey: this.secretKey(),
    });
    return {
      id: invoice.id,
      status: invoice.status,
      amountMinor: invoice.amount,
      currency: invoice.currency,
      description: invoice.description ?? null,
      url: invoice.url,
      metadata: invoice.metadata ?? null,
      payments: (invoice.payments ?? []).map((payment) => ({
        id: payment.id,
        status: payment.status,
        amountMinor: payment.amount,
        currency: payment.currency,
        description: payment.description ?? null,
        invoiceId: payment.invoice_id ?? invoice.id ?? null,
        metadata: payment.metadata ?? null,
      })),
    };
  }
}

export const moyasarWebhookSecretConfigured = () =>
  Boolean(process.env.MOYASAR_WEBHOOK_SECRET?.trim());

export const verifyMoyasarWebhookSecret = (secretToken: string | undefined) => {
  const expected = process.env.MOYASAR_WEBHOOK_SECRET?.trim();
  if (!expected) throw new HttpError(503, "Moyasar webhook secret is not configured");
  if (!secretToken || !secretsEqual(secretToken, expected)) {
    throw new HttpError(401, "Invalid Moyasar webhook secret");
  }
};
