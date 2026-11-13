export const PAYMENT_METHODS = [
  "mada",
  "visa",
  "mastercard",
  "applepay",
  "stcpay",
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = [
  "moyasar",
  "hyperpay",
  "paytabs",
  "tap",
  "paylink",
  "amazon_ps",
] as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export type GatewayMethodSupport = {
  id: PaymentMethodId;
  available: boolean;
  notes?: string;
};

export type GatewayCatalogEntry = {
  id: PaymentProviderId;
  name: string;
  implemented: boolean;
  checkoutMode: "hosted_redirect" | "payment_intent_form" | "not_implemented";
  currency: "SAR";
  methods: GatewayMethodSupport[];
};

export type CreateCheckoutInput = {
  paymentId: number;
  subscriptionId: number;
  userId: number;
  amount: string;
  currency: string;
  description: string;
  paymentMethod: PaymentMethodId;
  locale: "en" | "ar";
  successPath: string;
  backPath: string;
};

export type CreateCheckoutResult = {
  provider: PaymentProviderId;
  mode: "payment_intent_form" | "hosted_redirect";
  checkoutUrl?: string;
  intentId?: string;
  clientSecret?: string;
  publishableKey?: string;
  amountMinor: number;
  currency: string;
  description: string;
  callbackUrl: string;
  methods: string[];
  supportedNetworks: string[];
};

export type ProviderInvoiceSnapshot = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  description?: string | null;
  url?: string;
  metadata?: Record<string, string> | null;
  payments: ProviderPaymentSnapshot[];
};

export type ProviderPaymentSnapshot = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  description?: string | null;
  invoiceId?: string | null;
  metadata?: Record<string, string> | null;
};

export interface PaymentGateway {
  id: PaymentProviderId;
  isConfigured(): boolean;
  getPublishableKey(): string | null;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot>;
  fetchInvoice?(invoiceId: string): Promise<ProviderInvoiceSnapshot>;
}
