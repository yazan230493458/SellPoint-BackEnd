#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import es from "./es-complete.json" with { type: "json" };
import ORDER from "./llm-data/es-order.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fromPhraseMap(mapBySpanish) {
  return KEYS.map((k) => mapBySpanish[es[k]]);
}

function from98(values98) {
  const m = Object.fromEntries(ORDER.map((sp, i) => [sp, values98[i]]));
  return KEYS.map((k) => m[es[k]]);
}

const slavic = JSON.parse(
  await fs.readFile(path.join(__dirname, "llm-data/packs/slavic-romance.json"), "utf8"),
);
const refRu = JSON.parse(await fs.readFile(path.join(__dirname, "arrays/ref-ru.json"), "utf8"));
const trMessages = JSON.parse(await fs.readFile(path.join(__dirname, "locales/tr.json"), "utf8"));
const tr = KEYS.map((k) => trMessages[k]);

/** @type {Record<string, string[]>} */
const LOCALE_ARRAYS = {
  tr,
  pl: from98(slavic.pl),
  uk: from98(slavic.uk),
  ro: from98(slavic.ro),
  sr: refRu,
};

// Import remaining from chunked data files
const chunks = ["cjk", "south", "europe", "nordic", "indic", "central"];
for (const chunk of chunks) {
  try {
    const data = JSON.parse(
      await fs.readFile(path.join(__dirname, `array-data/${chunk}.json`), "utf8"),
    );
    Object.assign(LOCALE_ARRAYS, data);
  } catch (e) {
    console.warn("missing chunk", chunk, e.message);
  }
}

for (const [locale, arr] of Object.entries(LOCALE_ARRAYS)) {
  if (arr.length !== KEYS.length) {
    throw new Error(`${locale}: expected ${KEYS.length}, got ${arr.length}`);
  }
}

const body = `export const LOCALE_ARRAYS = ${JSON.stringify(LOCALE_ARRAYS, null, 2)};\n`;
await fs.writeFile(path.join(__dirname, "locale-array-data.mjs"), body);
console.log("Locales:", Object.keys(LOCALE_ARRAYS).length);
