#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "fill-by-locale");

/** @type {Record<string, Record<string, string>>} */
const FILL = {};

let files = [];
try {
  files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
} catch {
  files = [];
}
for (const file of files) {
  const locale = file.replace(/\.json$/, "");
  FILL[locale] = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
}

await fs.writeFile(
  path.join(__dirname, "translation-fill-data.mjs"),
  `/** LLM-authored API message fills by locale. */\nexport const FILL = ${JSON.stringify(FILL, null, 2)};\n`,
);
console.log("Merged", files.length, "locales");
let n = 0;
for (const v of Object.values(FILL)) n += Object.keys(v).length;
console.log("cells", n);
