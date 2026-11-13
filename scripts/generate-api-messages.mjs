#!/usr/bin/env node
/**
 * Expands BackEnd/lib/i18n catalog for all backend locales via MyMemory (+ gtx).
 * Resumes from catalog.json.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LOCALES = [
  "ar","es","fr","de","zh-CN","zh-TW","ja","ko","pt","pt-BR","ru","tr","it","nl","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

const TRANSLATE_MAP = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  "pt-BR": "pt-BR",
  nb: "no",
  fil: "tl",
  he: "he",
};

const SEED_MESSAGES = [
  "Unauthorized","Forbidden","User not found","Invalid input","Endpoint not found","Internal server error","Record already exists","Record not found","Ad not found","Comment not found","New comment","Report updated","Invalid token","Invalid credentials","Account is disabled","User already exists","Too many requests","Cross-site request blocked","Invalid data provided","Invalid country","Invalid city","Invalid category","Invalid ad name","Invalid ad ID","Invalid main image index","Invalid image path","Eligible user not found","Administrator not found","You cannot change your own status","The final owner cannot be disabled","Invalid user","You cannot delete your own account here","Owner accounts cannot be deleted","Advertisement not found","Report not found","Setting not found","Invalid setting value","Two-factor authentication is not enrolled","Invalid or expired verification challenge","Invalid or expired recovery token","Invalid or expired verification code","This message was already sent","Invalid message","Message not found","Conversation not found","You cannot message yourself","Seller not found","This user is not accepting messages","You cannot message this user","Invalid conversation","Image is required","Attachment not found","Invalid attachment","Invalid mobile number","You must accept the terms and conditions","Ad created successfully","Ad removed successfully","Ad updated successfully","Advertisement activity","Administrator access granted","An owner granted you administrator access.","User set as admin successfully","Administrator access revoked","Account deleted","Advertisement updated","Advertisement removed","Comment deleted","Review deleted","An account identifier is required","Session retrieved","Two-factor authentication is required","Login successful","User registered successfully","Logged out","Session renewed","If an account with that email exists and delivery succeeds, a password reset message will arrive shortly.","Password recovery email is not configured.","Password changed","Your password was reset.","Password updated","Verification delivery is not configured.","Verification code created.","Verification completed","Invalid category ID","Category not found","Parent category not found","Parent category is inactive","Category name or slug already exists","Category cannot be its own parent","Invalid category hierarchy","Subscription active","Your payment was verified and your subscription is now active.","Password must contain a number","Password must contain a lowercase letter","Password must contain an uppercase letter","Password must contain a special character","Password must not contain spaces","Upload rejected","User is already an administrator","Database request could not be completed","Image type not supported","Invalid image content","Invalid upload destination",
];

const EMAIL = process.env.MYMEMORY_EMAIL || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const protect = (text) => {
  const tokens = [];
  const protectedText = String(text).replace(
    /(\{[^}]+\})|(SellPoint)|(%[sd])/g,
    (match) => {
      const id = `⟦${tokens.length}⟧`;
      tokens.push(match);
      return id;
    },
  );
  return { protectedText, tokens };
};

const restore = (text, tokens) =>
  String(text).replace(/⟦\s*(\d+)\s*⟧/g, (_, i) => tokens[Number(i)] ?? "");

const translateMyMemory = async (text, target) => {
  const tl = TRANSLATE_MAP[target] ?? target;
  const { protectedText, tokens } = protect(text);
  const params = new URLSearchParams({
    q: protectedText,
    langpair: `en|${tl}`,
  });
  if (EMAIL) params.set("de", EMAIL);
  const response = await fetch(
    `https://api.mymemory.translated.net/get?${params.toString()}`,
  );
  if (!response.ok) throw Object.assign(new Error(`mymemory ${response.status}`), { status: response.status });
  const data = await response.json();
  if (data?.responseStatus && Number(data.responseStatus) !== 200) {
    throw Object.assign(new Error(`mymemory status ${data.responseStatus}`), {
      status: Number(data.responseStatus),
    });
  }
  const translated = data?.responseData?.translatedText;
  if (!translated || /MYMEMORY WARNING/i.test(translated)) {
    throw new Error(translated || "empty");
  }
  return restore(translated, tokens);
};

const translateGtx = async (text, target) => {
  const tl = TRANSLATE_MAP[target] ?? target;
  const { protectedText, tokens } = protect(text);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(protectedText)}`;
  const response = await fetch(url);
  if (!response.ok) throw Object.assign(new Error(`gtx ${response.status}`), { status: response.status });
  const data = await response.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map((part) => part?.[0] ?? "").join("")
    : protectedText;
  return restore(translated, tokens);
};

const translateOne = async (text, target) => {
  try {
    return await translateMyMemory(text, target);
  } catch {
    return translateGtx(text, target);
  }
};

const catalogPath = path.join(root, "lib/i18n/catalog.json");
let catalog = {};
try {
  catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
} catch {
  catalog = {};
}

for (const message of SEED_MESSAGES) {
  catalog[message] ??= {};
}

console.log(`Expanding ${Object.keys(catalog).length} messages × ${LOCALES.length} locales`);

for (const locale of LOCALES) {
  let filled = 0;
  for (const message of Object.keys(catalog)) {
    if (catalog[message][locale]) continue;
    let attempts = 0;
    while (attempts < 5) {
      try {
        catalog[message][locale] = await translateOne(message, locale);
        filled += 1;
        await sleep(130);
        break;
      } catch (error) {
        attempts += 1;
        const wait = Math.min(25000, 1000 * 2 ** attempts);
        console.warn(`[${locale}] ${message.slice(0, 40)}: ${error.message}; wait ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`[${locale}] filled ${filled}`);
  await sleep(300);
}

const messagesTs = `import type { BackendLocale } from "./locales.js";

type MessageCatalog = Record<string, Partial<Record<BackendLocale, string>>>;

/** Auto-generated API/user-facing message catalog. Prefer running scripts/generate-api-messages.mjs to refresh. */
export const apiMessages = ${JSON.stringify(catalog, null, 2)} as MessageCatalog;

export const translateMessage = (message: string, locale: BackendLocale) => {
  if (locale === "en") return message;
  const entry = apiMessages[message];
  return entry?.[locale] ?? message;
};
`;

await fs.writeFile(path.join(root, "lib/i18n/messages.ts"), messagesTs);
console.log("Wrote catalog.json and messages.ts");
