#!/usr/bin/env node
/**
 * Builds llm-full-translations.json from per-locale modules (LLM-authored).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parts = [
  "./llm-data/part-a.mjs",
  "./llm-data/part-b.mjs",
  "./llm-data/part-c.mjs",
  "./llm-data/part-d.mjs",
  "./llm-data/part-e.mjs",
];

/** @type {Record<string, Record<string, string>>} */
const merged = {};

for (const part of parts) {
  const mod = await import(path.join(__dirname, part));
  Object.assign(merged, mod.default ?? mod.LOCALE_MAPS ?? {});
}

const out = path.join(__dirname, "llm-full-translations.json");
await fs.writeFile(out, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Locales: ${Object.keys(merged).length}`);
