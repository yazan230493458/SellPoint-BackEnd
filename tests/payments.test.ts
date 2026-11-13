import assert from "node:assert/strict";
import test from "node:test";
import { toMinorUnits, minorUnitsMatch, assertSarCurrency } from "../lib/payments/money.js";
import { paymentSignaturesMatch, signPaymentBody } from "../lib/payment-signature.js";
import { getGatewayCatalogForClient, GATEWAY_CATALOG } from "../lib/payments/catalog.js";

test("SAR amounts convert to Moyasar halalas without floating error", () => {
  assert.equal(toMinorUnits("29.00", "SAR"), 2900);
  assert.equal(toMinorUnits("29.99", "SAR"), 2999);
  assert.equal(toMinorUnits(1, "SAR"), 100);
  assert.equal(minorUnitsMatch("29.00", 2900, "SAR"), true);
  assert.equal(minorUnitsMatch("29.00", 2901, "SAR"), false);
  assert.throws(() => toMinorUnits("0.50", "SAR"));
  assert.throws(() => toMinorUnits("10.00", "USD"));
  assert.throws(() => assertSarCurrency("USD"));
});

test("gateway catalog prioritizes Moyasar and does not claim unimplemented providers are live", () => {
  const catalog = getGatewayCatalogForClient();
  assert.equal(catalog.activeProvider, "moyasar");
  const moyasar = GATEWAY_CATALOG.find((entry) => entry.id === "moyasar");
  assert.equal(moyasar?.implemented, true);
  assert.ok(moyasar?.methods.some((method) => method.id === "mada" && method.available));
  assert.ok(moyasar?.methods.some((method) => method.id === "stcpay" && method.available));
  assert.ok(GATEWAY_CATALOG.filter((entry) => entry.id !== "moyasar").every((entry) => !entry.implemented));
  const paylink = GATEWAY_CATALOG.find((entry) => entry.id === "paylink");
  assert.equal(paylink?.methods.find((method) => method.id === "stcpay")?.available, false);
});

test("legacy payment body signatures still compare in constant time", () => {
  const body = Buffer.from('{"paymentId":1,"status":"COMPLETED"}');
  const signature = signPaymentBody("test-secret", body);
  assert.equal(paymentSignaturesMatch(signature, signPaymentBody("test-secret", body)), true);
  assert.equal(paymentSignaturesMatch(signature, signPaymentBody("other-secret", body)), false);
});
