/**
 * Downloads the TheSportsDB crests of the hand-reviewed pairs (data_process/thesportsdb/badgeOverrides.json) to
 * src/example_data/logos/tsdb/<squadId>.png. A pair is dropped when TheSportsDB says it is not soccer, the country is
 * not the one of the club's league, or the name marks a reserve, youth or women's side. Sequential, 6.5 s between
 * requests (the free key's limit); a crest already on disk is skipped. Then run scripts/applyTsdbBadges.ts.
 *
 *   bun scripts/fetchTsdbBadgeOverrides.ts
 */
import { sameCountry } from "@/../scripts/thesportsdb/badgeMatch";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { curlFile, sleep } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const { pairs, anyCountry = [] } = JSON.parse(readFileSync(join(ROOT, "data_process/thesportsdb/badgeOverrides.json"), "utf8")) as { pairs: Record<string, string>; anyCountry?: string[] };
/** Clubs that play in another country's league (Vaduz, of Liechtenstein, in the Swiss one): no country check. */
const foreign = new Set(anyCountry);
const leagues = JSON.parse(readFileSync(join(ROOT, "src/example_data/leagueData.json"), "utf8")) as Record<string, { country?: string; standings?: { squadId: string }[] }>;
const logoDir = join(ROOT, "src/example_data/logos/tsdb");

const countryOf = new Map<string, string>();
for (const league of Object.values(leagues)) {
  for (const row of league.standings ?? []) if (league.country) countryOf.set(row.squadId, league.country);
}
const NOT_FIRST_TEAM = /\b(women|ladies|u\d\d|youth|b\.?c\.?|ii|reserves?)\b/i;

let ok = 0;
const dropped: string[] = [];
for (const [squadId, idTeam] of Object.entries(pairs)) {
  const file = join(logoDir, `${squadId}.png`);
  if (existsSync(file) && statSync(file).size > 0) { ok++; continue; }
  const raw = execFileSync("curl", ["-s", "-m", "30", `https://www.thesportsdb.com/api/v1/json/123/lookupteam.php?id=${idTeam}`], { encoding: "utf8" });
  await sleep(6500);
  let team: { strTeam?: string; strSport?: string; strCountry?: string; strBadge?: string } | undefined;
  try { team = (JSON.parse(raw) as { teams?: typeof team[] }).teams?.[0]; } catch { team = undefined; }
  const country = countryOf.get(squadId);
  const reason = !team ? "no answer"
    : team.strSport !== "Soccer" ? `sport ${team.strSport}`
      : !team.strBadge ? "no crest"
        : NOT_FIRST_TEAM.test(team.strTeam ?? "") ? `name ${team.strTeam}`
          : country && !foreign.has(squadId) && !sameCountry(country, team.strCountry ?? "") ? `country ${team.strCountry} x ${country}`
            : null;
  if (reason) { dropped.push(`${squadId} (${idTeam}): ${reason}`); console.log("DROP", squadId, reason); continue; }
  if (await curlFile(`${team!.strBadge}/small`, file) || await curlFile(team!.strBadge!, file)) { ok++; console.log("ok", squadId, team!.strTeam); }
  else dropped.push(`${squadId} (${idTeam}): download failed`);
  await sleep(500);
}
console.log(`\n${ok} crests, ${dropped.length} dropped`);
for (const d of dropped) console.log(" ", d);
