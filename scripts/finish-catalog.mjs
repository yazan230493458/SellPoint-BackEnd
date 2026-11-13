#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const messagesPath = path.join(root, "lib/i18n/messages.ts");
const keysPath = path.join(__dirname, "_api-en-keys.json");
const localesDir = path.join(__dirname, "locales");

const KEYS = JSON.parse(await fs.readFile(keysPath, "utf8"));
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

let files = [];
try {
  files = (await fs.readdir(localesDir)).filter((f) => f.endsWith(".json"));
} catch {
  files = [];
}

for (const file of files.sort()) {
  const locale = file.replace(/\.json$/, "");
  const messages = JSON.parse(await fs.readFile(path.join(localesDir, file), "utf8"));
  for (const key of KEYS) {
    if (!messages[key]) continue;
    catalog[key] ??= {};
    catalog[key][locale] = messages[key];
  }
  console.log(`Applied ${locale}: ${Object.keys(messages).length} keys`);
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
    incomplete.push(`${l}:${m}`);
  }
}
console.log(`Messages: ${KEYS.length}, gaps: ${gaps}`);
if (incomplete.length) console.log("Incomplete:", incomplete.join(", "));
