#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fragDir = path.join(__dirname, "fragments");

/** @type {Record<string, Record<string, string>>} */
const DATA = {};

const files = (await fs.readdir(fragDir)).filter((f) => f.endsWith(".json"));
for (const file of files) {
  const chunk = JSON.parse(await fs.readFile(path.join(fragDir, file), "utf8"));
  for (const [locale, map] of Object.entries(chunk)) {
    DATA[locale] = { ...DATA[locale], ...map };
  }
}

const out = `/** Auto-built from fragments. Spanish phrase -> translation. */\nexport const DATA = ${JSON.stringify(DATA, null, 2)};\n`;
await fs.writeFile(path.join(__dirname, "phrases-data.mjs"), out);
console.log("Locales in DATA:", Object.keys(DATA).length);
