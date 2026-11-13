import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "../_api-en-keys.json" with { type: "json" };

const emitDir = path.dirname(fileURLToPath(import.meta.url));
const mapsDir = path.join(emitDir, "maps");
const bundlesDir = path.join(emitDir, "..", "locale-bundles");

const files = fs.readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
const bundle = {};
for (const file of files) {
  const locale = file.replace(/\.json$/, "");
  const map = JSON.parse(fs.readFileSync(path.join(mapsDir, file), "utf8"));
  const arr = KEYS.map((k) => {
    if (!map[k]) throw new Error(`${locale}: missing ${k}`);
    return map[k];
  });
  bundle[locale] = arr;
}

const outPath = path.join(bundlesDir, "indic-misc.json");
fs.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`);
console.log("Compiled", files.length, "locales to indic-misc.json");
