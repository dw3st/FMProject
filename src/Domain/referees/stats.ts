/**
 * Season statistics per referee (spec `docs/superpowers/specs/2026-10-09-referees-design.md` §5). Pure.
 * Fed from the day log (`MatchEvent.referee`), never from the client.
 */
import { addDays } from "@/Domain/dates";
import { fixtureKey } from "@/Domain/referees/assign";
import { REFEREE } from "@/Domain/referees/refereeConfig";
import { strictnessBand } from "@/Domain/referees/strictness";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { RefereeBand, RefereeCompStats, RefereeSeasonStats, RefereeState } from "@/types/refereeTypes";

export function emptyRefereeState(): RefereeState {
  return { assignments: {}, lastWorked: {}, recentByClub: {}, stats: {}, counted: {} };
}

const emptyComp = (): RefereeCompStats => ({ matches: 0, fouls: 0, yellows: 0, reds: 0, penalties: 0 });

function add(into: RefereeCompStats, d: RefereeCompStats): void {
  into.matches += d.matches;
  into.fouls += d.fouls;
  into.yellows += d.yellows;
  into.reds += d.reds;
  into.penalties += d.penalties;
}

/** What one match adds to its referee's record. */
export function matchLine(e: MatchEvent): RefereeCompStats {
  const cards = e.cards ?? [];
  return {
    matches: 1,
    fouls: (e.teamStats.home.fouls ?? 0) + (e.teamStats.away.fouls ?? 0),
    yellows: cards.filter((c) => c.card === "yellow").length,
    reds: cards.filter((c) => c.card === "red").length,
    penalties: (e.teamStats.home.penaltiesAwarded ?? 0) + (e.teamStats.away.penaltiesAwarded ?? 0),
  };
}

/**
 * Adds the day's matches to the season stats, `lastWorked` (referee and assistants) and `recentByClub`. Idempotent
 * per fixture and date (`counted`): a replayed day never counts twice. Matches without a referee are ignored.
 */
export function recordMatches(state: RefereeState, date: string, events: readonly MatchEvent[]): RefereeState {
  const next: RefereeState = {
    ...state,
    stats: { ...state.stats },
    lastWorked: { ...state.lastWorked },
    recentByClub: { ...state.recentByClub },
    counted: { ...state.counted },
  };
  const counted = new Set(next.counted[date] ?? []);
  for (const e of events) {
    if (!e.referee) continue;
    const key = fixtureKey(e.competition, e.fixtureId);
    if (counted.has(key)) continue;
    counted.add(key);
    const id = e.referee.id;
    const prev = next.stats[id];
    const s: RefereeSeasonStats = prev
      ? { ...prev, byCompetition: { ...prev.byCompetition } }
      : { ...emptyComp(), byCompetition: {} };
    const line = matchLine(e);
    add(s, line);
    const comp = { ...(s.byCompetition[e.competition] ?? emptyComp()) };
    add(comp, line);
    s.byCompetition[e.competition] = comp;
    next.stats[id] = s;
    next.lastWorked[id] = date;
    for (const a of next.assignments[date]?.[key]?.assistantIds ?? []) next.lastWorked[a] = date;
    for (const club of [e.home, e.away]) {
      next.recentByClub[club] = [id, ...(next.recentByClub[club] ?? []).filter((x) => x !== id)].slice(0, REFEREE.RECENT_PER_CLUB);
    }
  }
  next.counted[date] = [...counted].sort();
  return next;
}

/** Drops appointments and counted markers older than yesterday, and `lastWorked` entries beyond the rest window. */
export function pruneRefereeState(state: RefereeState, today: string): RefereeState {
  const keepFrom = addDays(today, -1);
  const keep = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([d]) => d >= keepFrom));
  const restFrom = addDays(today, -REFEREE.REST_DAYS - 1);
  return {
    ...state,
    assignments: keep(state.assignments),
    counted: keep(state.counted),
    lastWorked: Object.fromEntries(Object.entries(state.lastWorked).filter(([, d]) => d >= restFrom)),
  };
}

/** Closes a country's season: its referees' stats leave the state (returned for the archive). */
export function closeCountrySeason(state: RefereeState, refereeIds: ReadonlySet<string>): { state: RefereeState; archived: Record<string, RefereeSeasonStats> } {
  const archived: Record<string, RefereeSeasonStats> = {};
  const stats: Record<string, RefereeSeasonStats> = {};
  for (const [id, s] of Object.entries(state.stats)) {
    if (refereeIds.has(id)) archived[id] = s;
    else stats[id] = s;
  }
  return { state: { ...state, stats }, archived };
}

export interface RefereeRow {
  id: string;
  name: string;
  country: string;
  gender: "male" | "female";
  age: number | null;
  band: RefereeBand;
  fifa: boolean;
  matches: number;
  foulsPerMatch: number;
  yellowsPerMatch: number;
  reds: number;
  penalties: number;
}

export interface RefereeInfo { name: string; country: string; strictness: number; fifa: boolean; gender: "male" | "female"; age: number | null }

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Rows of the Referees tab for a competition (`all` = every competition), most yellows per match first. */
export function refereeRows(stats: Record<string, RefereeSeasonStats>, info: (id: string) => RefereeInfo | undefined, competition: string): RefereeRow[] {
  const rows: RefereeRow[] = [];
  for (const [id, s] of Object.entries(stats)) {
    const c = competition === "all" ? s : s.byCompetition[competition];
    const who = info(id);
    if (!c || c.matches === 0 || !who) continue;
    const fouls = competition === "all" ? s.fouls : (s.byCompetition[competition]?.fouls ?? 0);
    rows.push({
      id, name: who.name, country: who.country, gender: who.gender, age: who.age, band: strictnessBand(who.strictness), fifa: who.fifa,
      matches: c.matches, foulsPerMatch: round2(fouls / c.matches), yellowsPerMatch: round2(c.yellows / c.matches), reds: c.reds, penalties: c.penalties,
    });
  }
  return rows.sort((a, b) => b.yellowsPerMatch - a.yellowsPerMatch || b.matches - a.matches || a.name.localeCompare(b.name));
}
