#!/usr/bin/env node
/**
 * LLM-authored catalog fill: builds locale patches from embedded translations.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const patchDir = path.join(root, "lib/i18n/llm-patches");

const KEYS = Object.keys(JSON.parse(await fs.readFile(catalogPath, "utf8")));

/** @type {Record<string, Record<string, string>>} */
const FULL = JSON.parse(
  await fs.readFile(path.join(__dirname, "llm-full-translations.json"), "utf8"),
);

await fs.mkdir(patchDir, { recursive: true });

for (const [locale, messages] of Object.entries(FULL)) {
  const out = {};
  for (const key of KEYS) {
    if (messages[key]) out[key] = messages[key];
  }
  await fs.writeFile(
    path.join(patchDir, `locale-${locale}.json`),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log(`Wrote locale-${locale}.json (${Object.keys(out).length} keys)`);
}
