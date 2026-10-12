import { addDays } from "@/Domain/dates";
import { NATION_CONFED, normalizeNation } from "@/Domain/registration/nations";
import type { Confed } from "@/types/registrationTypes";
import type { NationalStageName, NationalTournament } from "@/types/nationalTypes";

/**
 * The FIFA calendar (`.claude/rules/game/national-teams.md` → "Calendário"), pure: international windows,
 * the summer tournaments, the qualifying cycles and the days clubs cannot play.
 */

const weekdayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** First Monday on or after `date`. */
export function mondayOnOrAfter(date: string): string {
  let d = date;
  while (weekdayOf(d) !== 1) d = addDays(d, 1);
  return d;
}

export const FIFA = {
  /** Anchor of each window (the first Monday on or after it); June only in odd years. */
  WINDOW_ANCHORS: [
    { id: "03", md: "03-21" },
    { id: "06", md: "06-01" },
    { id: "09", md: "08-31" },
    { id: "10", md: "10-05" },
    { id: "11", md: "11-09" },
  ],
  /** Match days after the window's Monday. */
  MATCH_OFFSETS: [3, 7],
  /** Players go back to their clubs this many days after the Monday. */
  RELEASE_OFFSET: 8,
  /** Clubs cannot play from the Monday to this day (inclusive). */
  BLOCK_DAYS: 10,
  /** Tournament call-up (and the start of the club break). */
  TOURNAMENT_CALL_UP_MD: "06-01",
  /** First tournament years; then every 4 years. */
  FIRST_EURO: 2028,
  FIRST_WC: 2030,
  /** Draws: qualifiers on 15/01 of year − 2, the tournament on 01/12 of year − 1. */
  QUALIFIER_DRAW_MD: "01-15",
  TOURNAMENT_DRAW_MD: "12-01",
} as const;

export interface FifaWindow {
  /** `YYYY-MM`. */
  id: string;
  start: string;
  matchDates: string[];
  release: string;
  /** Last day clubs cannot play. */
  blockEnd: string;
}

/** The international windows of a year (June only in odd years: even years have a summer tournament). */
export function fifaWindows(year: number): FifaWindow[] {
  const out: FifaWindow[] = [];
  for (const a of FIFA.WINDOW_ANCHORS) {
    if (a.id === "06" && year % 2 === 0) continue;
    const start = mondayOnOrAfter(`${year}-${a.md}`);
    out.push({
      id: `${year}-${a.id}`,
      start,
      matchDates: FIFA.MATCH_OFFSETS.map((o) => addDays(start, o)),
      release: addDays(start, FIFA.RELEASE_OFFSET),
      blockEnd: addDays(start, FIFA.BLOCK_DAYS - 1),
    });
  }
  return out;
}

/** Every window overlapping [from, to]. */
export function windowsBetween(from: string, to: string): FifaWindow[] {
  const out: FifaWindow[] = [];
  for (let y = Number(from.slice(0, 4)) - 1; y <= Number(to.slice(0, 4)); y++) {
    for (const w of fifaWindows(y)) if (w.blockEnd >= from && w.start <= to) out.push(w);
  }
  return out;
}

export interface TournamentFormat {
  tournament: NationalTournament;
  teams: number;
  groups: number;
  /** Teams in the knockout (a power of 2). */
  knockout: number;
  /** "MM-DD" of the first group matchday. */
  startMD: string;
  /** Day offsets from the start: 3 group matchdays then one per knockout stage. */
  offsets: number[];
  stages: NationalStageName[];
  /** Confederations whose leagues stop ("all" for the World Cup). */
  blocks: Confed[] | "all";
}

export const TOURNAMENTS: Record<NationalTournament, TournamentFormat> = {
  wc: {
    tournament: "wc", teams: 48, groups: 12, knockout: 32, startMD: "06-12",
    offsets: [0, 4, 8, 13, 17, 21, 25, 30], stages: ["group", "r32", "r16", "qf", "sf", "final"], blocks: "all",
  },
  euro: {
    tournament: "euro", teams: 24, groups: 6, knockout: 16, startMD: "06-12",
    offsets: [0, 4, 8, 13, 17, 21, 26], stages: ["group", "r16", "qf", "sf", "final"], blocks: ["UEFA"],
  },
  copa: {
    tournament: "copa", teams: 16, groups: 4, knockout: 8, startMD: "06-14",
    offsets: [0, 4, 8, 13, 17, 22], stages: ["group", "qf", "sf", "final"], blocks: ["CONMEBOL", "CONCACAF"],
  },
};

/** World Cup places per confederation (48). */
export const WC_SLOTS: Record<Confed, number> = { UEFA: 16, CAF: 10, AFC: 9, CONMEBOL: 6, CONCACAF: 6, OFC: 1 };
/** Euro places (UEFA). */
export const EURO_SLOTS = 24;
/** Copa América: every CONMEBOL team + the best CONCACAF teams by Elo up to 16. */
export const COPA_GUEST_CONFED: Confed = "CONCACAF";

export function tournamentsOfYear(year: number): NationalTournament[] {
  const out: NationalTournament[] = [];
  if (year >= FIFA.FIRST_WC && (year - FIFA.FIRST_WC) % 4 === 0) out.push("wc");
  if (year >= FIFA.FIRST_EURO && (year - FIFA.FIRST_EURO) % 4 === 0) out.push("euro", "copa");
  return out;
}

export function tournamentSlug(t: NationalTournament, year: number): string {
  return `${t}_${year}`;
}

export function qualifierSlug(t: NationalTournament, year: number, confed: Confed): string {
  return t === "euro" ? `euroq_${year}` : `${t}q_${year}_${confed.toLowerCase()}`;
}

export function friendliesSlug(year: number): string {
  return `friendly_${year}`;
}

export interface TournamentDates {
  callUp: string;
  /** Dates per stage, in stage order (group: 3 matchdays). */
  stageDates: { name: NationalStageName; dates: string[] }[];
  final: string;
}

export function tournamentDates(t: NationalTournament, year: number): TournamentDates {
  const f = TOURNAMENTS[t];
  const start = `${year}-${f.startMD}`;
  const d = f.offsets.map((o) => addDays(start, o));
  const stageDates = f.stages.map((name, i) => ({ name, dates: name === "group" ? d.slice(0, 3) : [d[2 + i]!] }));
  return { callUp: `${year}-${FIFA.TOURNAMENT_CALL_UP_MD}`, stageDates, final: d[d.length - 1]! };
}

/** The window match dates of a tournament's qualifying cycle (years − 2 and − 1), from `notBefore`. */
export function qualifierDates(year: number, notBefore = ""): string[] {
  const out: string[] = [];
  for (const y of [year - 2, year - 1]) {
    for (const w of fifaWindows(y)) for (const d of w.matchDates) if (d >= notBefore) out.push(d);
  }
  return out;
}

export function qualifierDrawDate(year: number): string {
  return `${year - 2}-${FIFA.QUALIFIER_DRAW_MD}`;
}

export function tournamentDrawDate(year: number): string {
  return `${year - 1}-${FIFA.TOURNAMENT_DRAW_MD}`;
}

/** Tournaments needing qualifiers (the Copa América has none). */
export function hasQualifiers(t: NationalTournament): boolean {
  return t !== "copa";
}

const blocksConfed = (t: NationalTournament, confed: Confed | null) => {
  const b = TOURNAMENTS[t].blocks;
  return b === "all" || (confed !== null && b.includes(confed));
};

/**
 * Days in [from, to] when the clubs of a country of `confed` cannot play: every FIFA window (Monday to the
 * Wednesday after), and the summer tournament of its confederation (World Cup: everyone) from the call-up to
 * the final.
 */
export function blockedDays(confed: Confed | null, from: string, to: string): Set<string> {
  const out = new Set<string>();
  const addRange = (a: string, b: string) => {
    for (let d = a > from ? a : from; d <= b && d <= to; d = addDays(d, 1)) out.add(d);
  };
  for (const w of windowsBetween(from, to)) addRange(w.start, w.blockEnd);
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const t of tournamentsOfYear(y)) {
      if (!blocksConfed(t, confed)) continue;
      const td = tournamentDates(t, y);
      addRange(td.callUp, td.final);
    }
  }
  return out;
}

/** `blockedDays` for the clubs of a country (catalog name): its confederation, FIFA windows for everyone. */
export function countryBlockedDays(country: string | null | undefined, from: string, to: string): Set<string> {
  return blockedDays(confedOfCountry(country), from, to);
}

export function confedOfCountry(country: string | null | undefined): Confed | null {
  const n = normalizeNation(country);
  return n ? NATION_CONFED[n] ?? null : null;
}
