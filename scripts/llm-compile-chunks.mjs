#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chunks = ["llm-chunk-europe.mjs", "llm-chunk-asia.mjs", "llm-chunk-rest.mjs"];

/** @type {Record<string, Record<string, string>>} */
const merged = {};

for (const file of chunks) {
  try {
    const mod = await import(path.join(__dirname, file));
    Object.assign(merged, mod.LOCALE_MAPS ?? {});
  } catch (e) {
    console.warn(`Skip ${file}:`, e.message);
  }
}

const out = path.join(__dirname, "llm-full-translations.json");
await fs.writeFile(out, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Wrote ${Object.keys(merged).length} locales to llm-full-translations.json`);
