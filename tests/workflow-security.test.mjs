import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("stats workflow uses only the local generator with narrow permissions", async () => {
  const workflow = await readFile(".github/workflows/update-stats.yml", "utf8");

  assert.doesNotMatch(workflow, /stats-organization|github-readme-stats/i);
  assert.match(workflow, /uses: actions\/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10/);
  assert.match(workflow, /cron: "17 3 \* \* 1"/);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /node scripts\/generate-public-activity\.mjs profile\/stats\.svg/);
  assert.match(workflow, /permissions:\n\s+contents: write/);
});
