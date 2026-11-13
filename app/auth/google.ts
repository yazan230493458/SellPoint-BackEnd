import "../../lib/env.js";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { connectOAuthAccount } from "../../lib/oauth-account.js";

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackURL = process.env.GOOGLE_CALLBACK_URL;

export const googleConfigured = Boolean(clientID && clientSecret && callbackURL);

if (googleConfigured && clientID && clientSecret && callbackURL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? "";
          const verified = profile.emails?.[0]?.verified === true;
          const user = await connectOAuthAccount({
            provider: "google",
            providerId: profile.id,
            email,
            emailVerified: verified,
            firstName: profile.name?.givenName ?? "",
            lastName: profile.name?.familyName ?? "",
            avatarUrl: profile.photos?.[0]?.value ?? null,
          });
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

export default passport;
