import { YOUTH_TRIAL as T } from "@/Domain/youth/trialConfig";
import { YOUTH as Y } from "@/Domain/youth/youthConfig";
import { academyGauss, academyUnit, lineAverage, makeAcademyPlayer } from "@/Domain/youth/youth";
import { MAIN_ROLE_TO_SPECIFICS, overallAvg } from "@/Domain/playerRating";
import { starCurve } from "@/Domain/staff/staff";
import { addDays, daysBetween } from "@/Domain/dates";
import { clamp } from "@/Domain/math";
import { seedFrom } from "@/Domain/rng";
import type { MainRole } from "@/Domain/roles";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { TrialAge, TrialReveal, TrialScheduled, TrialSize, YouthTrialsState } from "@/types/youthTrialTypes";

/** Youth trials (`.claude/rules/game/youth.md` → "Peneira de jovens"). Pure: no I/O. */

export const TRIAL_SIZES: TrialSize[] = ["small", "medium", "large"];

export function trialCost(size: TrialSize, revenue: number): number {
  return Math.max(0, Math.round(Math.max(0, revenue) * T.SIZES[size].share));
}

export interface TrialRequest { age: TrialAge; size: TrialSize; date: string }

export function parseTrialRequest(body: unknown): TrialRequest | null {
  const b = body as { age?: unknown; size?: unknown; date?: unknown } | null;
  if (!b || typeof b !== "object") return null;
  if (!(T.AGES as readonly unknown[]).includes(b.age)) return null;
  if (typeof b.size !== "string" || !(TRIAL_SIZES as string[]).includes(b.size)) return null;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(Date.parse(`${b.date}T00:00:00Z`))) return null;
  return { age: b.age as TrialAge, size: b.size as TrialSize, date: b.date };
}

export const emptyTrials = (): YouthTrialsState => ({ seasons: [] });

export function seasonCount(state: YouthTrialsState | undefined, season: string): number {
  return state?.seasons.find((s) => s.season === season)?.count ?? 0;
}

export type TrialRequestError = "invalidTrial" | "trialPending" | "trialLimit";

export function checkTrialRequest(
  req: TrialRequest, ctx: { today: string; state: YouthTrialsState | undefined; season: string },
): TrialRequestError | null {
  const days = daysBetween(ctx.today, req.date);
  if (days < T.MIN_DAYS || days > T.MAX_DAYS) return "invalidTrial";
  if (ctx.state?.scheduled) return "trialPending";
  if (seasonCount(ctx.state, ctx.season) >= T.PER_SEASON) return "trialLimit";
  return null;
}

/** The state with a new trial scheduled (counted for the season). */
export function withScheduled(state: YouthTrialsState | undefined, trial: TrialScheduled, season: string): YouthTrialsState {
  const base = state ?? emptyTrials();
  const seasons = base.seasons.filter((s) => s.season !== season);
  return { ...base, scheduled: trial, seasons: [...seasons, { season, count: seasonCount(base, season) + 1 }].slice(-6) };
}

export function trialWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, T.MIN_DAYS), to: addDays(today, T.MAX_DAYS) };
}

export const fameMult = (reveals: number | undefined): number => Math.min(T.FAME_MAX, 1 + T.FAME_STEP * Math.max(0, reveals ?? 0));
export const coachGemMult = (stars: number | undefined): number => starCurve(stars ?? 2, T.COACH_GEM);
export const trialKnowledge = (stars: number | undefined): number => Math.round(starCurve(stars ?? 2, T.KNOWLEDGE));
export const trialCount = (size: TrialSize, fame: number): number => Math.round(T.SIZES[size].count * fame);

const ROLE_WEIGHT: [MainRole, number][] = [["GK", 1], ["Defender", 4], ["Midfielder", 4], ["Forward", 3]];

function pickRole(key: string): MainRole {
  let x = academyUnit(key) * 12;
  for (const [r, w] of ROLE_WEIGHT) if ((x -= w) < 0) return r;
  return "Midfielder";
}

/** The youngsters seen at a trial (real attributes). Deterministic by save, seat and day. */
export function generateTrialPlayers(args: {
  saveId: string; seatId: string; trial: Pick<TrialScheduled, "date" | "age" | "size">;
  squad: Squad; coachStars: number | undefined; fame: number;
}): RosterPlayer[] {
  const { saveId, seatId, trial, squad, coachStars, fame } = args;
  const seed = `${saveId}:${seatId}:${trial.date}:trial`;
  const hash = (seedFrom(seed) >>> 0).toString(36);
  const n = trialCount(trial.size, fame);
  const gemChance = T.GEM_CHANCE * coachGemMult(coachStars) * fame;
  const taken = new Set([...squad.players, ...(squad.youth ?? [])].map((p) => p.name));
  const out: RosterPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const role = pickRole(`${seed}:role:${i}`);
    const specifics = MAIN_ROLE_TO_SPECIFICS[role];
    const specific = specifics[Math.floor(academyUnit(`${seed}:pos:${i}`) * specifics.length)]!;
    const gem = academyUnit(`${seed}:gem:${i}`) < gemChance;
    const level = clamp(
      lineAverage(squad, role) - T.LEVEL_OFFSET + T.LEVEL_SIGMA * academyGauss(`${seed}:lvl:${i}`) + (gem ? T.GEM_BONUS : 0),
      Y.LEVEL_MIN, gem ? Y.PROMISE_CAP : Y.LEVEL_CAP,
    );
    out.push(makeAcademyPlayer({
      id: `trial_${seatId}_${hash}_${i}`, seed, i, squad, specific, level, promise: gem, taken,
      ageRange: [trial.age, trial.age], nationality: squad.country ?? null,
    }));
  }
  return out;
}

/** Whether a trial youngster has made it, and how. */
export function revealOf(
  player: RosterPlayer,
  ctx: { worldTop: ReadonlySet<string>; inFirstTeamOf: string | null },
): TrialReveal | null {
  const origin = player.trialOf;
  if (!origin || player.trialRevealed) return null;
  if (ctx.worldTop.has(player.id)) return "world_top";
  const a = player.arrival;
  if (a && (a.kind === "transfer" || a.kind === "clause") && (a.fee ?? 0) >= T.REVEAL.SOLD_FEE && a.squadId !== origin.clubId) return "sold";
  if (ctx.inFirstTeamOf === origin.clubId && overallAvg(player) >= T.REVEAL.FIRST_TEAM_OVERALL) return "first_team";
  return null;
}

/** Reputation points of the manager's reveals (world-top ones weigh more). */
export function trialReputation(reveals: { count: number; top: number } | undefined): number {
  if (!reveals) return 0;
  return Math.min(T.REWARD.REP_MAX, reveals.count + T.REWARD.REP_TOP * reveals.top);
}
