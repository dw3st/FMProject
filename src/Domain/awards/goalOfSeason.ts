import { AWARDS } from "@/Domain/awards/awardsConfig";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { GOAL_Y_MAX, GOAL_Y_MIN, PENALTY_AREA_DEPTH, PENALTY_AREA_Y_MAX, PENALTY_AREA_Y_MIN } from "@/GameEngine/Domain/pitch";
import type { GoalOfSeasonCandidate } from "@/types/awardTypes";
import type { MatchEvent, MatchGoal } from "@/types/dayLogTypes";
import type { Squad } from "@/types/playerTypes";

/** Goal of the season (`.claude/rules/game/awards.md`): goal geometry and the candidates. */

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Distance from the shot point to the goal centre (1 decimal) and whether it was outside the box. */
export function goalGeometry(s: { fromX: number; fromY: number; goalX: number }): { distance: number; outsideBox: boolean } {
  const cy = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
  return {
    distance: r1(Math.hypot(s.goalX - s.fromX, cy - s.fromY)),
    outsideBox: Math.abs(s.goalX - s.fromX) > PENALTY_AREA_DEPTH || s.fromY < PENALTY_AREA_Y_MIN || s.fromY > PENALTY_AREA_Y_MAX,
  };
}

const SET_PIECES = new Set(["corner", "free_kick", "direct_free_kick", "penalty"]);
const MAX_MINUTE = 130;
const MAX_DISTANCE = 130;

/**
 * Validates the goal list of a live match sent by the client. Any inconsistency (goals per side ≠
 * the score, a scorer outside his side's squad, a bad number or field) drops the whole list.
 */
export function sanitizeRecordedGoals(
  goals: unknown,
  score: { home: number; away: number },
  home: Pick<Squad, "players">,
  away: Pick<Squad, "players">,
): MatchGoal[] | undefined {
  if (!Array.isArray(goals)) return undefined;
  const ids = { home: new Set(home.players.map((p) => p.id)), away: new Set(away.players.map((p) => p.id)) };
  const allIds = new Set([...ids.home, ...ids.away]);
  const out: MatchGoal[] = [];
  const count = { home: 0, away: 0 };
  for (const raw of goals) {
    if (!raw || typeof raw !== "object") return undefined;
    const g = raw as Record<string, unknown>;
    if (g.team !== "home" && g.team !== "away") return undefined;
    if (typeof g.playerId !== "string" || !ids[g.team].has(g.playerId)) return undefined;
    if (typeof g.minute !== "number" || !Number.isInteger(g.minute) || g.minute < 0 || g.minute > MAX_MINUTE) return undefined;
    if (typeof g.distance !== "number" || !Number.isFinite(g.distance) || g.distance < 0 || g.distance > MAX_DISTANCE) return undefined;
    if (typeof g.header !== "boolean" || typeof g.outsideBox !== "boolean") return undefined;
    if (g.setPiece !== undefined && (typeof g.setPiece !== "string" || !SET_PIECES.has(g.setPiece))) return undefined;
    if (g.assistId !== undefined && (typeof g.assistId !== "string" || !allIds.has(g.assistId))) return undefined;
    count[g.team]++;
    out.push({
      playerId: g.playerId, team: g.team, minute: g.minute, header: g.header, distance: g.distance, outsideBox: g.outsideBox,
      ...(g.assistId !== undefined ? { assistId: g.assistId as string } : {}),
      ...(g.setPiece !== undefined ? { setPiece: g.setPiece as MatchGoal["setPiece"] } : {}),
    });
  }
  if (count.home !== score.home || count.away !== score.away) return undefined;
  return out;
}

/** A goal of the season candidate: a header or a shot from outside the box, never a penalty. */
export function isGoalCandidate(g: Pick<MatchGoal, "header" | "outsideBox" | "setPiece">): boolean {
  return g.setPiece !== "penalty" && (g.header || g.outsideBox);
}

/** Draw weight: a header 1, a shot from outside the box 1 + (distance − 18) / 10, capped. */
export function goalWeight(g: Pick<GoalOfSeasonCandidate, "header" | "distance">): number {
  return g.header ? 1 : Math.min(AWARDS.GOAL_WEIGHT_CAP, 1 + Math.max(0, g.distance - 18) / 10);
}

/**
 * Deterministic weighted draw (`goal:{seedKey}`, seedKey = `save:league:season`) over the candidates
 * sorted by key (the file order never decides). No candidate → no award.
 */
export function pickGoalOfSeason(goals: GoalOfSeasonCandidate[], seedKey: string): GoalOfSeasonCandidate | undefined {
  if (goals.length === 0) return undefined;
  const sorted = [...goals].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const total = sorted.reduce((s, g) => s + goalWeight(g), 0);
  let r = mulberry32(seedFrom(`goal:${seedKey}`))() * total;
  for (const g of sorted) {
    r -= goalWeight(g);
    if (r < 0) return g;
  }
  return sorted[sorted.length - 1];
}

/** Appends without repeating a key (a retried day). */
export function appendGoals(cur: GoalOfSeasonCandidate[], add: GoalOfSeasonCandidate[]): GoalOfSeasonCandidate[] {
  const seen = new Set(cur.map((g) => g.key));
  const out = [...cur];
  for (const g of add) {
    if (seen.has(g.key)) continue;
    seen.add(g.key);
    out.push(g);
  }
  return out;
}

/** The goal of the season candidates of a full-engine match (`key = fixtureId:minute:playerId`). */
export function goalCandidatesOfMatch(
  event: Pick<MatchEvent, "fixtureId" | "home" | "away" | "goals" | "playerNames">,
  date: string,
  nameOf: (playerId: string) => string | undefined = () => undefined,
): GoalOfSeasonCandidate[] {
  return (event.goals ?? []).filter(isGoalCandidate).map((g) => ({
    key: `${event.fixtureId}:${g.minute}:${g.playerId}`,
    fixtureId: event.fixtureId,
    date,
    playerId: g.playerId,
    playerName: event.playerNames[g.playerId] ?? nameOf(g.playerId) ?? g.playerId,
    squadId: g.team === "home" ? event.home : event.away,
    opponentId: g.team === "home" ? event.away : event.home,
    minute: g.minute,
    header: g.header,
    distance: g.distance,
    ...(g.setPiece && g.setPiece !== "penalty" ? { setPiece: g.setPiece } : {}),
  }));
}
