/**
 * Youth competitions (under-21 / under-19) — save I/O. Pure logic lives in src/Domain/youthComps/.
 * A youth competition lives in leagues/u21_<country>/ and u19_<country>/ like a league (meta, rounds,
 * date-index, standings) and is NEVER part of meta.activeLeagues
 * (`.claude/rules/game/youth-competitions.md`).
 */
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import { topLeagueOf } from "@/backend/continentalWorld";
import { CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { computeStandings } from "@/Domain/season/computeStandings";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { youthCompSlugOf } from "@/Domain/youthComps/youthCompIds";
import {
  buildYouthCompArchive,
  generateYouthComp,
  youthChampion,
  youthCompsToRegenerate,
  youthStandingsBase,
  youthWindow,
} from "@/Domain/youthComps/generateYouthComp";
import type { Fixture, LeagueCalendarResult, LeagueSeasonMeta, LeagueSeasonState } from "@/types/calendarTypes";
import type { Pyramids } from "@/types/pyramidTypes";
import type { YouthCompAge, YouthCompMetaData } from "@/types/youthCompTypes";
import { logError } from "@/Logger";

const AGES: readonly YouthCompAge[] = YOUTH_COMP.AGES;

/** A country with a tier-1 league in `activeLeagues`: the league and its season state. */
export interface YouthCountry {
  country: string;
  league: string;
  state: Pick<LeagueSeasonState, "year" | "start" | "end">;
}

/** Every catalog country whose tier-1 league (`topLeagueOf`) is active, sorted by country. */
export function youthCountries(
  catalog: LeagueDataEntry[],
  pyramids: Pyramids,
  activeLeagues: Pick<LeagueSeasonState, "leagueSlug" | "year" | "start" | "end">[],
): YouthCountry[] {
  const byLeague = new Map(activeLeagues.map((l) => [l.leagueSlug, l]));
  const countries = [...new Set(catalog.map((l) => l.country).filter((c): c is string => !!c))].sort();
  const out: YouthCountry[] = [];
  for (const country of countries) {
    const league = topLeagueOf(country, catalog, pyramids);
    const state = league ? byLeague.get(league) : undefined;
    if (!league || !state) continue;
    out.push({ country, league, state: { year: state.year, start: state.start, end: state.end } });
  }
  return out;
}

/** First-team dates of each club: its tier-1 league games, every cup stage date, its continental dates. */
async function busyByClubOf(
  service: SaveService,
  saveId: string,
  country: string,
  league: string,
  clubs: string[],
): Promise<Map<string, Set<string>>> {
  const busy = new Map(clubs.map((c) => [c, new Set<string>()]));
  for (const f of await service.getAllFixturesForLeague(saveId, league)) {
    busy.get(f.home)?.add(f.date);
    busy.get(f.away)?.add(f.date);
  }
  const cup = await service.getLeagueMeta(saveId, cupSlugOf(country));
  for (const st of cup?.cup?.stages ?? []) for (const s of busy.values()) s.add(st.date);
  for (const slug of CONTINENTAL_SLUGS) {
    const cm = (await service.getLeagueMeta(saveId, slug))?.continental;
    if (!cm) continue;
    const dates = cm.stages.flatMap((s) => s.dates);
    for (const g of cm.groups) for (const club of g.clubs) for (const d of dates) busy.get(club)?.add(d);
  }
  return busy;
}

/** Write a generated youth competition (meta, every round, date index, zeroed table). */
async function writeYouthComp(service: SaveService, saveId: string, comp: LeagueCalendarResult): Promise<void> {
  const slug = comp.meta.leagueSlug;
  await service.writeLeagueMeta(saveId, comp.meta);
  for (const r of comp.rounds) await service.writeRound(saveId, slug, r.round, r);
  await service.writeDateIndex(saveId, slug, comp.dateIndex);
  await service.writeLeagueStandings(saveId, slug, computeStandings(youthStandingsBase(comp.meta), [], slug));
}

/** Generate and write both youth competitions of one country. Returns the metas written. */
export async function createCountryYouthComps(args: {
  service: SaveService;
  saveId: string;
  index: SquadIndex;
  country: string;
  league: string;
  year: number;
  window: { start: string; end: string };
  ages?: readonly YouthCompAge[];
}): Promise<LeagueSeasonMeta[]> {
  const { service, saveId, index, country, league, year, window } = args;
  const clubs = index.inLeague(league).map((t) => t.squadId);
  if (clubs.length < 2) return [];
  const teams: YouthCompMetaData["teams"] = {};
  for (const id of clubs) {
    const e = index.byId(id);
    teams[id] = { name: e?.name ?? id, colors: e?.colors ?? ["#666666", "#ffffff"] };
  }
  const busyByClub = await busyByClubOf(service, saveId, country, league, clubs);
  const out: LeagueSeasonMeta[] = [];
  for (const age of args.ages ?? AGES) {
    const slug = youthCompSlugOf(country, age);
    const comp = generateYouthComp({
      country, age, year, clubs, teams, window, busyByClub, seedKey: `${saveId}:${year}:${slug}`,
    });
    if (!comp) {
      logError("youthComps", `save ${saveId}: ${slug} ${year} does not fit its window`, window);
      continue;
    }
    await writeYouthComp(service, saveId, comp);
    out.push(comp.meta);
  }
  return out;
}

/** Career creation: both youth competitions of every country with an active tier-1 league. */
export async function createYouthCompetitions(args: {
  service: SaveService;
  saveId: string;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  activeLeagues: LeagueSeasonState[];
  today?: string;
}): Promise<void> {
  for (const c of youthCountries(args.catalog, args.pyramids, args.activeLeagues)) {
    try {
      await createCountryYouthComps({
        service: args.service, saveId: args.saveId, index: args.index, country: c.country, league: c.league,
        year: c.state.year, window: youthWindow(c.state.start, c.state.end, args.today),
      });
    } catch (e) {
      logError("youthComps", `save ${args.saveId}: failed to generate the youth competitions of ${c.country}`, e);
    }
  }
}

/** Some unplayed fixture dated before `today`. */
async function hasStaleFixture(service: SaveService, saveId: string, slug: string, today: string): Promise<boolean> {
  const idx = (await service.getDateIndex(saveId, slug)) ?? {};
  const rounds = new Set<number>();
  for (const [d, rs] of Object.entries(idx)) if (d < today) for (const r of rs) rounds.add(r);
  for (const r of rounds) {
    const rf = await service.getRound(saveId, slug, r);
    if (rf?.fixtures.some((f) => f.date < today && !f.played)) return true;
  }
  return false;
}

/**
 * Safety net after a start kit (or without one): a missing youth competition is created, and one with
 * an unplayed game dated before `today` is regenerated with the window starting tomorrow.
 */
export async function ensureYouthCompetitions(args: {
  service: SaveService;
  saveId: string;
  today: string;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  activeLeagues: LeagueSeasonState[];
}): Promise<string[]> {
  const { service, saveId, today } = args;
  const rebuilt: string[] = [];
  for (const c of youthCountries(args.catalog, args.pyramids, args.activeLeagues)) {
    const ages: YouthCompAge[] = [];
    for (const age of AGES) {
      const slug = youthCompSlugOf(c.country, age);
      const meta = await service.getLeagueMeta(saveId, slug);
      if (!meta?.youth || meta.year !== c.state.year || (await hasStaleFixture(service, saveId, slug, today))) ages.push(age);
    }
    if (ages.length === 0) continue;
    try {
      const metas = await createCountryYouthComps({
        service, saveId, index: args.index, country: c.country, league: c.league, year: c.state.year,
        window: youthWindow(c.state.start, c.state.end, today), ages,
      });
      rebuilt.push(...metas.map((m) => m.leagueSlug));
    } catch (e) {
      logError("youthComps", `save ${saveId}: failed to rebuild the youth competitions of ${c.country}`, e);
    }
  }
  return rebuilt;
}

/**
 * Rollover: a country whose tier-1 league is already in a later season than its youth competitions
 * gets them archived (final table, one title) and regenerated. No try/catch: a failure fails the day.
 */
export async function regenerateYouthComps(args: {
  service: SaveService;
  saveId: string;
  today: string;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  updatedActiveLeagues: LeagueSeasonState[];
}): Promise<string[]> {
  const { service, saveId } = args;
  const countries = youthCountries(args.catalog, args.pyramids, args.updatedActiveLeagues);
  const youthYear: Record<string, number> = {};
  const metas = new Map<string, LeagueSeasonMeta>();
  for (const c of countries) {
    for (const age of AGES) {
      const m = await service.getLeagueMeta(saveId, youthCompSlugOf(c.country, age));
      if (!m?.youth) continue;
      metas.set(m.leagueSlug, m);
      youthYear[c.country] = Math.min(youthYear[c.country] ?? m.year, m.year);
    }
  }
  const states = countries.map((c) => ({ leagueSlug: c.league, country: c.country, ...c.state }));
  const done: string[] = [];
  for (const r of youthCompsToRegenerate(states, youthYear, args.today)) {
    for (const age of AGES) {
      const old = metas.get(youthCompSlugOf(r.country, age));
      if (!old) continue;
      const standings = (await service.getLeagueStandings(saveId, old.leagueSlug)) ?? [];
      const closed: LeagueSeasonMeta = { ...old, youth: { ...old.youth!, championId: old.youth!.championId ?? youthChampion(standings) } };
      await service.writeLeagueSeasonArchive(saveId, buildYouthCompArchive(closed, standings));
    }
    const c = countries.find((x) => x.country === r.country)!;
    const written = await createCountryYouthComps({
      service, saveId, index: args.index, country: r.country, league: c.league, year: r.year, window: r.window,
    });
    done.push(...written.map((m) => m.leagueSlug));
  }
  return done;
}

/** Every fixture of a youth competition (rounds 1..totalRounds). */
export async function youthCompFixtures(service: SaveService, saveId: string, meta: LeagueSeasonMeta): Promise<Fixture[]> {
  const rounds = await Promise.all(
    Array.from({ length: meta.totalRounds }, (_, i) => service.getRound(saveId, meta.leagueSlug, i + 1)),
  );
  return rounds.flatMap((r) => r?.fixtures ?? []);
}

/** The youth competitions of a country (catalog name), `null` when absent from the save. */
export async function youthCompsOfCountry(
  service: SaveService,
  saveId: string,
  country: string,
): Promise<{ u21: string | null; u19: string | null }> {
  const out = { u21: null as string | null, u19: null as string | null };
  for (const age of AGES) {
    const slug = youthCompSlugOf(country, age);
    if ((await service.getLeagueMeta(saveId, slug))?.youth) out[age] = slug;
  }
  return out;
}
