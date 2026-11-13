#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA } from "./phrases-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const [locale, map] of Object.entries(DATA)) {
  const exportName = locale.replace(/-/g, "_").toUpperCase();
  const body = `export const ${exportName} = ${JSON.stringify(map, null, 2)};\n`;
  await fs.writeFile(path.join(__dirname, `phrase-${locale}.mjs`), body);
  console.log(locale, Object.keys(map).length);
}
