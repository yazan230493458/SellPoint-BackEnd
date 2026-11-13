import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import {
  accessCookieName,
  refreshCookieName,
  secureCookie,
  setSessionCookies,
  clearSessionCookies,
} from "../lib/cookies.js";

const collectCookies = () => {
  const cookies: string[] = [];
  const res = {
    append: (_name: string, value: string) => {
      cookies.push(value);
    },
  } as unknown as Response;
  return { cookies, res };
};

test("session cookies are HttpOnly, SameSite=Lax, Path=/, with correct max-age", () => {
  const previous = process.env.COOKIE_SECURE;
  process.env.COOKIE_SECURE = "1";
  try {
    const { cookies, res } = collectCookies();
    setSessionCookies(res, { accessToken: "access.jwt", refreshToken: "refresh.token" });
    assert.equal(cookies.length, 2);

    const access = cookies.find((value) => value.startsWith(`${accessCookieName}=`));
    const refresh = cookies.find((value) => value.startsWith(`${refreshCookieName}=`));
    assert.ok(access);
    assert.ok(refresh);

    for (const cookie of [access, refresh]) {
      assert.match(cookie, /Path=\//);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Secure/i);
      assert.doesNotMatch(cookie, /; Domain=/i);
    }

    assert.match(access, /Max-Age=900/);
    assert.match(refresh, /Max-Age=604800/);
  } finally {
    if (previous === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previous;
  }
});

test("clearing session cookies keeps HttpOnly and Secure flags", () => {
  process.env.COOKIE_SECURE = "1";
  const { cookies, res } = collectCookies();
  clearSessionCookies(res);
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
  }
});

test("secureCookie defaults to true in production unless COOKIE_SECURE=0", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCookieSecure = process.env.COOKIE_SECURE;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.COOKIE_SECURE;
    assert.equal(secureCookie(), true);

    process.env.COOKIE_SECURE = "0";
    assert.equal(secureCookie(), false);

    process.env.NODE_ENV = "development";
    delete process.env.COOKIE_SECURE;
    assert.equal(secureCookie(), false);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousCookieSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previousCookieSecure;
  }
});
