// How many foreign players ask for naturalization per league and season (`.claude/rules/game/naturalization.md`).
// bun scripts/naturalization-measure.ts [squadsDir=src/Data/squads] [seasons=12] [leave=0.25]
// The base world has no career history, so the run projects the squads forward: every season each foreigner gets one
// history row at his club, or (chance `leave`, drawn per player and season) is replaced by a new foreigner with no
// years in the country (a transfer abroad, a retirement). A player who asked is replaced too. The national-team places of the chance are read from a call-up pool of
// the world (newPlace: he would be in the 23 of the club's country; originPlace: in the 23 of his own nation).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import leagueData from "@/Data/leagueData.json";
import { asksNaturalization, canAskNaturalization, naturalizationChance, type NaturalizationCtx } from "@/Domain/naturalization/naturalization";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { pickCallUp, type NationCandidate } from "@/Domain/national/nationalSquad";
import { normalizeNation, NATION_CONFED } from "@/Domain/registration/nations";
import type { PlayerHistoryRow, RosterPlayer, Squad } from "@/types/playerTypes";

const dir = process.argv[2] ?? "src/Data/squads";
const SEASONS = Number(process.argv[3] ?? 12);
const LEAVE = Number(process.argv[4] ?? 0.25);
const countryOf = new Map((leagueData as { slug: string; country: string }[]).map((l) => [l.slug, l.country]));
const squads: { league: string; squad: Squad }[] = [];
for (const league of readdirSync(dir)) for (const f of readdirSync(join(dir, league))) {
  squads.push({ league, squad: JSON.parse(readFileSync(join(dir, league, f), "utf8")) });
}
const leagueOfClub = new Map(squads.map((s) => [s.squad.id, s.league]));

// Call-up pool by nation (the real 23 from every squad of the world).
const pool = new Map<string, NationCandidate[]>();
for (const { squad } of squads) for (const p of squad.players) {
  const n = normalizeNation(p.nationality);
  if (!n || !NATION_CONFED[n]) continue;
  (pool.get(n) ?? pool.set(n, []).get(n)!).push({ player: p, squadId: squad.id });
}
const called = new Map<string, Set<string>>();
for (const [n, cands] of pool) called.set(n, new Set(pickCallUp(cands).map((c) => c.player.id)));
const wouldMake = (nation: string, p: RosterPlayer, squadId: string) => {
  if (!NATION_CONFED[nation]) return false;
  return pickCallUp([...(pool.get(nation) ?? []), { player: p, squadId }]).some((c) => c.player.id === p.id);
};

const row = (season: number, league: string, squadId: string): PlayerHistoryRow => ({
  season: String(season), squadId, clubName: "", league, apps: 20, goals: 0, assists: 0, avgRating: null, cupApps: 0,
  cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [],
});

const BASE_YEAR = 2027;
type Tally = { foreign: number; asks: number };
const byLeague = new Map<string, Tally[]>();
const state = new Map<string, RosterPlayer>();
for (const { squad } of squads) for (const p of [...squad.players, ...(squad.youth ?? [])]) state.set(p.id, p);

for (let s = 0; s < SEASONS; s++) {
  const year = BASE_YEAR + s;
  const ctx: NaturalizationCtx = {
    seasonStartYear: year,
    countryOfLeague: (slug) => countryOf.get(slug) ?? "",
    countryOfClub: (id) => countryOf.get(leagueOfClub.get(id) ?? "") ?? "",
  };
  for (const { league, squad } of squads) {
    const country = countryOf.get(league) ?? "";
    const tallies = byLeague.get(league) ?? byLeague.set(league, []).get(league)!;
    const t = (tallies[s] ??= { foreign: 0, asks: 0 });
    for (const base of [...squad.players, ...(squad.youth ?? [])]) {
      const p = { ...state.get(base.id)!, age: base.age + s };
      const nation = normalizeNation(p.nationality);
      if (!nation || !country || nation === (normalizeNation(country) ?? country)) continue;
      t.foreign++;
      let askedNow = false;
      if (canAskNaturalization(p, country, ctx)) {
        const newPlace = wouldMake(normalizeNation(country) ?? country, p, squad.id);
        const originPlace = called.get(nation)?.has(p.id) ?? false;
        if (asksNaturalization(p.id, year, naturalizationChance(p, newPlace, originPlace))) { t.asks++; askedNow = true; }
      }
      // The season ends: one history row at his club, or a newcomer in his place.
      const leaves = askedNow || mulberry32(seedFrom(`natur-measure:${p.id}:${year}`))() < LEAVE;
      state.set(p.id, { ...state.get(base.id)!, history: leaves ? [] : [...(state.get(base.id)!.history ?? []), row(year, league, squad.id)] });
    }
  }
}

const rows = [...byLeague.entries()].map(([league, ts]) => ({
  league, shares: ts.map((t) => (t.foreign ? t.asks / t.foreign : 0)), foreign: ts[0]?.foreign ?? 0,
}));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`${squads.length} squads, ${rows.length} leagues, ${SEASONS} seasons projected, ${pct(LEAVE)} of foreigners replaced each season`);
for (let s = 0; s < SEASONS; s++) {
  const all = rows.map((r) => r.shares[s]!).sort((a, b) => a - b);
  const sum = [...byLeague.values()].reduce((a, ts) => ({ f: a.f + ts[s]!.foreign, k: a.k + ts[s]!.asks }), { f: 0, k: 0 });
  console.log(`season ${BASE_YEAR + s}: world ${pct(sum.k / sum.f)} (${sum.k} of ${sum.f} foreigners) · median league ${pct(all[Math.floor(all.length / 2)]!)} · max ${pct(all[all.length - 1]!)}`);
}
const top = rows.filter((r) => r.foreign >= 20).map((r) => ({ ...r, peak: Math.max(...r.shares) })).sort((a, b) => b.peak - a.peak).slice(0, 8);
console.log("highest league-season shares (leagues with 20+ foreigners):");
for (const r of top) console.log(`  ${r.league.padEnd(40)} foreigners ${String(r.foreign).padStart(3)} · peak ${pct(r.peak)} · by season ${r.shares.map(pct).join(" ")}`);
