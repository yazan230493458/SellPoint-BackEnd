import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import passport, { googleConfigured } from "./google.js";
import { completeOAuthLogin, redirectOAuthError } from "../../lib/oauth-login.js";
import { clearOAuthStateCookie, readOAuthState, setOAuthStateCookie } from "../../lib/cookies.js";

const router = Router();

const statesMatch = (left: string, right: string) => {
  const provided = Buffer.from(left);
  const expected = Buffer.from(right);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

router.get("/auth/google", (req, res, next) => {
  if (!googleConfigured) {
    redirectOAuthError(res, "google");
    return;
  }
  const state = randomBytes(24).toString("hex");
  setOAuthStateCookie(res, state);
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state,
  })(req, res, next);
});

router.get("/auth/google/callback", (req, res, next) => {
  if (!googleConfigured) {
    redirectOAuthError(res, "google");
    return;
  }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const expected = readOAuthState(req.headers.cookie);
  clearOAuthStateCookie(res);
  if (!state || !expected || !statesMatch(state, expected)) {
    redirectOAuthError(res, "google");
    return;
  }
  passport.authenticate("google", { session: false }, (error: unknown, user: { id: number; username: string | null; email: string; role: string; tokenVersion: number } | false) => {
    if (error || !user) {
      redirectOAuthError(res, "google");
      return;
    }
    void completeOAuthLogin(req, res, user).catch(next);
  })(req, res, next);
});

export default router;
