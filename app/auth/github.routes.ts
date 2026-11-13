import { Router } from "express";
import { randomBytes } from "node:crypto";
import "../../lib/env.js";
import { connectOAuthAccount } from "../../lib/oauth-account.js";
import { completeOAuthLogin, redirectOAuthError } from "../../lib/oauth-login.js";
import { clearOAuthStateCookie, readOAuthState, setOAuthStateCookie } from "../../lib/cookies.js";

const router = Router();

const clientId = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;
const callbackURL = process.env.GITHUB_CALLBACK_URL;
const githubConfigured = Boolean(clientId && clientSecret && callbackURL);

type GitHubUser = {
  id?: number;
  name?: string | null;
  avatar_url?: string | null;
};

type GitHubEmail = {
  email?: string;
  primary?: boolean;
  verified?: boolean;
};

router.get("/auth/github", (_req, res) => {
  if (!githubConfigured || !clientId || !callbackURL) {
    redirectOAuthError(res, "github");
    return;
  }
  const state = randomBytes(24).toString("hex");
  setOAuthStateCookie(res, state);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackURL);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

router.get("/auth/github/callback", async (req, res) => {
  try {
    if (!githubConfigured || !clientId || !clientSecret || !callbackURL) {
      redirectOAuthError(res, "github");
      return;
    }

    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const expected = readOAuthState(req.headers.cookie);
    clearOAuthStateCookie(res);
    if (!code || !state || !expected || state !== expected) {
      redirectOAuthError(res, "github");
      return;
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "SellPoint",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackURL,
      }),
    });
    const token = await tokenResponse.json() as { access_token?: string };
    if (!tokenResponse.ok || !token.access_token) {
      redirectOAuthError(res, "github");
      return;
    }

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "SellPoint",
    };
    const [profileResponse, emailsResponse] = await Promise.all([
      fetch("https://api.github.com/user", { headers }),
      fetch("https://api.github.com/user/emails", { headers }),
    ]);
    if (!profileResponse.ok || !emailsResponse.ok) {
      redirectOAuthError(res, "github");
      return;
    }

    const profile = await profileResponse.json() as GitHubUser;
    const emails = await emailsResponse.json() as GitHubEmail[];
    const verified = Array.isArray(emails)
      ? emails.find((item) => item.primary && item.verified && item.email) ?? emails.find((item) => item.verified && item.email)
      : undefined;
    if (!profile.id || !verified?.email) {
      redirectOAuthError(res, "github");
      return;
    }

    const name = (profile.name ?? "").trim();
    const [firstName = "", ...rest] = name.split(/\s+/);
    const account = await connectOAuthAccount({
      provider: "github",
      providerId: String(profile.id),
      email: verified.email,
      emailVerified: true,
      firstName,
      lastName: rest.join(" "),
      avatarUrl: profile.avatar_url ?? null,
    });
    await completeOAuthLogin(req, res, account);
  } catch {
    redirectOAuthError(res, "github");
  }
});

export default router;
