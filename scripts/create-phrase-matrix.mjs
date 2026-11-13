#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import es from "./es-complete.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  await fs.readFile(path.join(__dirname, "../lib/i18n/catalog.json"), "utf8"),
);

const INCOMPLETE = [
  "zh-CN","zh-TW","ja","ko","tr","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

const enBySpanish = Object.fromEntries(Object.entries(es).map(([k, v]) => [v, k]));
const spanishPhrases = [...new Set(Object.values(es))];

/** @type {Record<string, Record<string, string>>} */
const BY_ES = {};
for (const sp of spanishPhrases) {
  BY_ES[sp] = {};
  const en = enBySpanish[sp];
  for (const locale of INCOMPLETE) {
    BY_ES[sp][locale] = catalog[en]?.[locale] ?? "";
  }
}

await fs.writeFile(
  path.join(__dirname, "phrase-matrix.json"),
  `${JSON.stringify(BY_ES, null, 2)}\n`,
);

let empty = 0;
for (const sp of spanishPhrases) {
  for (const locale of INCOMPLETE) {
    if (!BY_ES[sp][locale]) empty++;
  }
}
console.log("phrases", spanishPhrases.length, "empty cells", empty);
