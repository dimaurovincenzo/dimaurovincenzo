import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("README implements the approved executive overview", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /^# Vincenzo Di Mauro/m);
  assert.match(readme, /^## Backend Engineer & Software Architect/m);
  assert.match(readme, /^## Ambiti di lavoro/m);
  assert.match(readme, /^## Tecnologie/m);
  assert.match(readme, /^## Esperienza e impatto/m);
  assert.match(readme, /^## Attività GitHub pubblica/m);
  assert.match(readme, /^## Parliamone/m);
  assert.match(readme, /\.\/profile\/stats\.svg/);
  assert.match(readme, /https:\/\/vincodelab\.com/);
  assert.match(readme, /https:\/\/www\.linkedin\.com\/in\/vdmweb\//);
  assert.match(readme, /mailto:info@vincodelab\.com/);
  assert.doesNotMatch(readme, /shields\.io|visitor|trophy|badge/i);
});
