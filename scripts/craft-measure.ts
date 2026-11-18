// M1 of the club craft (docs/superpowers/specs/2026-11-18-club-craft-design.md §13).
// For every club of the Premier League and the Brasileirão Série A, every works quote of today: the money cost of the
// old quote × the value of its recipe in materials at the base price (standard supplier), the units it asks and the
// workshop time to make them against the works duration. Also the monthly board allowance against a season of works.
//
//   bun scripts/craft-measure.ts [--squads src/example_data/squads]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { componentValue, recipeFor, recipeValue } from "@/Domain/craft/recipes";
import { allowanceShare } from "@/Domain/craft/allowance";
import { benchCount, jobDays } from "@/Domain/craft/workshop";
import { initialFacilities, quoteProject, seatCost, type ProjectQuote } from "@/Domain/facilities/facilities";
import { FACILITY_ITEMS } from "@/Domain/facilities/facilityItems";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { ComponentCounts, ComponentId } from "@/types/craftTypes";
import type { ClubFacilities, FacilityItem, FacilityRequest } from "@/types/facilityTypes";
import type { Squad } from "@/types/playerTypes";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const SQUADS = arg("--squads") ?? "src/example_data/squads";
/** Country weight of the managers' ranking (level of the top league ÷ the big five), approximate: England 1, Brazil 0,88. */
const LEAGUES: { slug: string; weight: number }[] = [
  { slug: "premier_league", weight: 1 },
  { slug: "brazil_serie_a", weight: 0.88 },
];

interface Row { label: string; cost: number; value: number; units: number; days1: number; days3: number; worksDays: number; recipe: ComponentCounts }
const rows: Record<string, Row[]> = {};
const add = (type: string, r: Row) => (rows[type] ??= []).push(r);

/** Days to make a recipe: one order per component (split into orders of at most 500), spread on the benches. */
function makeDays(recipe: ComponentCounts, level: number): number {
  const jobs: number[] = [];
  for (const [id, n] of Object.entries(recipe) as [ComponentId, number][]) {
    for (let left = n; left > 0; left -= 500) jobs.push(jobDays(id, Math.min(500, left), level, 1));
  }
  // Longest first on the least loaded bench (the queue runs in order; this is the best order the player can set).
  const benches = new Array(benchCount(level)).fill(0) as number[];
  for (const d of jobs.sort((a, b) => b - a)) { const i = benches.indexOf(Math.min(...benches)); benches[i]! += d; }
  return Math.max(0, ...benches);
}

/** Facilities worn to a given condition on every item (so repairs have something to do). */
function worn(f: ClubFacilities, wear: number): ClubFacilities {
  const items = Object.fromEntries(Object.entries(f.items).map(([id, it]) => [id, { ...(it as FacilityItem), wear }])) as ClubFacilities["items"];
  return { ...f, items };
}

const sizes: string[] = [];
let allowanceYear = 0;
let worksYear = 0;
let clubs = 0;

for (const { slug, weight } of LEAGUES) {
  const dir = join(SQUADS, slug);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const squad = JSON.parse(readFileSync(join(dir, file), "utf8")) as Squad;
    const revenue = wageRevenueBasisOf(squad);
    const ctx = { revenue, seatCost: seatCost(weight, 1) };
    const base = initialFacilities(squad, 1, 0.5);
    const f = worn(base, 0.5); // condition 75%
    const condemned = { ...f, items: Object.fromEntries(Object.entries(f.items).map(([id, it]) => [id, { ...it, condemned: true }])) } as ClubFacilities;
    const reqs: { type: string; f: ClubFacilities; req: FacilityRequest | "workshop" }[] = [
      { type: "stand +1000", f, req: { kind: "stand", stand: "east", seats: 1000 } },
      { type: "stand +5000", f, req: { kind: "stand", stand: "east", seats: 5000 } },
      { type: "comfort", f, req: { kind: "comfort" } },
      { type: "training", f, req: { kind: "training" } },
      { type: "academy", f, req: { kind: "academy" } },
      { type: "turf hybrid", f, req: { kind: "turf", turf: "hybrid" } },
      ...FACILITY_ITEMS.flatMap((item) => [
        { type: "repair", f, req: { kind: "repair", item, to: 100 } as FacilityRequest },
        { type: "rebuild", f: condemned, req: { kind: "rebuild", item } as FacilityRequest },
        { type: "upgrade", f, req: { kind: "upgrade", item } as FacilityRequest },
      ]),
      { type: "workshop 2", f, req: "workshop" },
    ];
    for (const { type, f: ff, req } of reqs) {
      let q: Pick<ProjectQuote, "kind" | "cost" | "weeks" | "item"> | null;
      if (req === "workshop") q = { kind: "workshop" as never, cost: Math.round(revenue * CRAFT.WORKSHOP_COST[2]!), weeks: 0 };
      else q = quoteProject(ff, req, ctx);
      if (!q || q.cost <= 0) continue;
      const recipe = recipeFor({ kind: q.kind, ...(q.item ? { item: q.item } : {}) }, q.cost, revenue);
      const units = Object.values(recipe).reduce((s, n) => s + (n ?? 0), 0);
      add(type, {
        label: `${squad.name}${q.item ? ` ${q.item}` : ""}`, cost: q.cost, value: recipeValue(recipe, revenue), units,
        days1: makeDays(recipe, 1), days3: makeDays(recipe, 3), worksDays: q.weeks * 7, recipe,
      });
    }
    // A season of works of a club: comfort + training + academy levels spread over ~3 seasons, one repair to 100 of
    // every item a season, one stand of 2000 seats every 2 seasons (a rough "typical" plan).
    const qc = (req: FacilityRequest) => quoteProject(f, req, ctx)?.cost ?? 0;
    const season = (qc({ kind: "comfort" }) + qc({ kind: "training" }) + qc({ kind: "academy" })) / 3
      + FACILITY_ITEMS.reduce((s, item) => s + qc({ kind: "repair", item, to: 100 }), 0)
      + qc({ kind: "stand", stand: "east", seats: 2000 }) / 2;
    const allowance = 12 * revenue * allowanceShare(60);
    allowanceYear += allowance / revenue;
    worksYear += season / revenue;
    clubs++;
    if (squad.name === "Arsenal" || squad.name === "Fluminense" || squad.name === "Mirassol") {
      const show = (t: string) => rows[t]?.filter((r) => r.label.startsWith(squad.name)).map((r) =>
        `  ${t.padEnd(12)} ${r.label.padEnd(34)} cost €${(r.cost / 1e6).toFixed(2)}M  ${Object.entries(r.recipe).map(([k, v]) => `${v} ${k}`).join(" + ")}  make L1 ${r.days1}d / L3 ${r.days3}d, works ${r.worksDays}d`);
      sizes.push(`${squad.name} (revenue €${(revenue / 1e6).toFixed(0)}M)`, ...["stand +1000", "stand +5000", "comfort", "training", "academy", "turf hybrid"].flatMap((t) => show(t) ?? []),
        ...(rows.repair?.filter((r) => r.label === `${squad.name} gym` || r.label === `${squad.name} stadiumPitch`).map((r) => `  repair       ${r.label.padEnd(34)} cost €${(r.cost / 1e6).toFixed(2)}M  ${Object.entries(r.recipe).map(([k, v]) => `${v} ${k}`).join(" + ")}  make L1 ${r.days1}d, works ${r.worksDays}d`) ?? []),
        ...(rows.upgrade?.filter((r) => r.label === `${squad.name} gym` || r.label === `${squad.name} seats`).map((r) => `  upgrade      ${r.label.padEnd(34)} cost €${(r.cost / 1e6).toFixed(2)}M  ${Object.entries(r.recipe).map(([k, v]) => `${v} ${k}`).join(" + ")}  make L1 ${r.days1}d, works ${r.worksDays}d`) ?? []));
    }
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
console.log(`Component reference value (‱ of the annual revenue): ${(["beam", "slab", "turfPanel", "seat", "floodlight", "gymKit", "medKit", "furniture"] as ComponentId[]).map((id) => `${id} ${(componentValue(id, 1e8) / 1e4).toFixed(2)}`).join(" · ")}`);
console.log("");
console.log("| Works | n | old cost (median) | craft cost / old (mean) | min | max | units (median) | make L1 / works (median) | make L3 / works (median) | L3 slower than the works |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [type, xs] of Object.entries(rows)) {
  const ratios = xs.map((r) => r.value / r.cost);
  const withWorks = xs.filter((r) => r.worksDays > 0);
  console.log(`| ${type} | ${xs.length} | €${(median(xs.map((r) => r.cost)) / 1e6).toFixed(2)}M | ${mean(ratios).toFixed(3)} | ${Math.min(...ratios).toFixed(2)} | ${Math.max(...ratios).toFixed(2)} | ${median(xs.map((r) => r.units))} | ${withWorks.length ? median(withWorks.map((r) => r.days1 / r.worksDays)).toFixed(2) : "-"} | ${withWorks.length ? median(withWorks.map((r) => r.days3 / r.worksDays)).toFixed(2) : "-"} | ${withWorks.length ? `${withWorks.filter((r) => r.days3 > r.worksDays).length}/${withWorks.length}` : "-"} |`);
}
console.log("");
console.log(sizes.join("\n"));
console.log("");
console.log(`Board allowance at board 60, a year: ${(100 * allowanceYear / clubs).toFixed(1)}% of the revenue; a typical season of works: ${(100 * worksYear / clubs).toFixed(1)}% (mean of ${clubs} clubs)`);
