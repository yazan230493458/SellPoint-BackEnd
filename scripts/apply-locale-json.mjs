#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import KEYS from "./_api-en-keys.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const patchDir = path.join(root, "lib/i18n/llm-patches");
const localesDir = path.join(__dirname, "locales");

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

async function applyDir(dir) {
  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  let n = 0;
  for (const file of files) {
    const locale = file.replace(/\.json$/, "");
    const messages = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
    for (const key of KEYS) {
      if (!messages[key]) continue;
      catalog[key] ??= {};
      catalog[key][locale] = messages[key];
      n++;
    }
  }
  return n;
}

const a = await applyDir(localesDir);
const b = await applyDir(patchDir);
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log("Applied", a + b, "cells");

const BACKEND = [
  "ar","es","fr","de","zh-CN","zh-TW","ja","ko","pt","pt-BR","ru","tr","it","nl","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];
let gaps = 0;
for (const l of BACKEND) gaps += KEYS.filter((k) => !catalog[k]?.[l]).length;
console.log("gaps", gaps);
