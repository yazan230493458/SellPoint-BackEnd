import assert from "node:assert/strict";
import test from "node:test";
import { totpAt, verifyTotp } from "../lib/totp.js";
import { paymentSignaturesMatch, signPaymentBody } from "../lib/payment-signature.js";
import { isOpenChallenge, isUsableRecoveryToken, nextFailedAttempt } from "../lib/challenge-policy.js";

test("a current authenticator code is accepted and a distant code is rejected", () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const now = 1_700_000_000_000;
  const code = totpAt(secret, Math.floor(now / 30000));
  assert.equal(verifyTotp(secret, code, now), true);
  assert.equal(verifyTotp(secret, code, now + 120_000), false);
  assert.equal(verifyTotp(secret, "000000", now), false);
});

test("payment signatures match only the exact body and secret", () => {
  const body = Buffer.from('{"paymentId":1,"status":"COMPLETED"}');
  const signature = signPaymentBody("test-secret", body);
  assert.equal(paymentSignaturesMatch(signature, signPaymentBody("test-secret", body)), true);
  assert.equal(paymentSignaturesMatch(signature, signPaymentBody("other-secret", body)), false);
  assert.equal(paymentSignaturesMatch("short", signature), false);
});

test("login challenges close when expired, consumed, or attempted five times", () => {
  const now = 1_700_000_000_000;
  const open = { consumedAt: null, expiresAt: new Date(now + 60_000), attempts: 0 };
  assert.equal(isOpenChallenge(open, now), true);
  assert.equal(isOpenChallenge({ ...open, expiresAt: new Date(now - 1) }, now), false);
  assert.equal(isOpenChallenge({ ...open, consumedAt: new Date(now) }, now), false);
  assert.equal(isOpenChallenge({ ...open, attempts: 5 }, now), false);
  assert.equal(isOpenChallenge(null, now), false);
  assert.deepEqual(nextFailedAttempt(4), { attempts: 5, consumed: true });
  assert.deepEqual(nextFailedAttempt(1), { attempts: 2, consumed: false });
});

test("recovery tokens cannot be reused or used after expiry", () => {
  const now = 1_700_000_000_000;
  const token = { usedAt: null, expiresAt: new Date(now + 60_000) };
  assert.equal(isUsableRecoveryToken(token, now), true);
  assert.equal(isUsableRecoveryToken({ ...token, usedAt: new Date(now) }, now), false);
  assert.equal(isUsableRecoveryToken({ ...token, expiresAt: new Date(now) }, now), false);
  assert.equal(isUsableRecoveryToken(null, now), false);
});
