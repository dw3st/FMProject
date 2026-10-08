import { GOAL_Y_MAX, GOAL_Y_MIN, PENALTY_AREA_DEPTH, PENALTY_AREA_Y_MAX, PENALTY_AREA_Y_MIN } from "@/GameEngine/Domain/pitch";
import type { MatchGoal } from "@/types/dayLogTypes";
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
