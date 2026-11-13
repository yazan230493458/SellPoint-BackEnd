#!/usr/bin/env node
/**
 * Builds translation-fill-data.mjs from LLM-authored per-locale arrays (KEYS order, 99 each).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import es from "./es-complete.json" with { type: "json" };
import { LOCALE_ARRAYS } from "./locale-array-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const partial = JSON.parse(await fs.readFile(path.join(__dirname, "locale-array-partial.json"), "utf8"));

const FILL = {};
for (const [locale, arr] of Object.entries(LOCALE_ARRAYS)) {
  if (arr.length !== KEYS.length) {
    throw new Error(`${locale}: expected ${KEYS.length}, got ${arr.length}`);
  }
  const byKey = {};
  for (let i = 0; i < KEYS.length; i++) {
    if (partial[locale] && partial[locale][i] !== null) continue;
    byKey[KEYS[i]] = arr[i];
  }
  if (Object.keys(byKey).length) FILL[locale] = byKey;
}

const body = `/** Auto-generated — LLM-authored API message fills. */
export const FILL = ${JSON.stringify(FILL, null, 2)};
`;
await fs.writeFile(path.join(__dirname, "translation-fill-data.mjs"), body);
console.log("Locales filled:", Object.keys(FILL).length);
let cells = 0;
for (const v of Object.values(FILL)) cells += Object.keys(v).length;
console.log("Cells:", cells);
