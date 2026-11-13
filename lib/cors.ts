/**
 * Trusted browser origins for CORS and Origin-based CSRF checks.
 * Configure CORS_ORIGIN as a single origin or a comma-separated allowlist.
 * Never use "*" with credentialed requests.
 */

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, "");

export const parseTrustedOrigins = (raw: string | undefined): string[] => {
  if (!raw?.trim()) return [];
  const origins = raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  if (origins.some((origin) => origin === "*")) {
    throw new Error(
      "CORS_ORIGIN must not be '*' when credentials are enabled. List explicit frontend origins.",
    );
  }

  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`Unsupported CORS origin protocol: ${origin}`);
      }
      if (origin !== url.origin) {
        throw new Error(`CORS_ORIGIN entries must be bare origins (got ${origin})`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("CORS_ORIGIN")) {
        throw error;
      }
      throw new Error(`Invalid CORS_ORIGIN entry: ${origin}`);
    }
  }

  return [...new Set(origins)];
};

export const isTrustedOrigin = (origin: string | undefined, trusted: string[]) =>
  Boolean(origin && trusted.includes(origin));
