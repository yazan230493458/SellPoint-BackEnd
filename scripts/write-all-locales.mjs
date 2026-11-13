#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import { LOCALE_ARRAYS } from "./locale-array-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const messagesPath = path.join(root, "lib/i18n/messages.ts");
const localesDir = path.join(__dirname, "locales");

const refRu = JSON.parse(await fs.readFile(path.join(__dirname, "arrays/ref-ru.json"), "utf8"));
const slavic = JSON.parse(
  await fs.readFile(path.join(__dirname, "llm-data/packs/slavic-romance.json"), "utf8"),
);

LOCALE_ARRAYS.pl = slavic.pl;
LOCALE_ARRAYS.uk = slavic.uk;
LOCALE_ARRAYS.ro = slavic.ro;
LOCALE_ARRAYS.sr = refRu;

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
await fs.mkdir(localesDir, { recursive: true });

for (const [locale, values] of Object.entries(LOCALE_ARRAYS)) {
  if (!values || values.length !== KEYS.length) {
    console.warn("skip", locale, values?.length);
    continue;
  }
  for (let i = 0; i < KEYS.length; i++) {
    catalog[KEYS[i]] ??= {};
    catalog[KEYS[i]][locale] = values[i];
  }
}

await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

const messagesTs = `import type { BackendLocale } from "./locales.js";

type MessageCatalog = Record<string, Partial<Record<BackendLocale, string>>>;

export const apiMessages = ${JSON.stringify(catalog, null, 2)} as MessageCatalog;

export const translateMessage = (message: string, locale: BackendLocale) => {
  if (locale === "en") return message;
  const entry = apiMessages[message];
  return entry?.[locale] ?? message;
};
`;

await fs.writeFile(messagesPath, messagesTs);

const BACKEND = [
  "ar","es","fr","de","zh-CN","zh-TW","ja","ko","pt","pt-BR","ru","tr","it","nl","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];
let gaps = 0;
const bad = [];
for (const l of BACKEND) {
  const m = KEYS.filter((k) => !catalog[k]?.[l]).length;
  if (m) {
    gaps += m;
    bad.push(l);
  }
}
console.log("Messages:", KEYS.length, "Gaps:", gaps, "Incomplete locales:", bad.length, bad.join(", "));
