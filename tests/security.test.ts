import assert from "node:assert/strict";
import test from "node:test";
import { parseTrustedOrigins, isTrustedOrigin } from "../lib/cors.js";
import { hstsEnabled, permissionsPolicyValue } from "../lib/security-headers.js";

test("parseTrustedOrigins rejects wildcard origins", () => {
  assert.throws(() => parseTrustedOrigins("*"), /must not be '\*'/);
  assert.throws(() => parseTrustedOrigins("https://a.example,*"), /must not be '\*'/);
});

test("parseTrustedOrigins accepts a comma-separated allowlist of bare origins", () => {
  const origins = parseTrustedOrigins(
    "https://sellpoint-pn8k.onrender.com, https://sellpoint-pn8k.onrender.com/",
  );
  assert.deepEqual(origins, ["https://sellpoint-pn8k.onrender.com"]);
  assert.equal(isTrustedOrigin("https://sellpoint-pn8k.onrender.com", origins), true);
  assert.equal(isTrustedOrigin("https://evil.example", origins), false);
});

test("parseTrustedOrigins rejects paths and invalid URLs", () => {
  assert.throws(() => parseTrustedOrigins("https://example.com/app"), /bare origins/);
  assert.throws(() => parseTrustedOrigins("not-a-url"), /Invalid CORS_ORIGIN/);
});

test("permissions policy disables powerful browser features by default", () => {
  assert.match(permissionsPolicyValue, /camera=\(\)/);
  assert.match(permissionsPolicyValue, /geolocation=\(\)/);
});

test("HSTS enablement requires production plus an HTTPS signal", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCookieSecure = process.env.COOKIE_SECURE;
  const previousEnableHsts = process.env.ENABLE_HSTS;
  try {
    process.env.NODE_ENV = "development";
    process.env.COOKIE_SECURE = "1";
    assert.equal(hstsEnabled(), false);

    process.env.NODE_ENV = "production";
    process.env.COOKIE_SECURE = "0";
    delete process.env.ENABLE_HSTS;
    assert.equal(hstsEnabled(), false);

    process.env.COOKIE_SECURE = "1";
    assert.equal(hstsEnabled(), true);

    process.env.COOKIE_SECURE = "0";
    process.env.ENABLE_HSTS = "1";
    assert.equal(hstsEnabled(), true);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousCookieSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previousCookieSecure;
    if (previousEnableHsts === undefined) delete process.env.ENABLE_HSTS;
    else process.env.ENABLE_HSTS = previousEnableHsts;
  }
});
