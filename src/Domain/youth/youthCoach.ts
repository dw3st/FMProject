/**
 * The youth coach in charge of the academy (`.claude/rules/game/staff.md` → "Treinador da base (12.1)"): with the
 * responsibility `youth: "coach"` and a youth coach at work, he calls first-team youngsters short of minutes up for
 * the youth games and sets the academy's training plan. Pure: the day advance applies what these return. He only
 * ever writes entries marked `byCoach`; what the manager set by hand is never touched.
 */
import { isUnavailable } from "@/Domain/discipline/discipline";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { overallAvg } from "@/Domain/playerRating";
import { headOf } from "@/Domain/staff/staff";
import { DEFAULT_YOUTH_PLAN } from "@/Domain/youth/youthTraining";
import { callUpAgeOk, newCallUp, type YouthCallUp } from "@/Domain/youthComps/callUps";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { CATEGORY_STATS, DP_CATEGORIES, type DPCategory } from "@/GameEngine/PlayerDevelopment";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import type { YouthCompAge } from "@/types/youthCompTypes";
import type { YouthTrainingPlan } from "@/types/youthTrainingTypes";

export const YOUTH_COACH = {
  /** Call-ups the coach keeps per age at most. */
  MAX_CALL_UPS: 6,
  /** A youngster he calls up needs at least this fitness. */
  MIN_FITNESS: 70,
  /**
   * "Short of minutes": fewer appearances this season than this share of the squad's most used player's
   * (everybody while nobody has played yet).
   */
  MINUTES_SHARE: 0.5,
  /** Academy mean fitness from which the group trains heavy / normal (below: light). */
  HEAVY_FITNESS: 80,
  NORMAL_FITNESS: 65,
  /** A training area matters for a position from this DP weight on. */
  AREA_WEIGHT: 0.15,
} as const;

/** A youth coach hired and at work (one away on a course does not count). */
export function youthCoachOnDuty(squad: Squad): boolean {
  return !!squad.staff && headOf(squad, "youthCoach") !== undefined;
}

const appsOf = (p: RosterPlayer): number => p.seasonLog?.appearances ?? 0;
const fitnessOf = (p: RosterPlayer): number => p.seasonLog?.fitness ?? emptySeasonLog().fitness;

/**
 * The call-ups of one age on a day the club has a game of it: the manager's entries as they are, then the coach's
 * (`next`, `byCoach`), rebuilt from scratch every game day. He calls first-team squad players of the age who are
 * not in the first-team XI, are available, fit (`MIN_FITNESS`) and short of minutes (`MINUTES_SHARE`), fewest
 * appearances first (then the better player, then the id): at most `MAX_CALL_UPS`, never past
 * `YOUTH_COMP.MAX_CALL_UPS` for the age, never a player already on the list or in `exclude` (called up for the
 * other age's game today).
 */
export function coachCallUps(args: {
  squad: Squad;
  age: YouthCompAge;
  current: readonly YouthCallUp[] | undefined;
  firstTeamXI: ReadonlySet<string>;
  date: string;
  exclude?: ReadonlySet<string>;
}): YouthCallUp[] {
  const { squad, age, firstTeamXI, date, exclude } = args;
  const kept = (args.current ?? []).filter((c) => !c.byCoach);
  const taken = new Set(kept.map((c) => c.id));
  const maxApps = Math.max(0, ...squad.players.map(appsOf));
  const room = Math.min(YOUTH_COACH.MAX_CALL_UPS, YOUTH_COMP.MAX_CALL_UPS - kept.length);
  if (room <= 0) return kept;
  const picks = squad.players
    .filter((p) => p.age <= YOUTH_COMP.MAX_AGE[age] && callUpAgeOk(age, p.age))
    .filter((p) => !taken.has(p.id) && !exclude?.has(p.id) && !firstTeamXI.has(p.id))
    .filter((p) => !isUnavailable(p, date) && fitnessOf(p) >= YOUTH_COACH.MIN_FITNESS)
    .filter((p) => maxApps <= 0 || appsOf(p) < YOUTH_COACH.MINUTES_SHARE * maxApps)
    .sort((a, b) => appsOf(a) - appsOf(b) || overallAvg(b) - overallAvg(a) || (a.id < b.id ? -1 : 1))
    .slice(0, room);
  return [...kept, ...picks.map((p) => ({ ...newCallUp(p.id, "next"), byCoach: true as const }))];
}

/** Group intensity by the academy's mean fitness (an empty academy: normal). */
export function coachIntensity(youth: readonly RosterPlayer[]): TrainingIntensity {
  if (youth.length === 0) return "normal";
  const mean = youth.reduce((s, p) => s + fitnessOf(p), 0) / youth.length;
  return mean >= YOUTH_COACH.HEAVY_FITNESS ? "heavy" : mean >= YOUTH_COACH.NORMAL_FITNESS ? "normal" : "light";
}

/**
 * The area the coach has a youngster work on: among the areas that matter for his natural position (DP weight
 * of at least `AREA_WEIGHT`), the one with the lowest mean of its attributes (ties: the heavier weight, then the
 * order of `DP_CATEGORIES`). No area that heavy (never with the real roles): the heaviest one.
 */
export function coachFocus(player: RosterPlayer): DPCategory {
  const weights = dpWeightsFor(player);
  const meanOf = (c: DPCategory): number => {
    const stats = CATEGORY_STATS[c];
    return stats.reduce((s, k) => s + (player.stats[k] ?? 0), 0) / stats.length;
  };
  const byWeight = [...DP_CATEGORIES].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
  const relevant = byWeight.filter((c) => (weights[c] ?? 0) >= YOUTH_COACH.AREA_WEIGHT);
  const pool = relevant.length > 0 ? relevant : byWeight.slice(0, 1);
  // `pool` is already in weight order (the sort is stable over `DP_CATEGORIES`): the first lowest mean wins.
  let best = pool[0]!;
  for (const c of pool) if (meanOf(c) < meanOf(best)) best = c;
  return best;
}

/**
 * The Monday plan: the group intensity (only when the manager never set one: no plan yet, or the coach's own) and
 * a focus per academy player (only where the manager has no entry, or the entry is the coach's). Entries of the
 * coach for players who left the academy go. Returns the same object when nothing changes.
 */
export function coachTrainingPlan(squad: Squad): YouthTrainingPlan {
  const current = squad.youthTraining;
  const youth = squad.youth ?? [];
  const base: YouthTrainingPlan = current ?? DEFAULT_YOUTH_PLAN;
  const next: YouthTrainingPlan = { intensity: base.intensity, focus: base.focus };
  if (!current || current.intensityByCoach) {
    next.intensity = coachIntensity(youth);
    next.intensityByCoach = true;
  }
  const inAcademy = new Set(youth.map((p) => p.id));
  const players: NonNullable<YouthTrainingPlan["players"]> = {};
  for (const [id, entry] of Object.entries(base.players ?? {})) {
    if (!entry.byCoach || inAcademy.has(id)) players[id] = entry;
  }
  for (const p of youth) {
    const own = players[p.id];
    if (own && !own.byCoach) continue;
    players[p.id] = { focus: coachFocus(p), byCoach: true };
  }
  if (Object.keys(players).length > 0) next.players = players;
  return current && samePlan(current, next) ? current : next;
}

function sameEntry(a: NonNullable<YouthTrainingPlan["players"]>[string] | undefined, b: typeof a): boolean {
  return (a?.focus ?? null) === (b?.focus ?? null) && (a?.position ?? null) === (b?.position ?? null);
}

function samePlan(a: YouthTrainingPlan, b: YouthTrainingPlan): boolean {
  if (a.intensity !== b.intensity || a.focus !== b.focus || !!a.intensityByCoach !== !!b.intensityByCoach) return false;
  const ids = new Set([...Object.keys(a.players ?? {}), ...Object.keys(b.players ?? {})]);
  for (const id of ids) {
    const x = a.players?.[id];
    const y = b.players?.[id];
    if (!x || !y || !sameEntry(x, y) || !!x.byCoach !== !!y.byCoach) return false;
  }
  return true;
}

/**
 * The plan the manager saves (`sent`, already validated, without marks) over the stored one: what he left as the
 * coach wrote it keeps the coach's mark, what he changed is his from now on.
 */
export function managerSavesPlan(stored: YouthTrainingPlan | undefined, sent: YouthTrainingPlan): YouthTrainingPlan {
  const out: YouthTrainingPlan = { intensity: sent.intensity, focus: sent.focus };
  if (stored?.intensityByCoach && stored.intensity === sent.intensity) out.intensityByCoach = true;
  if (sent.players) {
    const players: NonNullable<YouthTrainingPlan["players"]> = {};
    for (const [id, entry] of Object.entries(sent.players)) {
      const { byCoach: _mark, ...mine } = entry;
      const before = stored?.players?.[id];
      players[id] = before?.byCoach && sameEntry(before, mine) ? { ...mine, byCoach: true } : mine;
    }
    out.players = players;
  }
  return out;
}
