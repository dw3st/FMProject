import { readFileSync, writeFileSync } from "fs";

const html = readFileSync(
  new URL("./constants/cbf-rank.html", import.meta.url).pathname,
  "utf-8"
);

// Extract all <tr> elements from tbody
const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

interface ClubRanking {
  position: number;
  trend: "up" | "down" | "same";
  positionChange: number;
  club: string;
  state: string;
  points: number;
  pointsDiff: number;
}

function getTdTexts(row: string): string[] {
  const cells: string[] = [];
  const tdMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
  for (const td of tdMatches) {
    // Extract inner text, handling softmerge-inner divs
    const softmerge = td.match(/<div class="softmerge-inner"[^>]*>([\s\S]*?)<\/div>/);
    if (softmerge) {
      cells.push(softmerge[1]!.trim());
    } else {
      // Strip all tags, decode entities
      const text = td
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .trim();
      cells.push(text);
    }
  }
  return cells;
}

function parsePoints(raw: string): number {
  // Handle formats like "13.992", "986", "1.016"
  return parseInt(raw.replace(/\./g, ""), 10);
}

function parseTrend(arrow: string): "up" | "down" | "same" {
  if (arrow.includes("⇡")) return "up";
  if (arrow.includes("⇣")) return "down";
  return "same";
}

const results: ClubRanking[] = [];

for (const row of rowMatches) {
  const cells = getTdTexts(row);
  if (cells.length < 6) continue;
  const [posCell, trendCell, changeCell, clubCell, pointsCell, diffCell] =
    cells as [string, string, string, string, string, string];

  const posRaw = posCell.trim();
  const position = parseInt(posRaw, 10);
  if (isNaN(position)) continue;

  const trend = parseTrend(trendCell);
  const positionChange = parseInt(changeCell, 10) || 0;

  const clubFull = clubCell.trim();
  // Split "Flamengo - RJ" into club and state
  const clubMatch = clubFull.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
  const club = clubMatch ? clubMatch[1]!.trim() : clubFull;
  const state = clubMatch ? clubMatch[2]! : "";

  const points = parsePoints(pointsCell);
  const pointsDiff = parsePoints(diffCell) || 0;

  if (isNaN(points)) continue;

  results.push({ position, trend, positionChange, club, state, points, pointsDiff });
}

const output = JSON.stringify(results, null, 2);
writeFileSync(
  new URL("./constants/cbf-rank.json", import.meta.url).pathname,
  output
);
console.log(`Parsed ${results.length} clubs → constants/cbf-rank.json`);
