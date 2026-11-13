/** Convert a decimal SAR amount into Moyasar minor units (halalas). */
export const toMinorUnits = (amount: string | number, currency = "SAR") => {
  const normalized = currency.trim().toUpperCase();
  if (normalized !== "SAR") {
    throw new Error(`Unsupported payment currency: ${normalized}`);
  }
  const raw = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Invalid payment amount format");
  }
  const [whole, fraction = ""] = raw.split(".");
  const minor = Number(`${whole}${fraction.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(minor) || minor < 100) {
    throw new Error("Payment amount must be at least 1.00 SAR");
  }
  return minor;
};

export const minorUnitsMatch = (
  expectedAmount: string | number,
  receivedMinor: number,
  currency = "SAR",
) => toMinorUnits(String(expectedAmount), currency) === receivedMinor;

export const assertSarCurrency = (currency: string) => {
  if (currency.trim().toUpperCase() !== "SAR") {
    throw new Error(`Only SAR is supported. Received: ${currency}`);
  }
};
