/**
 * Living facilities, measurements M4 and M5 (`docs/superpowers/specs/2026-10-08-living-facilities-design.md` §9).
 *
 *   bun scripts/facilities-wear.ts [--level 6] [--seasons 3]
 *       M4: the ten items of a club, new (wear 0) at `--level`, through `--seasons` seasons day by day
 *       with `wearDay` (the game's daily wear): a European season of 278 days (Aug 15 → May 20) with 25
 *       home games and 48 matches in all spread evenly, one rest day a week, a normal training session
 *       every other day of the window (≈ 190 a season), and the 87-day off-season with time wear only.
 *       A crossing is shown as seasons from the start (`1.42 t` = season 2, 42% of the year in) and
 *       the date in that season (the window starts on Aug 15).
 *       Groundskeeper none / 3★ / 5★ (`pitchWearMult` 1.6 / 1 / 0.75). Prints, by item, the condition at
 *       the end of each season and the fraction of a season at which it crosses 40% and 15%.
 *   bun scripts/facilities-wear.ts --demand
 *       M5: the wage demand of an average signing (26 years, rating 5) at a club whose training ground
 *       is at 100 / 50 / 25 / 0%, and whether an ambition 16 / 17 / 20 player refuses.
 */
import { FACILITY_ITEMS, conditionOf, wearDay, type FacilityItems } from "@/Domain/facilities/facilityItems";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { demandBreakdown, evaluateContractOffer } from "@/Domain/contracts/contracts";
import { initialFacilities } from "@/Domain/facilities/facilities";
import { itemsOfGroup, wearFor } from "@/Domain/facilities/facilityItems";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const argOf = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const SEASON_DAYS = 278;
const YEAR = 365;
const HOME_GAMES = 25;
const MATCHES = 48;

/** One year: day kinds of the season window then the off-season. */
function yearPlan(): { homeGames: number; session: "normal" | null }[] {
  const days: { homeGames: number; session: "normal" | null }[] = [];
  const matchDays = Array.from({ length: MATCHES }, (_, i) => Math.round(((i + 0.5) * SEASON_DAYS) / MATCHES));
  const matchDay = new Set(matchDays);
  // HOME_GAMES of the MATCHES at home, spread evenly.
  const homeDay = new Set(matchDays.filter((_, i) => Math.floor(((i + 1) * HOME_GAMES) / MATCHES) > Math.floor((i * HOME_GAMES) / MATCHES)));
  for (let d = 0; d < YEAR; d++) {
    if (d >= SEASON_DAYS) { days.push({ homeGames: 0, session: null }); continue; }
    if (matchDay.has(d)) { days.push({ homeGames: homeDay.has(d) ? 1 : 0, session: null }); continue; }
    if (d % 7 === 6) { days.push({ homeGames: 0, session: null }); continue; }
    days.push({ homeGames: 0, session: "normal" });
  }
  return days;
}

/** Day-of-season date (dd/mm) of a fraction of years from the start (Aug 15). */
function dateOf(years: number): string {
  const d = new Date(Date.UTC(2026, 7, 15) + Math.round((years % 1) * YEAR) * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function wearMeasure(): void {
  const level = Number(argOf("--level") ?? 6);
  const seasons = Number(argOf("--seasons") ?? 3);
  const plan = yearPlan();
  const homes = plan.filter((d) => d.homeGames > 0).length;
  const sessions = plan.filter((d) => d.session).length;
  console.log(`Nível ${level}, novo (100%); ${homes} jogos em casa e ${sessions} treinos normais por temporada; ${seasons} temporadas\n`);
  for (const [label, mult] of [["sem jardineiro", FACILITIES.GROUNDSKEEPER.NONE], ["jardineiro 3★", 1], ["jardineiro 5★", FACILITIES.GROUNDSKEEPER.CURVE[2]]] as const) {
    let items = Object.fromEntries(FACILITY_ITEMS.map((id) => [id, { level, wear: 0 }])) as FacilityItems;
    const cross: Record<string, { w40?: number; c15?: number }> = {};
    const ends: Record<string, number[]> = {};
    for (let s = 0; s < seasons; s++) {
      for (const [d, day] of plan.entries()) {
        const r = wearDay(items, { homeGames: day.homeGames, session: day.session, pitchWearMult: mult });
        items = r.items;
        for (const c of r.crossings) {
          const at = s + d / YEAR;
          cross[c.item] ??= {};
          if (c.kind === "worn" && cross[c.item]!.w40 === undefined) cross[c.item]!.w40 = at;
          if (c.kind === "condemned" && cross[c.item]!.c15 === undefined) cross[c.item]!.c15 = at;
        }
      }
      for (const id of FACILITY_ITEMS) (ends[id] ??= []).push(conditionOf(items[id]));
    }
    console.log(label);
    console.log(["item".padEnd(18), ...Array.from({ length: seasons }, (_, s) => `fim T${s + 1}`.padStart(9)), "40% em".padStart(17), "15% em".padStart(17)].join(""));
    for (const id of FACILITY_ITEMS) {
      const c = cross[id] ?? {};
      const fmt = (v: number | undefined) => (v === undefined ? "—" : `${v.toFixed(2)} t ${dateOf(v)}`).padStart(17);
      console.log([id.padEnd(18), ...ends[id]!.map((v) => `${v.toFixed(0)}%`.padStart(9)), fmt(c.w40), fmt(c.c15)].join(""));
    }
    console.log("");
  }
}

function demandMeasure(): void {
  const stats = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5,
    stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5 };
  const player = (id: string, ambition: number): RosterPlayer => ({
    id, name: id, age: 26, squadId: "x", preferredFoot: "right", positions: ["CM"], stats,
    profile: { summary: "" } as RosterPlayer["profile"],
    personality: { ambition, loyalty: 10.5, professionalism: 10.5, temperament: 10.5 },
  });
  const base: Squad = {
    id: "club", name: "Club", colors: ["#000", "#fff"], money: 0, players: [player("mate", 10.5)],
    finances: { broadcasting: 40_000_000, commercial: 20_000_000, total: 60_000_000, budget: 0, followers: 1_000_000 },
    venue: { name: "S", city: "C", capacity: 30_000, surface: "grass" }, wageFactor: 1,
  };
  const withCt = (cond: number): Squad => {
    const f = initialFacilities(base, 1);
    const items = { ...f.items };
    for (const id of itemsOfGroup("training")) items[id] = { ...items[id], wear: wearFor(cond) };
    return { ...base, facilities: { ...f, items } };
  };
  console.log("Pedido de um jogador médio (26 anos) por condição do CT; recusa por ambição\n");
  console.log(["CT".padEnd(6), "pedido ×".padStart(10), "amb 16".padStart(10), "amb 17".padStart(10), "amb 20".padStart(10)].join(""));
  for (const ct of [100, 50, 25, 24, 0]) {
    const sq = withCt(ct);
    const b = demandBreakdown(player("p", 10.5), sq, "2027-01-01");
    const ans = (a: number) => (evaluateContractOffer({ wage: 1e9, years: 2 }, player(`a${a}`, a), sq, "2027-01-01").reason === "poorFacilities" ? "recusa" : "aceita").padStart(10);
    console.log([`${ct}%`.padEnd(6), b.facilities.toFixed(3).padStart(10), ans(16), ans(17), ans(20)].join(""));
  }
}

if (process.argv.includes("--demand")) demandMeasure();
else wearMeasure();
