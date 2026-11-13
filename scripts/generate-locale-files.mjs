#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import { ARRAYS } from "./locale-arrays.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "locales");
await fs.mkdir(outDir, { recursive: true });

for (const [locale, values] of Object.entries(ARRAYS)) {
  if (values.length !== KEYS.length) {
    throw new Error(`${locale}: expected ${KEYS.length} strings, got ${values.length}`);
  }
  const messages = Object.fromEntries(KEYS.map((k, i) => [k, values[i]]));
  await fs.writeFile(path.join(outDir, `${locale}.json`), `${JSON.stringify(messages, null, 2)}\n`);
  console.log(locale);
}
