import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTHS_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function parseContributionCalendar(html) {
  const cells = html.match(/<td\b[^>]*ContributionCalendar-day[^>]*>/g) ?? [];

  return cells.flatMap((cell) => {
    const date = cell.match(/\bdata-date="(\d{4}-\d{2}-\d{2})"/i)?.[1];
    const rawLevel = cell.match(/\bdata-level="([0-4])"/i)?.[1];
    return date && rawLevel !== undefined
      ? [{ date, level: Number(rawLevel) }]
      : [];
  });
}

export function validateContributionDays(days) {
  if (days.length < 300) {
    throw new Error(`Expected at least 300 contribution days, received ${days.length}`);
  }

  const seen = new Set();
  for (const day of days) {
    if (seen.has(day.date)) {
      throw new Error(`Found duplicate contribution date: ${day.date}`);
    }
    if (!Number.isInteger(day.level) || day.level < 0 || day.level > 4) {
      throw new Error(`Invalid contribution level for ${day.date}`);
    }
    seen.add(day.date);
  }
}

function formatItalianDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS_IT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function renderActivitySvg({ username, days, generatedOn }) {
  const ordered = [...days].sort((left, right) => left.date.localeCompare(right.date));
  const first = new Date(`${ordered[0].date}T00:00:00Z`);
  const cell = 9;
  const gap = 3;
  const pitch = cell + gap;
  const left = 24;
  const top = 48;
  const coordinates = ordered.map((day) => {
    const date = new Date(`${day.date}T00:00:00Z`);
    return {
      ...day,
      column: Math.floor((date.getTime() - first.getTime()) / WEEK_MS),
      row: date.getUTCDay(),
    };
  });
  const columns = Math.max(...coordinates.map((day) => day.column)) + 1;
  const width = left * 2 + columns * pitch - gap;
  const height = top + 7 * pitch + 20;
  const cells = coordinates
    .map(
      (day) =>
        `  <rect class="level-${day.level}" data-level="${day.level}" x="${left + day.column * pitch}" y="${top + day.row * pitch}" width="${cell}" height="${cell}" rx="2"><title>${escapeXml(day.date)}</title></rect>`,
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title description" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title id="title">Attività GitHub pubblica di Vincenzo Di Mauro</title>
  <desc id="description">Calendario dei contributi pubblicamente visibili di ${escapeXml(username)}. Aggiornato il ${formatItalianDate(generatedOn)}.</desc>
  <style>
    .heading { fill: #1f2328; font: 600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .updated { fill: #656d76; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .level-0 { fill: #ebedf0; } .level-1 { fill: #9be9a8; } .level-2 { fill: #40c463; }
    .level-3 { fill: #30a14e; } .level-4 { fill: #216e39; }
    @media (prefers-color-scheme: dark) {
      .heading { fill: #f0f6fc; } .updated { fill: #8b949e; } .level-0 { fill: #161b22; }
    }
  </style>
  <text class="heading" x="${left}" y="22">Attività GitHub pubblica</text>
  <text class="updated" x="${left}" y="40">Aggiornato il ${formatItalianDate(generatedOn)}</text>
${cells}
</svg>
`;
}

export async function generateActivity({
  username,
  outputPath,
  fetchImpl = fetch,
  generatedOn = new Date().toISOString().slice(0, 10),
  requestTimeoutMs = 15_000,
}) {
  let response;
  try {
    response = await fetchImpl(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
      headers: { Accept: "text/html", "User-Agent": "github-profile-activity-generator" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw new Error(`GitHub contributions request timed out after ${requestTimeoutMs}ms`, {
        cause: error,
      });
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(`GitHub contributions request failed with HTTP ${response.status}`);
  }

  const days = parseContributionCalendar(await response.text());
  validateContributionDays(days);
  const svg = renderActivitySvg({ username, days, generatedOn });
  const absoluteOutput = path.resolve(outputPath);
  const temporaryOutput = `${absoluteOutput}.tmp-${process.pid}`;

  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(temporaryOutput, svg, { encoding: "utf8", mode: 0o644 });
  await rename(temporaryOutput, absoluteOutput);
  return { dayCount: days.length, outputPath: absoluteOutput };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const outputPath = process.argv[2] ?? "profile/stats.svg";
  generateActivity({ username: "dimaurovincenzo", outputPath })
    .then(({ dayCount }) => console.log(`Generated ${outputPath} from ${dayCount} public days`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
