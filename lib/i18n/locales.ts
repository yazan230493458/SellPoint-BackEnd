export const BACKEND_LOCALES = [
  "en",
  "ar",
  "es",
  "fr",
  "de",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "pt",
  "pt-BR",
  "ru",
  "tr",
  "it",
  "nl",
  "hi",
  "ur",
  "id",
  "ms",
  "bn",
  "fa",
  "th",
  "vi",
  "pl",
  "uk",
  "sv",
  "nb",
  "da",
  "fi",
  "el",
  "he",
  "ro",
  "cs",
  "hu",
  "bg",
  "hr",
  "sr",
  "sk",
  "sl",
  "sw",
  "fil",
  "ta",
  "te",
  "mr",
  "gu",
  "kn",
  "ml",
  "ne",
  "si",
  "az",
  "kk",
  "uz",
  "hy",
  "ka",
  "is",
  "ga",
  "cy",
  "af",
  "am",
  "km",
  "lo",
  "my",
  "mn",
  "bs",
  "mk",
  "sq",
  "lt",
  "lv",
  "et",
] as const;

export type BackendLocale = (typeof BACKEND_LOCALES)[number];

export const isBackendLocale = (value: string): value is BackendLocale =>
  (BACKEND_LOCALES as readonly string[]).includes(value);

export const normalizeLocale = (value: string | undefined | null): BackendLocale => {
  if (!value) return "en";
  const trimmed = value.trim();
  if (isBackendLocale(trimmed)) return trimmed;
  const base = trimmed.split("-")[0] ?? "";
  if (base === "zh") {
    if (/tw|hk|hant/i.test(trimmed)) return "zh-TW";
    return "zh-CN";
  }
  if (base === "pt" && /br/i.test(trimmed)) return "pt-BR";
  if (isBackendLocale(base)) return base;
  return "en";
};
