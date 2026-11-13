#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import es from "../es-complete.json" with { type: "json" };
import ORDER from "./es-order.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, "../../lib/i18n/catalog.json");

const LOCALES = [
  "zh-CN","zh-TW","ja","ko","tr","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const idx = Object.fromEntries(ORDER.map((s, i) => [s, i]));
const arrays = Object.fromEntries(LOCALES.map((l) => [l, new Array(ORDER.length).fill(null)]));

for (const [enKey, esVal] of Object.entries(es)) {
  const i = idx[esVal];
  for (const locale of LOCALES) {
    const tr = catalog[enKey]?.[locale];
    if (tr) arrays[locale][i] = tr;
  }
}

const overrideDir = path.join(__dirname, "overrides");
const files = (await fs.readdir(overrideDir)).filter((f) => f.endsWith(".mjs"));
for (const file of files) {
  const locale = file.replace(/\.mjs$/, "");
  const mod = await import(path.join(overrideDir, file));
  const values = mod.default ?? mod.VALUES;
  if (!values || values.length !== ORDER.length) {
    throw new Error(`${file}: need ${ORDER.length} values`);
  }
  arrays[locale] = values;
}

await fs.writeFile(
  path.join(__dirname, "translation-arrays.json"),
  `${JSON.stringify(arrays, null, 2)}\n`,
);

const { mapFromArray } = await import("./chunk-helpers.mjs");

const asia = ["id", "ms", "bn", "th", "vi", "fil"];
const europe = ["pl", "uk", "ro", "cs", "hu", "sk", "sl", "bg", "hr", "sr", "mk", "bs", "sq"];
const cjk = ["zh-CN", "zh-TW", "ja", "ko", "hi", "ur", "fa", "he"];
const rest = LOCALES.filter((l) => !asia.includes(l) && !europe.includes(l) && !cjk.includes(l));

function chunkExport(name, locales) {
  const maps = Object.fromEntries(locales.map((l) => [l, mapFromArray(arrays[l])]));
  return `import { mapFromArray } from "./chunk-helpers.mjs";\nimport arrays from "./translation-arrays.json" with { type: "json" };\n\nexport const MAPS = Object.fromEntries(${JSON.stringify(locales)}.map((l) => [l, mapFromArray(arrays[l])]));\n`;
}

await fs.writeFile(path.join(__dirname, "chunk-asia.mjs"), chunkExport("asia", asia));
await fs.writeFile(path.join(__dirname, "chunk-europe.mjs"), chunkExport("europe", europe));
await fs.writeFile(path.join(__dirname, "chunk-cjk.mjs"), chunkExport("cjk", cjk));
await fs.writeFile(path.join(__dirname, "chunk-rest.mjs"), chunkExport("rest", rest));

console.log("Wrote translation-arrays.json and chunk files");
