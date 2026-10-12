import { isInjured } from "@/Domain/injury/injury";
import { clamp } from "@/Domain/math";
import { MAIN_ROLE_TO_SPECIFICS, overallAvg } from "@/Domain/playerRating";
import { preferredRole, slotValue } from "@/Domain/positions/positionAptitude";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { academyGauss, academyUnit, makeAcademyPlayer } from "@/Domain/youth/youth";
import { autoFillLineupWithFitness, autoFillLineup } from "@/Domain/lineupHelpers";
import { slotsFor } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { Confed } from "@/types/registrationTypes";

/** National-team squads (`.claude/rules/game/national-teams.md` → "Convocação"), pure. */

export const NATIONAL_SQUAD = {
  SIZE: 23,
  QUOTAS: { GK: 3, Defender: 8, Midfielder: 7, Forward: 5 } as Record<MainRole, number>,
  MIN_FITNESS: 50,
  FORMATION: "4-3-3",
  /** Generated players: the nation's real mean − OFFSET (with ≥ MIN_REAL real players), else the confed base. */
  FILLER_OFFSET: 0.8,
  FILLER_MIN_REAL: 3,
  FILLER_SIGMA: 0.35,
  FILLER_MIN: 1.5,
  FILLER_MAX: 6,
  FILLER_AGE: [21, 32] as const,
  CONFED_BASE: { UEFA: 3.4, CONMEBOL: 3.5, CAF: 3.0, AFC: 2.6, CONCACAF: 2.6, OFC: 2.1 } as Record<Confed, number>,
} as const;

const LINES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];
const LINE_KEY: Record<MainRole, string> = { GK: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" };

export const lineOf = (p: RosterPlayer): MainRole => getMainRole(preferredRole(p));
const levelOf = (p: RosterPlayer) => slotValue(p, preferredRole(p));
const fitnessOf = (p: RosterPlayer) => p.seasonLog?.fitness ?? emptySeasonLog().fitness;

export interface NationCandidate {
  player: RosterPlayer;
  squadId: string;
}

/** A player as the national team sees him: club suspensions and the duty itself never keep him out. */
export function asNationalPlayer(p: RosterPlayer): RosterPlayer {
  if (!p.suspension && !p.nationalDuty) return p;
  const { suspension: _s, nationalDuty: _d, ...rest } = p;
  return rest;
}

/** Candidates the AI calls up: not injured on the first match day, fitness ≥ MIN_FITNESS. */
export function callableCandidates(cands: NationCandidate[], firstMatch: string): NationCandidate[] {
  return cands.filter((c) => !isInjured(c.player, firstMatch) && fitnessOf(c.player) >= NATIONAL_SQUAD.MIN_FITNESS);
}

/**
 * The 23 called up from the candidates: per line the quota (GK 3, DEF 8, MID 7, FWD 5) by level in the natural
 * position, then the best of the rest, ties by id. Returns fewer than 23 when there are not enough candidates.
 */
export function pickCallUp(cands: NationCandidate[]): NationCandidate[] {
  const ranked = [...cands].sort((a, b) => levelOf(b.player) - levelOf(a.player) || (a.player.id < b.player.id ? -1 : 1));
  const picked: NationCandidate[] = [];
  const taken = new Set<string>();
  for (const line of LINES) {
    const ofLine = ranked.filter((c) => lineOf(c.player) === line).slice(0, NATIONAL_SQUAD.QUOTAS[line]);
    for (const c of ofLine) { picked.push(c); taken.add(c.player.id); }
  }
  for (const c of ranked) {
    if (picked.length >= NATIONAL_SQUAD.SIZE) break;
    if (!taken.has(c.player.id)) { picked.push(c); taken.add(c.player.id); }
  }
  return picked.slice(0, NATIONAL_SQUAD.SIZE);
}

/** Missing places per line to complete the 23 (the quota per line first). */
export function missingByLine(players: RosterPlayer[]): Record<MainRole, number> {
  const have: Record<MainRole, number> = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 };
  for (const p of players) have[lineOf(p)]++;
  const out: Record<MainRole, number> = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 };
  let total = players.length;
  for (const line of LINES) {
    const n = Math.max(0, NATIONAL_SQUAD.QUOTAS[line] - have[line]);
    out[line] = n;
    total += n;
  }
  // Already over a quota in another line but short of 23: midfielders fill the rest.
  if (total < NATIONAL_SQUAD.SIZE) out.Midfielder += NATIONAL_SQUAD.SIZE - total;
  return out;
}

/** Level of the generated players of a nation. */
export function fillerLevel(realLevels: number[], confed: Confed): number {
  if (realLevels.length >= NATIONAL_SQUAD.FILLER_MIN_REAL) {
    const mean = realLevels.reduce((s, v) => s + v, 0) / realLevels.length;
    return clamp(mean - NATIONAL_SQUAD.FILLER_OFFSET, NATIONAL_SQUAD.FILLER_MIN, NATIONAL_SQUAD.FILLER_MAX);
  }
  return NATIONAL_SQUAD.CONFED_BASE[confed];
}

export function isGeneratedNationalId(id: string): boolean {
  return id.startsWith("ngen_");
}

/**
 * `n` generated players of one line of a national team: deterministic per save, nation, year, line and index
 * (`ngen_<key>_<year>_<line>_<i>`), never written to the world. Names from `donors` (full names of the nation).
 */
export function nationalFillers(args: {
  saveId: string;
  teamId: string;
  nation: string;
  year: number;
  line: MainRole;
  n: number;
  level: number;
  donors: string[];
}): RosterPlayer[] {
  const { saveId, teamId, nation, year, line, n, level } = args;
  const lk = LINE_KEY[line];
  const key = teamId.replace(/^nat_/, "");
  const seed = `${saveId}:${teamId}:${year}:${lk}`;
  const donors = (args.donors.length > 0 ? args.donors : ["J. Silva"]).map((name) => ({ name }) as RosterPlayer);
  const pseudo = { id: teamId, players: donors } as unknown as Squad;
  const specifics = MAIN_ROLE_TO_SPECIFICS[line];
  const out: RosterPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const lvl = clamp(level + NATIONAL_SQUAD.FILLER_SIGMA * academyGauss(`${seed}:lvl:${i}`), NATIONAL_SQUAD.FILLER_MIN, NATIONAL_SQUAD.FILLER_MAX);
    const specific = specifics[Math.floor(academyUnit(`${seed}:pos:${i}`) * specifics.length)]!;
    const p = makeAcademyPlayer({
      id: `ngen_${key}_${year}_${lk}_${i}`, seed, i, squad: pseudo, specific, level: lvl,
      ageRange: NATIONAL_SQUAD.FILLER_AGE, nationality: nation,
    });
    out.push({ ...p, squadId: "", profile: { summary: "National-team player from the home league.", archetype: "Local" } });
  }
  return out;
}

/** The day's XI (4-3-3, fitness and injury aware) among the national squad. */
export function nationalLineup(players: RosterPlayer[], date: string): string[] {
  const slots = slotsFor(formationForSimId(NATIONAL_SQUAD.FORMATION));
  return autoFillLineupWithFitness(slots, players.map(asNationalPlayer), date);
}

/** Level of a national squad: mean level of its automatic XI (fitness-independent). */
export function squadLevel(players: RosterPlayer[]): number {
  if (players.length === 0) return 0;
  const slots = slotsFor(formationForSimId(NATIONAL_SQUAD.FORMATION));
  const xi = autoFillLineup(slots, players.map(asNationalPlayer));
  const byId = new Map(players.map((p) => [p.id, p]));
  const lv = xi.map((id) => byId.get(id)).filter((p): p is RosterPlayer => !!p).map(overallAvg);
  return lv.length > 0 ? lv.reduce((s, v) => s + v, 0) / lv.length : 0;
}
