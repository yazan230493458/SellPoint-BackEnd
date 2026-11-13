import type { GatewayCatalogEntry, PaymentProviderId } from "./types.js";

/**
 * Verified capability notes for Saudi gateways.
 * Availability still depends on merchant activation in each provider dashboard.
 */
export const GATEWAY_CATALOG: GatewayCatalogEntry[] = [
  {
    id: "moyasar",
    name: "Moyasar",
    implemented: true,
    checkoutMode: "hosted_redirect",
    currency: "SAR",
    methods: [
      { id: "mada", available: true },
      { id: "visa", available: true },
      { id: "mastercard", available: true },
      { id: "applepay", available: true, notes: "Requires Apple Pay domain verification in Moyasar" },
      { id: "stcpay", available: true, notes: "Requires STC Pay activation on the Moyasar account" },
    ],
  },
  {
    id: "hyperpay",
    name: "HyperPay",
    implemented: false,
    checkoutMode: "not_implemented",
    currency: "SAR",
    methods: [
      { id: "mada", available: true },
      { id: "visa", available: true },
      { id: "mastercard", available: true },
      { id: "applepay", available: true },
      { id: "stcpay", available: true },
    ],
  },
  {
    id: "paytabs",
    name: "PayTabs",
    implemented: false,
    checkoutMode: "not_implemented",
    currency: "SAR",
    methods: [
      { id: "mada", available: true },
      { id: "visa", available: true },
      { id: "mastercard", available: true },
      { id: "applepay", available: true },
      { id: "stcpay", available: true },
    ],
  },
  {
    id: "tap",
    name: "Tap Payments",
    implemented: false,
    checkoutMode: "not_implemented",
    currency: "SAR",
    methods: [
      { id: "mada", available: true },
      { id: "visa", available: true },
      { id: "mastercard", available: true },
      { id: "applepay", available: true },
      { id: "stcpay", available: true },
    ],
  },
  {
    id: "paylink",
    name: "Paylink",
    implemented: false,
    checkoutMode: "not_implemented",
    currency: "SAR",
    methods: [
      { id: "mada", available: true },
      { id: "visa", available: true, notes: "Confirm Visa enablement with Paylink merchant support" },
      { id: "mastercard", available: true },
      { id: "applepay", available: true },
      { id: "stcpay", available: false, notes: "Not listed in current Paylink payment-methods docs" },
    ],
  },
  {
    id: "amazon_ps",
    name: "Amazon Payment Services",
    implemented: false,
    checkoutMode: "not_implemented",
    currency: "SAR",
    methods: [
      { id: "mada", available: true },
      { id: "visa", available: true },
      { id: "mastercard", available: true },
      { id: "applepay", available: true },
      { id: "stcpay", available: true, notes: "Requires APS STC Pay channel activation" },
    ],
  },
];

export const getActiveProviderId = (): PaymentProviderId => {
  const configured = (process.env.PAYMENT_PROVIDER ?? "moyasar").trim().toLowerCase();
  const match = GATEWAY_CATALOG.find((entry) => entry.id === configured);
  return match?.id ?? "moyasar";
};

export const getGatewayCatalogForClient = () => {
  const active = getActiveProviderId();
  return {
    activeProvider: active,
    gateways: GATEWAY_CATALOG.map((gateway) => ({
      id: gateway.id,
      name: gateway.name,
      implemented: gateway.implemented,
      active: gateway.id === active,
      currency: gateway.currency,
      methods: gateway.methods.filter((method) => method.available).map((method) => method.id),
    })),
  };
};
