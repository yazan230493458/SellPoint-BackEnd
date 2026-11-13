#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import es from "./es-complete.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const matrix = JSON.parse(await fs.readFile(path.join(__dirname, "phrase-matrix.json"), "utf8"));
const catalog = JSON.parse(await fs.readFile(path.join(root, "lib/i18n/catalog.json"), "utf8"));

const enBySpanish = Object.fromEntries(Object.entries(es).map(([k, v]) => [v, k]));

for (const [sp, byLocale] of Object.entries(matrix)) {
  const en = enBySpanish[sp];
  if (!en) continue;
  catalog[en] ??= {};
  for (const [locale, text] of Object.entries(byLocale)) {
    if (text) catalog[en][locale] = text;
  }
}

await fs.writeFile(path.join(root, "lib/i18n/catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

const messagesTs = `import type { BackendLocale } from "./locales.js";

type MessageCatalog = Record<string, Partial<Record<BackendLocale, string>>>;

export const apiMessages = ${JSON.stringify(catalog, null, 2)} as MessageCatalog;

export const translateMessage = (message: string, locale: BackendLocale) => {
  if (locale === "en") return message;
  const entry = apiMessages[message];
  return entry?.[locale] ?? message;
};
`;

await fs.writeFile(path.join(root, "lib/i18n/messages.ts"), messagesTs);

const BACKEND = [
  "ar","es","fr","de","zh-CN","zh-TW","ja","ko","pt","pt-BR","ru","tr","it","nl","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

let gaps = 0;
for (const l of BACKEND) gaps += KEYS.filter((k) => !catalog[k]?.[l]).length;
console.log("gaps", gaps);
