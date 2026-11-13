#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };
import es from "./es-complete.json" with { type: "json" };
import { ARRAYS } from "./locale-arrays.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(await fs.readFile(path.join(__dirname, "phrase-matrix.json"), "utf8"));
const spanishByEn = es;

for (const [locale, values] of Object.entries(ARRAYS)) {
  if (values.length !== KEYS.length) throw new Error(`${locale}: bad length`);
  for (let i = 0; i < KEYS.length; i++) {
    const sp = spanishByEn[KEYS[i]];
    matrix[sp] ??= {};
    matrix[sp][locale] = values[i];
  }
}

await fs.writeFile(path.join(__dirname, "phrase-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
console.log("Updated matrix for", Object.keys(ARRAYS).length, "locales");
