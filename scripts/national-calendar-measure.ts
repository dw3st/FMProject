/**
 * M1 of the national-teams spec: the league calendars with the FIFA windows and the summer tournaments blocked.
 * For every league of the world and several seasons: all rounds inside the window and off the blocked days, the
 * rounds off the league's match days (midweek), the shortest gap and the rounds under 4 days apart, against the
 * calendar without blocks.
 *
 *   bun scripts/national-calendar-measure.ts [years=2026,2027,2028,2030]
 */
import { generateLeagueCalendar } from "@/Domain/season/generateCalendar";
import { LEAGUE_SCHEDULE_CONFIGS, leagueSeasonEnd, leagueSeasonStart } from "@/Domain/season/leagueScheduleConfig";
import { countryBlockedDays } from "@/Domain/national/fifaCalendar";

const years = (process.argv[2] ?? "2026,2027,2028,2030").split(",").map(Number);
const leagueData = (await Bun.file("src/example_data/leagueData.json").json()) as { slug: string; country: string; standings: { squadId: string }[] }[];
const byGroup = new Map<string, { leagues: number; rounds: number; midweek: number; midweekBefore: number; under4: number; under4Before: number; minGap: number; broken: number }>();
const dayMs = 86_400_000;
const gapOf = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / dayMs;

for (const year of years) {
  for (const cfg of LEAGUE_SCHEDULE_CONFIGS) {
    const l = leagueData.find((x) => x.slug === cfg.slug);
    if (!l) continue;
    // Calendar-year leagues play the year; cross-year leagues start in it.
    const start = leagueSeasonStart(cfg, year);
    const end = leagueSeasonEnd(cfg, year);
    const teams = l.standings.map((s) => s.squadId);
    const blocked = countryBlockedDays(l.country, start, end);
    const before = generateLeagueCalendar(cfg, teams, year);
    const after = generateLeagueCalendar(cfg, teams, year, { blocked });
    const dates = (c: typeof after) => c.rounds.map((r) => r.fixtures[0]?.date ?? "").filter(Boolean);
    const da = dates(after);
    const db = dates(before);
    const off = (ds: string[]) => ds.filter((d) => !cfg.matchDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())).length;
    const under4 = (ds: string[]) => ds.slice(1).filter((d, i) => gapOf(ds[i]!, d) < 4).length;
    const gaps = da.slice(1).map((d, i) => gapOf(da[i]!, d));
    const broken = da.filter((d) => d < start || d > end || blocked.has(d)).length + gaps.filter((g) => g < 1).length;
    const key = `${year} ${cfg.crossYear ? "cruza o ano" : "ano civil"} · ${teams.length <= 18 ? "≤18" : teams.length <= 20 ? "19–20" : "21+"} clubes`;
    const g = byGroup.get(key) ?? { leagues: 0, rounds: 0, midweek: 0, midweekBefore: 0, under4: 0, under4Before: 0, minGap: 99, broken: 0 };
    g.leagues++;
    g.rounds += da.length;
    g.midweek += off(da);
    g.midweekBefore += off(db);
    g.under4 += under4(da);
    g.under4Before += under4(db);
    g.minGap = Math.min(g.minGap, ...gaps);
    g.broken += broken;
    byGroup.set(key, g);
  }
}

console.log("| Temporada e grupo | ligas | rodadas | fora dos dias de jogo (antes → depois) | < 4 dias entre rodadas (antes → depois) | menor intervalo | fora da janela ou bloqueada |");
console.log("|---|---|---|---|---|---|---|");
for (const [k, g] of [...byGroup].sort()) {
  console.log(`| ${k} | ${g.leagues} | ${g.rounds} | ${g.midweekBefore} → ${g.midweek} | ${g.under4Before} → ${g.under4} | ${g.minGap} | ${g.broken} |`);
}
