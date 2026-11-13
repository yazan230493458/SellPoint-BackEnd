#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import es from "../es-complete.json" with { type: "json" };
import ORDER from "./es-order.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, "../../lib/i18n/catalog.json");
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

const LOCALES = [
  "zh-CN","zh-TW","ja","ko","tr","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

function fromCatalog(locale) {
  return ORDER.map((sp) => {
    const en = Object.entries(es).find(([, v]) => v === sp)?.[0];
    return catalog[en]?.[locale] ?? null;
  });
}

/** @type {Record<string, string[]>} */
const arrays = {};

const packDir = path.join(__dirname, "packs");
const packFiles = await fs.readdir(packDir);
for (const file of packFiles) {
  if (!file.endsWith(".json")) continue;
  const chunk = JSON.parse(await fs.readFile(path.join(packDir, file), "utf8"));
  Object.assign(arrays, chunk);
}

for (const locale of LOCALES) {
  const catArr = fromCatalog(locale);
  const seed = arrays[locale];
  if (!seed) continue;
  arrays[locale] = seed.map((v, i) => catArr[i] ?? v);
}

for (const locale of LOCALES) {
  if (!arrays[locale]) {
    const catArr = fromCatalog(locale);
    if (catArr.every(Boolean)) arrays[locale] = catArr;
  }
}

await fs.writeFile(
  path.join(__dirname, "translation-arrays.json"),
  `${JSON.stringify(arrays, null, 2)}\n`,
);

const missing = LOCALES.filter((l) => !arrays[l] || arrays[l].some((x) => !x));
console.log("Locales ready:", Object.keys(arrays).length);
if (missing.length) console.log("Still missing:", missing.join(", "));
