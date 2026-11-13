import { createHmac, timingSafeEqual } from "node:crypto";

export const signPaymentBody = (secret: string, body: Buffer) =>
  createHmac("sha256", secret).update(body).digest("hex");

export const paymentSignaturesMatch = (provided: string, expected: string) => {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};
