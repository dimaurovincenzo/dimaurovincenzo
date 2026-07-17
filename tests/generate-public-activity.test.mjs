import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  generateActivity,
  parseContributionCalendar,
  renderActivitySvg,
  validateContributionDays,
} from "../scripts/generate-public-activity.mjs";

function buildCalendarHtml(dayCount = 371) {
  const start = new Date("2025-07-13T00:00:00Z");
  const cells = [];

  for (let index = 0; index < dayCount; index += 1) {
    const date = new Date(start.getTime() + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const level = index % 17 === 0 ? 3 : index % 7 === 0 ? 1 : 0;
    cells.push(
      `<td class="ContributionCalendar-day" data-level="${level}" data-date="${date}"></td>`,
    );
  }

  return `<table>${cells.join("")}</table>`;
}

test("parseContributionCalendar extracts dates and levels independently of attribute order", () => {
  const html = `
    <td data-date="2026-07-16" class="ContributionCalendar-day" data-level="0"></td>
    <td data-level="3" data-date="2026-07-17" class="ContributionCalendar-day"></td>
  `;

  assert.deepEqual(parseContributionCalendar(html), [
    { date: "2026-07-16", level: 0 },
    { date: "2026-07-17", level: 3 },
  ]);
});

test("validateContributionDays rejects incomplete or duplicated calendars", () => {
  assert.throws(
    () => validateContributionDays([{ date: "2026-07-17", level: 1 }]),
    /at least 300 contribution days/,
  );

  const duplicated = parseContributionCalendar(buildCalendarHtml());
  duplicated[1] = duplicated[0];
  assert.throws(() => validateContributionDays(duplicated), /duplicate contribution date/);
});

test("renderActivitySvg produces an accessible graph without vanity metrics", () => {
  const days = parseContributionCalendar(buildCalendarHtml());
  const svg = renderActivitySvg({
    username: "dimaurovincenzo",
    days,
    generatedOn: "2026-07-17",
  });

  assert.match(svg, /<title id="title">Attività GitHub pubblica di Vincenzo Di Mauro<\/title>/);
  assert.match(svg, /Aggiornato il 17 luglio 2026/);
  assert.match(svg, /data-level="3"/);
  assert.doesNotMatch(svg, /Rank|Stelle|Pull request|Issue|Visite/i);
});

test("generateActivity preserves the previous SVG when parsing fails", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "profile-stats-"));
  const outputPath = path.join(directory, "stats.svg");
  await writeFile(outputPath, "previous-svg", "utf8");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => "<html>markup inatteso</html>",
  });

  await assert.rejects(
    generateActivity({
      username: "dimaurovincenzo",
      outputPath,
      fetchImpl,
      generatedOn: "2026-07-17",
    }),
    /at least 300 contribution days/,
  );
  assert.equal(await readFile(outputPath, "utf8"), "previous-svg");
});

test("generateActivity aborts a stalled GitHub request", async () => {
  const fetchImpl = async (_url, options) => {
    assert.ok(options.signal, "missing abort signal");
    await new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  };

  await assert.rejects(
    generateActivity({
      username: "dimaurovincenzo",
      outputPath: "unused.svg",
      fetchImpl,
      generatedOn: "2026-07-17",
      requestTimeoutMs: 5,
    }),
    /timed out after 5ms/,
  );
});

test("generateActivity writes a validated SVG atomically", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "profile-stats-"));
  const outputPath = path.join(directory, "stats.svg");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => buildCalendarHtml(),
  });

  const result = await generateActivity({
    username: "dimaurovincenzo",
    outputPath,
    fetchImpl,
    generatedOn: "2026-07-17",
  });

  assert.equal(result.dayCount, 371);
  assert.match(await readFile(outputPath, "utf8"), /^<svg[^>]+role="img"/);
});
