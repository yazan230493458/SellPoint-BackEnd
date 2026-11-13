#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import { FILL } from "./translation-fill-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const messagesPath = path.join(root, "lib/i18n/messages.ts");

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

for (const [locale, byKey] of Object.entries(FILL)) {
  for (const [key, text] of Object.entries(byKey)) {
    if (!KEYS.includes(key)) continue;
    catalog[key] ??= {};
    catalog[key][locale] = text;
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
const incomplete = [];
for (const l of BACKEND) {
  const m = KEYS.filter((k) => !catalog[k]?.[l]).length;
  if (m) {
    gaps += m;
    incomplete.push(`${l}(${m})`);
  }
}
console.log("Messages:", KEYS.length, "Total gaps:", gaps);
if (incomplete.length) console.log(incomplete.join(", "));
