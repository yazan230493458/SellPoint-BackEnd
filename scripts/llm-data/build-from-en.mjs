#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const outPath = path.join(__dirname, "en-translations.mjs");

const LOCALES = [
  "ar","de","zh-CN","zh-TW","ja","ko","pt","pt-BR","ru","tr","it","nl","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const keys = Object.keys(catalog);

/** @type {Record<string, Record<string, string>>} */
const T = {};
for (const locale of LOCALES) T[locale] = {};

for (const msg of keys) {
  for (const locale of LOCALES) {
    const v = catalog[msg]?.[locale];
    if (v) T[locale][msg] = v;
  }
}

let gaps = 0;
for (const locale of LOCALES) {
  for (const msg of keys) {
    if (!T[locale][msg]) gaps += 1;
  }
}

const body = `/** English message key -> translation. ${gaps} gaps to fill via GAP_FILL import. */
export const T = ${JSON.stringify(T, null, 2)};

export const GAP_FILL = {};
`;
await fs.writeFile(outPath, body);
console.log("Wrote en-translations.mjs, gaps:", gaps);
