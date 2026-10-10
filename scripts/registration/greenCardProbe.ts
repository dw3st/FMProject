#!/usr/bin/env bun
/**
 * MLS green card calibration (`.claude/rules/game/registration.md` → Green card): on the initial world
 * (`src/example_data/squads/of_major_league_soccer`), for each origin chance p, the internationals per club after the
 * green card, the share of clubs within 8, the foreigners left off the list and the club's 11 best left off.
 *
 * Usage: bun scripts/registration/greenCardProbe.ts [p1,p2,...]
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";
import { autoRegister, type RegCtx } from "@/Domain/registration/rules";
import { GREEN_CARD, REGISTRATION_RULES } from "@/Domain/registration/registrationConfig";
import { foreignByNation, isForeign } from "@/Domain/registration/formed";
import { computeOverallAvg } from "@/Domain/playerRating";
import type { Squad } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIR = join(ROOT, "src", "example_data", "squads", "of_major_league_soccer");
const squads = readdirSync(DIR).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Squad);
const rule = REGISTRATION_RULES.mls!;
const ps = (process.argv[2] ?? "0,0.3,0.4,0.45,0.5,0.55,0.6").split(",").map(Number);
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

console.log("| p | internationals (min / median / max) | clubs ≤ 8 | foreigners out / club | top-11 out (total) | clubs with a top-11 out |");
console.log("|---|---|---|---|---|---|");
for (const p of ps) {
  (GREEN_CARD as { ORIGIN: number }).ORIGIN = p;
  const intl: number[] = [];
  let out = 0, topOut = 0, clubsTop = 0;
  for (const s of squads) {
    const ctx: RegCtx = { seasonStartYear: 2027, countryOfLeague: () => "USA", country: "USA", squadId: s.id };
    const holder = { squadId: s.id, ctx };
    const foreign = s.players.filter((x) => isForeign(x, rule, "USA", holder));
    intl.push(foreign.length);
    const ids = new Set(autoRegister(s.players, rule, ctx).ids);
    out += foreign.filter((x) => !ids.has(x.id)).length;
    const top = [...s.players].sort((a, b) => (b.overallAvg ?? computeOverallAvg(b)) - (a.overallAvg ?? computeOverallAvg(a))).slice(0, 11);
    const t = top.filter((x) => !ids.has(x.id)).length;
    topOut += t;
    if (t > 0) clubsTop++;
  }
  console.log(`| ${p} | ${Math.min(...intl)} / ${med(intl)} / ${Math.max(...intl)} | ${intl.filter((n) => n <= 8).length} of ${squads.length} | ${(out / squads.length).toFixed(2)} | ${topOut} | ${clubsTop} |`);
}
const byNation = squads.map((s) => s.players.filter((x) => foreignByNation(x, rule, "USA")).length);
console.log(`\nForeign by nationality (no green card): min ${Math.min(...byNation)} / median ${med(byNation)} / max ${Math.max(...byNation)}`);
