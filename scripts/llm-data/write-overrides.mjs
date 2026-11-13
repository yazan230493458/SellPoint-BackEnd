#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BULK from "./all-phrase-arrays.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "overrides");

await fs.mkdir(outDir, { recursive: true });

for (const [locale, values] of Object.entries(BULK)) {
  const body = `export default ${JSON.stringify(values)};\n`;
  await fs.writeFile(path.join(outDir, `${locale}.mjs`), body);
}
console.log("Wrote", Object.keys(BULK).length, "override files");
