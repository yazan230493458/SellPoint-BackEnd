#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import es from "../es-complete.json" with { type: "json" };
import { MAPS as ASIA } from "./chunk-asia.mjs";
import { MAPS as EUROPE } from "./chunk-europe.mjs";
import { MAPS as REST } from "./chunk-rest.mjs";
import { MAPS as CJK } from "./chunk-cjk.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const patchDir = path.join(__dirname, "../../lib/i18n/llm-patches");
const catalogPath = path.join(__dirname, "../../lib/i18n/catalog.json");

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const keys = Object.keys(es);
const allMaps = { ...ASIA, ...EUROPE, ...REST, ...CJK };

await fs.mkdir(patchDir, { recursive: true });

for (const [locale, phraseMap] of Object.entries(allMaps)) {
  const patch = {};
  for (const key of keys) {
    if (catalog[key]?.[locale]) continue;
    const spanish = es[key];
    const translated = phraseMap[spanish];
    if (translated) patch[key] = translated;
  }
  if (!Object.keys(patch).length) continue;
  await fs.writeFile(
    path.join(patchDir, `locale-${locale}.json`),
    `${JSON.stringify(patch, null, 2)}\n`,
  );
  console.log(`locale-${locale}.json`, Object.keys(patch).length, "keys");
}
