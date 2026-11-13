#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const patchDir = path.join(root, "lib/i18n/llm-patches");
const messagesPath = path.join(root, "lib/i18n/messages.ts");

const LOCALES = [
  "ar","es","fr","de","zh-CN","zh-TW","ja","ko","pt","pt-BR","ru","tr","it","nl","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

let patchFiles = [];
try {
  patchFiles = (await fs.readdir(patchDir)).filter((f) => f.endsWith(".json"));
} catch {
  patchFiles = [];
}

for (const file of patchFiles.sort()) {
  const patch = JSON.parse(await fs.readFile(path.join(patchDir, file), "utf8"));
  const localeFile = file.startsWith("locale-");
  if (localeFile) {
    const locale = file.replace(/^locale-/, "").replace(/\.json$/, "");
    for (const [message, text] of Object.entries(patch)) {
      catalog[message] ??= {};
      if (!catalog[message][locale]) catalog[message][locale] = text;
    }
  } else {
    for (const [message, byLocale] of Object.entries(patch)) {
      catalog[message] ??= {};
      for (const [locale, text] of Object.entries(byLocale)) {
        if (!catalog[message][locale]) catalog[message][locale] = text;
      }
    }
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

let gaps = 0;
for (const message of Object.keys(catalog)) {
  for (const locale of LOCALES) {
    if (!catalog[message][locale]) gaps += 1;
  }
}
console.log(`Merged ${patchFiles.length} patch file(s). Remaining gaps: ${gaps}`);
