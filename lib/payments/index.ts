import { HttpError } from "../http.js";
import { getActiveProviderId, getGatewayCatalogForClient, GATEWAY_CATALOG } from "./catalog.js";
import { MoyasarGateway } from "./moyasar.js";
import type { PaymentGateway, PaymentProviderId } from "./types.js";

const moyasar = new MoyasarGateway();

export const getPaymentGateway = (providerId?: PaymentProviderId): PaymentGateway => {
  const id = providerId ?? getActiveProviderId();
  if (id === "moyasar") return moyasar;

  const catalog = GATEWAY_CATALOG.find((entry) => entry.id === id);
  throw new HttpError(
    503,
    `${catalog?.name ?? id} is prepared in the payment architecture but is not implemented yet. Use Moyasar or set PAYMENT_PROVIDER=moyasar.`,
  );
};

export const isPaymentProviderConfigured = () => {
  try {
    return getPaymentGateway().isConfigured();
  } catch {
    return false;
  }
};

export {
  getActiveProviderId,
  getGatewayCatalogForClient,
  GATEWAY_CATALOG,
};
export * from "./types.js";
export * from "./money.js";
export * from "./settlement.js";
export {
  verifyMoyasarWebhookSecret,
  moyasarWebhookSecretConfigured,
} from "./moyasar.js";
