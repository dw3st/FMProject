/**
 * AI clubs study the human manager's tactic and prepare against it (`.claude/rules/game/study.md`).
 * Pure: no I/O, no random draw.
 */
import { STUDY } from "@/Domain/study/studyConfig";
import { clamp } from "@/Domain/math";
import { getMainRole } from "@/Domain/roles";
import { slotValue } from "@/Domain/positions/positionAptitude";
import { effectiveStars, starCurve } from "@/Domain/staff/staff";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { effectiveAxes, type TacticalAxes, type TacticalStyle, type TacticsSave } from "@/types/tacticsTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type {
  MatchSetupStudy, PredictabilityLevel, StudyLevel, StudyPlan, TacticLogEntry,
} from "@/types/studyTypes";

// ── Log ───────────────────────────────────────────────────────────────────────

/** The log entry of a game started with `tactics` (the saved plan at the start of the day). */
export function tacticLogEntry(
  tactics: Pick<TacticsSave, "formation" | "tactical_style" | "axesOverride">,
  date: string,
  fixtureId: string,
): TacticLogEntry {
  return {
    date,
    fixtureId,
    formation: tactics.formation,
    style: tactics.tactical_style,
    axes: effectiveAxes(tactics.tactical_style, tactics.axesOverride),
  };
}

/** Adds a game to the log: once per `date` + `fixtureId`, oldest first, last `STUDY.GAMES` kept. */
export function appendTacticLog(log: readonly TacticLogEntry[] | undefined, entry: TacticLogEntry): TacticLogEntry[] {
  const prev = log ?? [];
  if (prev.some((e) => e.date === entry.date && e.fixtureId === entry.fixtureId)) return [...prev];
  return [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-STUDY.GAMES);
}

/** The games the AI reads: the last `STUDY.GAMES`, oldest first. */
function recent(log: readonly TacticLogEntry[] | undefined): TacticLogEntry[] {
  return [...(log ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-STUDY.GAMES);
}

// ── Read ──────────────────────────────────────────────────────────────────────

const axesKey = (a: TacticalAxes) => `${a.pressing_style}|${a.defensive_line}|${a.width}|${a.build_up}`;

/** Most frequent value; a tie goes to the one seen most recently (`values` is oldest first). */
function modeOf<T>(values: T[], keyOf: (v: T) => string): T | undefined {
  const count = new Map<string, number>();
  for (const v of values) count.set(keyOf(v), (count.get(keyOf(v)) ?? 0) + 1);
  let best: T | undefined;
  let bestN = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    const n = count.get(keyOf(values[i]!))!;
    if (n > bestN) { best = values[i]; bestN = n; }
  }
  return best;
}

export interface ExpectedPlan {
  formation: string;
  style: TacticalStyle;
  axes: TacticalAxes;
}

/** The plan the AI expects: the mode of formation, of style and of the four axes together. */
export function expectedPlan(log: readonly TacticLogEntry[] | undefined): ExpectedPlan | null {
  const games = recent(log);
  if (games.length === 0) return null;
  return {
    formation: modeOf(games.map((g) => g.formation), (v) => v)!,
    style: modeOf(games.map((g) => g.style), (v) => v)!,
    axes: modeOf(games.map((g) => g.axes), axesKey)!,
  };
}

/** How much one game matched the expected plan, 0..1. */
export function gameScore(game: TacticLogEntry, expected: ExpectedPlan): number {
  const P = STUDY.PENALTY;
  return Math.max(0, 1
    - (game.formation !== expected.formation ? P.formation : 0)
    - (game.style !== expected.style ? P.style : 0)
    - (axesKey(game.axes) !== axesKey(expected.axes) ? P.axes : 0));
}

/** Raw read 0..1: the sum of the games' scores over `STUDY.GAMES` (a missing game scores 0). */
export function rawRead(log: readonly TacticLogEntry[] | undefined): number {
  const expected = expectedPlan(log);
  if (!expected) return 0;
  return recent(log).reduce((sum, g) => sum + gameScore(g, expected), 0) / STUDY.GAMES;
}

/** Study of an AI club by its financial tier (a hand-built squad without finances: neutral). */
export function clubStudyMult(aiSquad: Squad): number {
  if (!aiSquad.finances) return STUDY.TIER_NEUTRAL;
  return STUDY.TIER[financialTierOf(aiSquad)];
}

/** The human club's performance analyst hides the plan (vacant = 2 stars; a club without staff = its implied stars). */
export function analystStudyMult(humanSquad: Squad): number {
  return starCurve(effectiveStars(humanSquad, "analyst"), STUDY.ANALYST);
}

export function studyLevelOf(read: number): StudyLevel {
  // A hair of tolerance: 3 games of 5 (0.6) times a multiplier of 1 must not fall under the threshold by rounding.
  const r = read + 1e-9;
  return r >= STUDY.HIGH ? "high" : r >= STUDY.MEDIUM ? "medium" : "none";
}

/** The read an AI club has of the manager: raw × club study × analyst, 0..1. */
export function studyRead(log: readonly TacticLogEntry[] | undefined, aiSquad: Squad, humanSquad: Squad): number {
  return clamp(rawRead(log) * clubStudyMult(aiSquad) * analystStudyMult(humanSquad), 0, 1);
}

/** How predictable the manager is to an average opponent (Formation screen): the read without the club tier. */
export function predictability(log: readonly TacticLogEntry[] | undefined, humanSquad: Squad): PredictabilityLevel {
  const level = studyLevelOf(clamp(rawRead(log) * analystStudyMult(humanSquad), 0, 1));
  return level === "none" ? "low" : level;
}

// ── What the AI does ──────────────────────────────────────────────────────────

/** Style the AI plays against the expected style. */
export const counterStyle = (expected: TacticalStyle): TacticalStyle => STUDY.COUNTER[expected];

interface SideXI {
  /** Detailed role per slot (`slotRoles(formation)`). */
  roles: readonly string[];
  /** Roster id per slot ("" = empty). */
  lineup: readonly string[];
  players: readonly RosterPlayer[];
}

const byId = (players: readonly RosterPlayer[]) => new Map(players.map((p) => [p.id, p]));

/** The AI slot that takes the man-marking: the CDM/CM of best tackling; without one, the CB of best tackling. */
export function pickMarkerSlot(ai: SideXI): number | null {
  const roster = byId(ai.players);
  for (const roles of STUDY.MARKER_ROLES) {
    let best: { slot: number; tackling: number } | null = null;
    ai.roles.forEach((role, slot) => {
      if (!(roles as readonly string[]).includes(role)) return;
      const p = roster.get(ai.lineup[slot] ?? "");
      if (!p) return;
      const tackling = p.stats.tackling ?? 0;
      if (!best || tackling > best.tackling) best = { slot, tackling };
    });
    if (best) return (best as { slot: number }).slot;
  }
  return null;
}

/** The manager's player the AI marks: the best rated in a forward slot; without one, the best outfield player. */
export function pickMarkTarget(human: SideXI): { rosterId: string; name: string } | null {
  const roster = byId(human.players);
  const rated = human.roles.flatMap((role, slot) => {
    const p = roster.get(human.lineup[slot] ?? "");
    return p && role !== "GK" ? [{ p, role, value: slotValue(p, role) }] : [];
  });
  const forwards = rated.filter((r) => getMainRole(r.role) === "Forward");
  const pool = forwards.length > 0 ? forwards : rated;
  let best: (typeof pool)[number] | null = null;
  for (const r of pool) if (!best || r.value > best.value) best = r;
  return best ? { rosterId: best.p.id, name: best.p.name } : null;
}

export interface StudyInput {
  /** The manager's log before this game. */
  log: readonly TacticLogEntry[] | undefined;
  aiSquad: Squad;
  humanSquad: Squad;
  ai: Pick<SideXI, "roles" | "lineup">;
  human: Pick<SideXI, "roles" | "lineup">;
}

/** The plan an AI club brings against the human club; null below the `medium` read. */
export function aiStudyPlan(input: StudyInput): StudyPlan | null {
  const expected = expectedPlan(input.log);
  if (!expected) return null;
  const read = studyRead(input.log, input.aiSquad, input.humanSquad);
  const level = studyLevelOf(read);
  if (level === "none") return null;
  const plan: StudyPlan = {
    level,
    read,
    expected: { formation: expected.formation, style: expected.style },
    style: counterStyle(expected.style),
  };
  if (level === "high") {
    const slot = pickMarkerSlot({ ...input.ai, players: input.aiSquad.players });
    const target = pickMarkTarget({ ...input.human, players: input.humanSquad.players });
    if (slot !== null && target) plan.mark = { slot, targetRosterId: target.rosterId, targetName: target.name };
  }
  return plan;
}

/** The part of a plan `match-setup` sends to the manager's screens. */
export function matchSetupStudy(plan: StudyPlan, humanSquad: Squad): MatchSetupStudy {
  return {
    level: plan.level,
    expected: plan.expected,
    style: plan.style,
    ...(plan.mark ? { mark: plan.mark } : {}),
    analystHint: effectiveStars(humanSquad, "analyst") >= STUDY.ANALYST_HINT_STARS,
  };
}
