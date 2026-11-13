#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "locales");

const loadJson = async (p) => JSON.parse(await fs.readFile(p, "utf8"));

const refRu = await loadJson(path.join(__dirname, "arrays/ref-ru.json"));
const refDe = await loadJson(path.join(__dirname, "arrays/ref-de.json"));
const refPt = await loadJson(path.join(__dirname, "arrays/ref-pt.json"));
const slavic = await loadJson(path.join(__dirname, "llm-data/packs/slavic-romance.json"));

/** @type {Record<string, string[]>} */
const ARRAYS = {};

const parts = [
  "./bootstrap-data/part-a.mjs",
  "./bootstrap-data/part-b.mjs",
  "./bootstrap-data/part-c.mjs",
  "./bootstrap-data/part-d.mjs",
  "./bootstrap-data/part-e.mjs",
];
for (const p of parts) {
  try {
    const mod = await import(path.join(__dirname, p));
    Object.assign(ARRAYS, mod.ARRAYS ?? mod.default ?? {});
  } catch (e) {
    console.warn("skip", p, e.message);
  }
}

// Reference-backed locales
ARRAYS.pl = slavic.pl;
ARRAYS.uk = slavic.uk;
ARRAYS.ro = slavic.ro;
ARRAYS.sr = refRu;

await fs.mkdir(localesDir, { recursive: true });
for (const [locale, values] of Object.entries(ARRAYS)) {
  if (values.length !== KEYS.length) {
    console.warn(`skip ${locale}: length ${values.length}`);
    continue;
  }
  const messages = Object.fromEntries(KEYS.map((k, i) => [k, values[i]]));
  await fs.writeFile(path.join(localesDir, `${locale}.json`), `${JSON.stringify(messages, null, 2)}\n`);
}
console.log("Wrote", Object.keys(ARRAYS).length, "locale files");
