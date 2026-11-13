import { SCOUTING as S } from "@/Domain/scouting/scoutingConfig";
import { countryKnowledgeOf } from "@/Domain/scouting/countryKnowledge";
import { MIN_BY_ROLE } from "@/Domain/contracts/freeAgents";
import { daysBetween } from "@/Domain/dates";
import { seedFrom } from "@/Domain/rng";
import type { MainRole } from "@/Domain/roles";
import type { StaffMember } from "@/types/staffTypes";
import type { ScoutFocus, ScoutTarget } from "@/types/scoutingTypes";

/**
 * The chief scout's Monday planning (issue #157, `.claude/rules/game/scouting.md` → "Missões pelo
 * olheiro-chefe"). Pure and deterministic (`seedFrom(save:date:country)` breaks ties): every free
 * scout gets one mission. With 2+ free scouts the best (scout, country) pair by country knowledge
 * goes on a youth mission (4 weeks); the others go on a country mission (8 weeks) in their best
 * country not already targeted, or, when none is known at least "moderate", on their nationality's
 * continent (8 weeks). Region missions look for "only who improves the squad", each on a different line: the
 * neediest first, then the next ones (`lineOrder`), skipping the lines the active missions already cover.
 * Never a player mission.
 */

export const CHIEF_PLAN = {
  REGION_WEEKS: 8,
  CONTINENT_WEEKS: 8,
  YOUTH_WEEKS: 4,
  /** Days a scout whose mission the manager cancelled stays out of the chief's plan. */
  HOLD_DAYS: 7,
} as const;

export interface ChiefScout {
  /** "chief" or the field scout's member id. */
  scoutId: string;
  name: string;
  member: Pick<StaffMember, "nationality" | "countryKnowledge">;
}

export interface PlannedMission {
  scoutId: string;
  scoutName: string;
  target: ScoutTarget;
  focus?: ScoutFocus;
  weeks: number;
}

export interface ChiefPlanInput {
  saveId: string;
  date: string;
  /** Free scouts (no active mission, not on hold), chief first. */
  scouts: ChiefScout[];
  /** Countries with a league in the world (valid mission targets). */
  countries: string[];
  continentOf: (country: string) => string | undefined;
  /** Targets of the missions still active (not repeated). */
  activeTargets: ScoutTarget[];
  /** League slug → country, so a league mission blocks its country. */
  countryOfLeague?: (league: string) => string | undefined;
  /** Mean overall of the starters of each line (`starterLineAverages`). */
  lineAverages: Record<MainRole, number>;
  /** Players per line in the squad. */
  lineCounts: Record<MainRole, number>;
  /** Lines the active region missions already look for (not repeated while another line is free). */
  activeLines?: MainRole[];
}

const LINES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];
const OUTFIELD: MainRole[] = ["Defender", "Midfielder", "Forward"];

/**
 * The line the chief looks for: the biggest shortfall against the squad minimums (GK 3, DEF 7,
 * MID 7, FWD 4); without one, the outfield line with the weakest starters. The goalkeeper's overall
 * runs on another scale, so the GK line only comes up through a depth shortfall.
 */
export function neediestLine(lineAverages: Record<MainRole, number>, lineCounts: Record<MainRole, number>): MainRole {
  let best: MainRole | null = null;
  let bestDeficit = 0;
  for (const l of LINES) {
    const d = MIN_BY_ROLE[l] - (lineCounts[l] ?? 0);
    if (d > bestDeficit) { best = l; bestDeficit = d; }
  }
  if (best) return best;
  return OUTFIELD.reduce((a, b) => ((lineAverages[b] ?? 99) < (lineAverages[a] ?? 99) ? b : a));
}

/**
 * The lines in the order the chief covers them: the lines short of the squad minimum (biggest shortfall first),
 * then the outfield lines from the weakest starters to the strongest. The goalkeeper line only enters through a
 * depth shortfall. The first is `neediestLine`.
 */
export function lineOrder(lineAverages: Record<MainRole, number>, lineCounts: Record<MainRole, number>): MainRole[] {
  const deficit = (l: MainRole) => MIN_BY_ROLE[l] - (lineCounts[l] ?? 0);
  const short = LINES.filter((l) => deficit(l) > 0).sort((a, b) => deficit(b) - deficit(a));
  const rest = OUTFIELD.filter((l) => !short.includes(l)).sort((a, b) => (lineAverages[a] ?? 99) - (lineAverages[b] ?? 99));
  return [...short, ...rest];
}

/** Whether a scout whose mission the manager cancelled on `cancelledOn` is still out of the plan on `date`. */
export function onHold(cancelledOn: string | undefined, date: string): boolean {
  return !!cancelledOn && daysBetween(cancelledOn, date) < CHIEF_PLAN.HOLD_DAYS;
}

const keyOf = (kind: string, place: string) => `${kind}:${place}`;

export function planChiefMissions(input: ChiefPlanInput): PlannedMission[] {
  const { saveId, date, scouts, countries } = input;
  if (scouts.length === 0 || countries.length === 0) return [];
  const used = new Set<string>();
  for (const t of input.activeTargets) {
    if (t.kind === "country" && t.country) used.add(keyOf("country", t.country));
    if (t.kind === "youth" && t.country) used.add(keyOf("youth", t.country));
    if (t.kind === "continent" && t.continent) used.add(keyOf("continent", t.continent));
    if (t.kind === "league" && t.league) {
      const c = input.countryOfLeague?.(t.league);
      if (c) used.add(keyOf("country", c));
    }
  }
  const tie = (c: string) => seedFrom(`${saveId}:${date}:${c}`);
  const kOf = (s: ChiefScout, c: string) => countryKnowledgeOf(s.member, c, date);
  /** Countries ranked for `s` (knowledge desc, then the seeded tie-break). */
  const ranked = (s: ChiefScout, kind: "country" | "youth") =>
    countries
      .filter((c) => !used.has(keyOf(kind, c)))
      .map((c) => ({ c, k: kOf(s, c), h: tie(c) }))
      .sort((a, b) => b.k - a.k || a.h - b.h || (a.c < b.c ? -1 : 1));

  // One line per region mission: a squad short of goalkeepers must not turn every report into a goalkeeper.
  const order = lineOrder(input.lineAverages, input.lineCounts);
  const taken = [...(input.activeLines ?? [])];
  const nextFocus = (): ScoutFocus => {
    const count = (l: MainRole) => taken.filter((t) => t === l).length;
    const line = order.reduce((a, b) => (count(b) < count(a) ? b : a));
    taken.push(line);
    return { line, improves: true };
  };
  const out: PlannedMission[] = [];
  let free = [...scouts];

  // At least one youth mission when 2+ scouts are free: the best (scout, country) pair.
  if (free.length >= 2) {
    let pick: { s: ChiefScout; c: string; k: number; h: number } | null = null;
    for (const s of free) {
      const top = ranked(s, "youth")[0];
      if (top && (!pick || top.k > pick.k || (top.k === pick.k && top.h < pick.h))) pick = { s, ...top };
    }
    if (pick) {
      used.add(keyOf("youth", pick.c));
      out.push({ scoutId: pick.s.scoutId, scoutName: pick.s.name, target: { kind: "youth", country: pick.c }, weeks: CHIEF_PLAN.YOUTH_WEEKS });
      free = free.filter((s) => s !== pick!.s);
    }
  }

  for (const s of free) {
    const options = ranked(s, "country");
    const top = options[0];
    if (top && top.k >= S.COUNTRY.BANDS.moderate) {
      used.add(keyOf("country", top.c));
      out.push({ scoutId: s.scoutId, scoutName: s.name, target: { kind: "country", country: top.c }, focus: nextFocus(), weeks: CHIEF_PLAN.REGION_WEEKS });
      continue;
    }
    const continent = input.continentOf(s.member.nationality) ?? (top ? input.continentOf(top.c) : undefined);
    if (continent && !used.has(keyOf("continent", continent))) {
      used.add(keyOf("continent", continent));
      out.push({ scoutId: s.scoutId, scoutName: s.name, target: { kind: "continent", continent }, focus: nextFocus(), weeks: CHIEF_PLAN.CONTINENT_WEEKS });
      continue;
    }
    if (top) {
      used.add(keyOf("country", top.c));
      out.push({ scoutId: s.scoutId, scoutName: s.name, target: { kind: "country", country: top.c }, focus: nextFocus(), weeks: CHIEF_PLAN.REGION_WEEKS });
    }
  }
  return out;
}
