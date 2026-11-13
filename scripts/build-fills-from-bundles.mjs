#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlesDir = path.join(__dirname, "locale-bundles");
const fillDir = path.join(__dirname, "fill-by-locale");

const files = (await fs.readdir(bundlesDir)).filter((f) => f.endsWith(".json"));
await fs.mkdir(fillDir, { recursive: true });

let locales = 0;
for (const file of files) {
  const data = JSON.parse(await fs.readFile(path.join(bundlesDir, file), "utf8"));
  for (const [locale, arr] of Object.entries(data)) {
    if (!Array.isArray(arr) || arr.length !== KEYS.length) {
      throw new Error(`${locale} in ${file}: expected ${KEYS.length} strings, got ${arr?.length}`);
    }
    const byKey = {};
    KEYS.forEach((k, i) => {
      byKey[k] = arr[i];
    });
    await fs.writeFile(path.join(fillDir, `${locale}.json`), `${JSON.stringify(byKey, null, 2)}\n`);
    locales++;
  }
}
console.log("Wrote", locales, "locale fill files from", files.length, "bundles");
