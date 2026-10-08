/**
 * Measurement of the scouts' country knowledge (Etapa 33, spec
 * `docs/superpowers/specs/2026-10-08-scout-countries-design.md` §7). Pure, no save: one 12-week country
 * mission over the Premier League squads, a 3-star field scout led by a 3-star chief, the same seed, and
 * four leaders that differ only in their knowledge of the country (none = today, 0, 40, 90).
 *
 *   bun scripts/scout-country-measure.ts [league=premier_league]
 */
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  advanceScoutingWeek, buildReport, missionPool, starterLineAverages, type PoolEntry, type ViewerContext,
} from "@/Domain/scouting/missions";
import { scoutMultipliersOf } from "@/Domain/scouting/knowledge";
import { countryGainMult, countryKnowledgeOf, countryNoiseMult, growCountryKnowledge } from "@/Domain/scouting/countryKnowledge";
import { ratingFromStars } from "@/Domain/staff/staff";
import { addDays } from "@/Domain/dates";
import { emptyScoutingState, type ScoutAssignment, type ScoutReport } from "@/types/scoutingTypes";
import type { Squad } from "@/types/playerTypes";

const league = process.argv[2] ?? "premier_league";
const dir = fileURLToPath(new URL(`../src/Data/squads/${league}`, import.meta.url));
const squads = readdirSync(dir).sort().map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Squad);
const COUNTRY = "England";
const START = "2027-03-01"; // a Monday

const rating = ratingFromStars(3);
const viewerClub = squads[Math.floor(squads.length / 2)]!;
const entries: PoolEntry[] = squads.flatMap((s) => s.players.map((p) => ({
  player: p, squadId: s.id, club: s.name, league, country: COUNTRY,
})));
const byId = new Map(entries.map((e) => [e.player.id, e]));

function ctxAt(date: string, knowledge: Record<string, { k: number; seen: string }>): ViewerContext {
  return {
    saveId: "measure", date, ownCountry: "Spain",
    lineAverages: starterLineAverages(viewerClub),
    ownWageFactor: 1,
    chief: scoutMultipliersOf(rating),
    knowledgeOf: (id) => knowledge[id]?.k ?? 0,
  };
}

interface Row { week: number; meanK: number; k60: number; agree: number; reports: number }

function run(countryK: ((c: string) => number) | undefined): Row[] {
  const mission: ScoutAssignment = {
    id: "m", scoutId: "f1", target: { kind: "country", country: COUNTRY }, start: addDays(START, -3), weeks: 12, weeksDone: 0, observed: 0,
  };
  let state = { ...emptyScoutingState(), missions: [mission] };
  const reports: ScoutReport[] = [];
  const rows: Row[] = [];
  for (let w = 1; w <= 12; w++) {
    const date = addDays(START, 7 * (w - 1));
    const ctx = ctxAt(date, state.knowledge);
    const pool = missionPool("country", undefined, entries, ctx);
    const r = advanceScoutingWeek(state, [{ mission: state.missions[0]!, leaderRating: rating, pool, countryK }], ctx);
    state = r.state;
    reports.push(...r.reports);
    if (w % 4 === 0) {
      const ks = Object.values(state.knowledge).map((e) => e.k);
      const truth = (rep: ScoutReport) => buildReport(byId.get(rep.playerId)!, 100, ctxAt(rep.date, state.knowledge), {}).grade;
      const agree = reports.filter((rep) => rep.grade === truth(rep)).length;
      rows.push({
        week: w,
        meanK: ks.reduce((s, v) => s + v, 0) / Math.max(1, ks.length),
        k60: ks.filter((k) => k >= 60).length,
        agree: agree / Math.max(1, reports.length),
        reports: reports.length,
      });
    }
  }
  return rows;
}

const variants: [string, ((c: string) => number) | undefined][] = [
  ["today (no country)", undefined],
  ["k 0 (unknown)", () => 0],
  ["k 40 (moderate)", () => 40],
  ["k 90 (own country)", () => 90],
];
const results = new Map<string, Row[]>();
console.log(`League ${league}: ${entries.length} players, leader rating ${rating}, chief ${rating}`);
console.log(`Multipliers: gain k0 ${countryGainMult(0).toFixed(3)} / k40 ${countryGainMult(40)} / k90 ${countryGainMult(90).toFixed(3)}; noise k0 ${countryNoiseMult(0).toFixed(3)} / k90 ${countryNoiseMult(90).toFixed(3)}`);
console.log("\n| Leader | week | mean k observed | observed k ≥ 60 | grade agreement | reports |");
console.log("|---|---|---|---|---|---|");
for (const [label, k] of variants) {
  const rows = run(k);
  results.set(label, rows);
  for (const r of rows) {
    console.log(`| ${label} | ${r.week} | ${r.meanK.toFixed(1)} | ${r.k60} | ${(100 * r.agree).toFixed(1)}% | ${r.reports} |`);
  }
}
const same = JSON.stringify(results.get("today (no country)")) === JSON.stringify(results.get("k 40 (moderate)"));
const last = (label: string) => results.get(label)!.at(-1)!;
const base = last("today (no country)");
console.log(`\nk 40 identical to today: ${same ? "yes" : "NO"}`);
console.log(`Mean k after 12 weeks vs today: own country ${(100 * (last("k 90 (own country)").meanK / base.meanK - 1)).toFixed(1)}% (max +20%), unknown ${(100 * (last("k 0 (unknown)").meanK / base.meanK - 1)).toFixed(1)}% (min −25%)`);
console.log(`Grade agreement: own ${(100 * last("k 90 (own country)").agree).toFixed(1)}% ≥ today ${(100 * base.agree).toFixed(1)}% ≥ unknown ${(100 * last("k 0 (unknown)").agree).toFixed(1)}%`);

// Country trajectory (a 12-week mission, 0.06 per week) and the decay.
const traj = (nationality: string, country: string) => {
  let m = { nationality, countryKnowledge: {} as Record<string, { k: number; last: string }> };
  const out: number[] = [];
  for (let w = 1; w <= 12; w++) {
    m = { ...m, countryKnowledge: growCountryKnowledge(m, [{ country, rate: 0.06 }], START) };
    if (w % 4 === 0) out.push(countryKnowledgeOf(m, country, START));
  }
  return out.map((k) => k.toFixed(1)).join(" → ");
};
console.log(`\nCountry knowledge, weeks 4/8/12 of a deep mission: from 0 ${traj("Brazil", "Japan")}; from 40 ${traj("Spain", "Portugal")}`);
const decayed = { nationality: "Spain", countryKnowledge: { Portugal: { k: 71, last: START } } };
console.log(`Decay of 71 (continent floor 40): +180 d ${countryKnowledgeOf(decayed, "Portugal", addDays(START, 180))}, +270 d ${countryKnowledgeOf(decayed, "Portugal", addDays(START, 270))}, +365 d ${countryKnowledgeOf(decayed, "Portugal", addDays(START, 365))}`);
