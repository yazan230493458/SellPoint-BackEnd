#!/usr/bin/env node
/** Build phrase maps for Romance/latin languages from Portuguese (pt) + Spanish keys. */
import es from "../es-complete.json" with { type: "json" };

const pt = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.promises.readFile(
      new URL("../llm-patches/locale-pt.json", import.meta.url).pathname,
      "utf8",
    ),
  ),
);

// pt patch may be incomplete; merge with fill-catalog pt from running node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fillPath = new URL("../fill-catalog.mjs", import.meta.url);

const spanishToPt = {};
for (const [key, spanish] of Object.entries(es)) {
  if (pt[key]) spanishToPt[spanish] = pt[key];
}

console.log(JSON.stringify(spanishToPt, null, 2));
