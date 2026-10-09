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
import { youthCompAgeOf, youthCompSlugOf } from "@/Domain/youthComps/youthCompIds";
import { pickYouthLineup } from "@/Domain/youthComps/youthLineup";
import { applyYouthMatch, postponeDate, updateLeaders, youthMatchLog, type YouthPlayerInfo } from "@/Domain/youthComps/youthMatch";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
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
import type { YouthCompAge, YouthCompMetaData, YouthMatchLog } from "@/types/youthCompTypes";
import type { Squad } from "@/types/playerTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
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

// ── The day ─────────────────────────────────────────────────────────────────────

export interface YouthDayInjury {
  squadId: string;
  playerId: string;
  playerName: string;
  severity: "light" | "medium" | "severe";
  returnDate: string;
}

export interface YouthDayResult {
  /** Squads changed by today's youth games (to merge into the day's `squadWrites`). */
  squads: Map<string, Squad>;
  /** Real players who played a youth game today (they neither train nor rest). */
  participants: Set<string>;
  logs: YouthMatchLog[];
  injuries: YouthDayInjury[];
  /** Players whose injury cleared at a youth game today ("returned" inbox message). */
  healed: { squadId: string; playerId: string; playerName: string }[];
  /** Ages whose call-ups of the human club were used today (played or cancelled). */
  consumedCallUps: YouthCompAge[];
  /** Human call-ups of a game played today who did not play, per age. */
  skippedCallUps: Partial<Record<YouthCompAge, string[]>>;
  postponed: number;
  cancelled: number;
}

/**
 * Plays today's youth-competition games (`.claude/rules/game/youth-competitions.md` → "O dia"): a game
 * whose club plays for the first team today is postponed (or cancelled with no free day), the
 * under-19 is played before the under-21 (nobody plays twice), each side gets its automatic youth XI,
 * quickSim, and the youth post-match. Rounds, the table and the leaders are written once per
 * competition played today.
 */
export async function playYouthDay(args: {
  service: SaveService;
  saveId: string;
  date: string;
  index: SquadIndex;
  /** Human club (`meta.clubId`, "" when unemployed). */
  humanClubId: string;
  callUps?: { u21?: string[]; u19?: string[] };
  tactics: TacticsSave | null;
  teamsPlayingToday: ReadonlySet<string>;
  squadOf: (id: string) => Promise<Squad | null>;
  rng?: () => number;
}): Promise<YouthDayResult> {
  const { service, saveId, date, index, humanClubId } = args;
  const rng = args.rng ?? Math.random;
  const out: YouthDayResult = {
    squads: new Map(), participants: new Set(), logs: [], injuries: [], healed: [], consumedCallUps: [],
    skippedCallUps: {}, postponed: 0, cancelled: 0,
  };
  const todays = await service.getYouthFixturesForDate(saveId, date);
  if (todays.length === 0) return out;

  const bySlug = new Map<string, Fixture[]>();
  for (const f of todays) (bySlug.get(f.competition) ?? bySlug.set(f.competition, []).get(f.competition)!).push(f);
  const ageRank = (s: string) => (youthCompAgeOf(s) === "u19" ? 0 : 1);
  const slugs = [...bySlug.keys()].sort((a, b) => ageRank(a) - ageRank(b) || a.localeCompare(b));

  // First-team dates of a club (league date index, cup stages of its country, continental dates),
  // memoised per league / country for the day.
  const leagueDates = new Map<string, Set<string>>();
  const cupDates = new Map<string, Set<string>>();
  let continental: { clubs: Set<string>; dates: Set<string> }[] | null = null;
  const datesOfLeague = async (slug: string) => {
    let s = leagueDates.get(slug);
    if (!s) {
      s = new Set(Object.keys((await service.getDateIndex(saveId, slug)) ?? {}));
      leagueDates.set(slug, s);
    }
    return s;
  };
  const datesOfCup = async (country: string) => {
    let s = cupDates.get(country);
    if (!s) {
      const cup = await service.getLeagueMeta(saveId, cupSlugOf(country));
      s = new Set((cup?.cup?.stages ?? []).map((st) => st.date));
      cupDates.set(country, s);
    }
    return s;
  };
  const continentalOf = async () => {
    if (!continental) {
      const list: { clubs: Set<string>; dates: Set<string> }[] = [];
      for (const slug of CONTINENTAL_SLUGS) {
        const cm = (await service.getLeagueMeta(saveId, slug))?.continental;
        if (!cm) continue;
        list.push({ clubs: new Set(cm.groups.flatMap((g) => g.clubs)), dates: new Set(cm.stages.flatMap((s) => s.dates)) });
      }
      continental = list;
    }
    return continental;
  };
  const busySets = new Map<string, Set<string>[]>();
  const busySetsOf = async (club: string, country: string) => {
    let sets = busySets.get(club);
    if (!sets) {
      sets = [];
      const league = index.byId(club)?.leagueSlug;
      if (league) sets.push(await datesOfLeague(league));
      sets.push(await datesOfCup(country));
      for (const c of await continentalOf()) if (c.clubs.has(club)) sets.push(c.dates);
      busySets.set(club, sets);
    }
    return sets;
  };

  const squadNow = async (id: string): Promise<Squad | null> => out.squads.get(id) ?? (await args.squadOf(id));
  const consume = (age: YouthCompAge) => {
    if (!out.consumedCallUps.includes(age)) out.consumedCallUps.push(age);
  };

  for (const slug of slugs) {
    const age = youthCompAgeOf(slug)!;
    const meta = await service.getLeagueMeta(saveId, slug);
    if (!meta?.youth) continue;
    const country = meta.youth.country;
    const all = await youthCompFixtures(service, saveId, meta);
    const changedRounds = new Set<number>();
    const dateIndex = (await service.getDateIndex(saveId, slug)) ?? {};
    let dateIndexChanged = false;
    let leaders = meta.youth.leaders;
    let played = false;
    const replace = (f: Fixture) => {
      const i = all.findIndex((x) => x.id === f.id);
      if (i >= 0) all[i] = f;
      changedRounds.add(f.round);
    };
    const sameCompDates = new Map<string, Set<string>>();
    for (const f of all) {
      if (f.played) continue;
      for (const c of [f.home, f.away]) (sameCompDates.get(c) ?? sameCompDates.set(c, new Set()).get(c)!).add(f.date);
    }
    const cancel = (fx: Fixture) => {
      replace({ ...fx, played: true, result: null, cancelled: true });
      out.cancelled++;
      out.logs.push({
        competition: slug, fixtureId: fx.id, home: fx.home, away: fx.away, score: null, scorers: [], best: null,
        players: { home: [], away: [] }, ...(fx.postponedFrom ? { postponedFrom: fx.postponedFrom } : {}),
      });
    };

    for (const fx of bySlug.get(slug)!) {
      const humanSide = fx.home === humanClubId || fx.away === humanClubId;
      if (args.teamsPlayingToday.has(fx.home) || args.teamsPlayingToday.has(fx.away)) {
        const homeSets = await busySetsOf(fx.home, country);
        const awaySets = await busySetsOf(fx.away, country);
        const busy = (club: string, d: string) => (club === fx.home ? homeSets : awaySets).some((s) => s.has(d));
        const next = postponeDate({ date, end: meta.end, busy, home: fx.home, away: fx.away, sameCompDates });
        if (next) {
          replace({ ...fx, date: next, postponedFrom: fx.postponedFrom ?? fx.date });
          for (const c of [fx.home, fx.away]) sameCompDates.get(c)?.add(next);
          if (!(dateIndex[next] ?? []).includes(fx.round)) {
            dateIndex[next] = [...(dateIndex[next] ?? []), fx.round].sort((a, b) => a - b);
            dateIndexChanged = true;
          }
          out.postponed++;
          continue;
        }
        cancel(fx);
        if (humanSide) consume(age);
        continue;
      }

      const home = await squadNow(fx.home);
      const away = await squadNow(fx.away);
      if (!home || !away) {
        cancel(fx);
        continue;
      }
      const filler = { saveId, slug, year: meta.year };
      const side = (squad: Squad) => {
        const human = squad.id === humanClubId;
        const saved = human ? (args.tactics?.lineup ?? []).filter((id) => id) : [];
        const xi = saved.length > 0
          ? saved
          : autoLineupForFormation(squad, formationForSimId(human ? args.tactics?.formation : squad.aiFormation?.id), date);
        return pickYouthLineup({
          age, squad, firstTeamXI: new Set(xi), callUps: human ? (args.callUps?.[age] ?? []) : [],
          playedToday: out.participants, date, filler, nationality: country,
        });
      };
      const hl = side(home);
      const al = side(away);
      if (home.id === humanClubId) out.skippedCallUps[age] = hl.skippedCallUps;
      if (away.id === humanClubId) out.skippedCallUps[age] = al.skippedCallUps;
      const roles = slotRoles(formationForSimId("4-3-3"));
      const { recording } = quickSimMatch({
        fixtureId: fx.id,
        home: { ...home, players: hl.matchPlayers },
        away: { ...away, players: al.matchPlayers },
        homeLineup: hl.lineup, awayLineup: al.lineup, homeRoles: roles, awayRoles: roles,
        pitchCondition: YOUTH_COMP.PITCH,
      }, rng);

      const generated = new Set([...hl.generatedIds, ...al.generatedIds]);
      const names = new Map<string, YouthPlayerInfo>();
      for (const [squad, lineup] of [[home, hl], [away, al]] as const) {
        for (const p of lineup.matchPlayers) {
          names.set(p.id, { name: p.name, squadId: squad.id, ...(generated.has(p.id) ? { generated: true as const } : {}) });
        }
      }
      const info = (id: string): YouthPlayerInfo => names.get(id) ?? { name: id, squadId: "" };

      for (const squad of [home, away]) {
        const res = applyYouthMatch(squad, recording, { date, rng, trackMorale: squad.id === humanClubId });
        out.squads.set(squad.id, res.squad);
        for (const id of res.participants) out.participants.add(id);
        for (const inj of res.injuriesApplied) {
          out.injuries.push({
            squadId: squad.id, playerId: inj.playerId, playerName: inj.playerName, severity: inj.severity, returnDate: inj.returnDate,
          });
        }
        const roster = [...squad.players, ...(squad.youth ?? [])];
        for (const id of res.healedPlayerIds) {
          out.healed.push({ squadId: squad.id, playerId: id, playerName: roster.find((p) => p.id === id)?.name ?? id });
        }
      }
      leaders = updateLeaders(leaders, recording, info);
      out.logs.push(youthMatchLog(fx, recording, info, { home: hl.lineup, away: al.lineup }, generated));
      replace({ ...fx, played: true, result: { ...recording.score } });
      played = true;
      if (humanSide) consume(age);
    }

    for (const r of changedRounds) {
      await service.writeRound(saveId, slug, r, { leagueSlug: slug, round: r, fixtures: all.filter((f) => f.round === r) });
    }
    if (dateIndexChanged) await service.writeDateIndex(saveId, slug, dateIndex);
    if (changedRounds.size > 0) {
      await service.writeLeagueStandings(saveId, slug, computeStandings(youthStandingsBase(meta), all, slug));
    }
    if (played) await service.writeLeagueMeta(saveId, { ...meta, youth: { ...meta.youth, leaders } });
  }
  return out;
}
