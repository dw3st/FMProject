/**
 * Effect of the big-match multiplier (derby, cup / continental knockout) on a season of gate money
 * of the human club (spec 2026-10-08-match-visual §6, "Medição").
 *
 * For every club of each league: initial facilities, one home game per league opponent (derby when
 * the city matches; the game against the league leader — the club with most followers, a proxy for
 * the leader of the day — also counts as a derby), plus 1.5 home cup knockout ties (weight 1.5),
 * fans 60, the squad's followers, neutral season phase. Gate summed with and without the importance.
 *
 *   bun scripts/match-importance-measure.ts [league,league,...]
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDerby } from "@/Domain/boardFans/boardFans";
import { facilitiesGate, initialFacilities, type DemandInput } from "@/Domain/facilities/facilities";
import { matchImportanceMult } from "@/Domain/facilities/matchImportance";
import { tierOfLeague } from "@/Domain/season/countryRollover";
import type { CountryPyramid } from "@/types/pyramidTypes";
import type { Squad } from "@/types/playerTypes";

const LEAGUES = (process.argv[2] ?? "premier_league,brazil_serie_a,of_championship").split(",");
const CUP_HOME_TIES = 1.5;
const FANS = 60;

const dataDir = fileURLToPath(new URL("../src/Data/", import.meta.url));
const pyramids = JSON.parse(readFileSync(`${dataDir}pyramids.json`, "utf8")) as Record<string, CountryPyramid>;

function tierOf(slug: string): number {
  for (const p of Object.values(pyramids)) {
    const t = tierOfLeague(p, slug);
    if (t !== null) return t;
  }
  return 1;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i]!;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

console.log("| Liga | clubes | com clássico por cidade | jogos clássicos por clube (média) | mediana | p90 | máx. |");
console.log("|---|---|---|---|---|---|---|");
for (const league of LEAGUES) {
  const dir = `${dataDir}squads/${league}/`;
  const squads = readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as Squad);
  const tier = tierOf(league);
  const leader = [...squads].sort((a, b) => (b.finances?.followers ?? 0) - (a.finances?.followers ?? 0))[0]!;
  const deltas: number[] = [];
  let withCityDerby = 0;
  let derbyGames = 0;
  for (const club of squads) {
    const f = initialFacilities(club, tier);
    const base: DemandInput = { followers: club.finances?.followers ?? 0, tier, fans: FANS };
    let plain = 0, important = 0, cityDerby = false;
    for (const opp of squads) {
      if (opp.id === club.id) continue;
      const derby = isDerby({
        myCity: club.venue?.city ?? "",
        opponentCity: opp.venue?.city ?? "",
        opponentIsLeader: opp.id === leader.id,
      });
      if (derby) derbyGames += 1;
      if (derby && opp.id !== leader.id) cityDerby = true;
      const mult = matchImportanceMult({ derby, competition: "league", knockout: false });
      plain += facilitiesGate(f, base, "league");
      important += facilitiesGate(f, { ...base, importance: mult }, "league");
    }
    const cupMult = matchImportanceMult({ derby: false, competition: "cup", knockout: true });
    plain += CUP_HOME_TIES * facilitiesGate(f, base, "cup");
    important += CUP_HOME_TIES * facilitiesGate(f, { ...base, importance: cupMult }, "cup");
    if (cityDerby) withCityDerby += 1;
    deltas.push(plain > 0 ? important / plain - 1 : 0);
  }
  deltas.sort((a, b) => a - b);
  console.log(
    `| ${league} | ${squads.length} | ${withCityDerby} | ${(derbyGames / squads.length).toFixed(2)} | ` +
    `${pct(quantile(deltas, 0.5))} | ${pct(quantile(deltas, 0.9))} | ${pct(deltas[deltas.length - 1] ?? 0)} |`,
  );
}
