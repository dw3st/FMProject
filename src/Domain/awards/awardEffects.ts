import { AWARDS } from "@/Domain/awards/awardsConfig";
import type { AwardKind, LeagueAwardKind, LeagueSeasonAwards, ManagerAward, PlayerAward } from "@/types/awardTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { RosterPlayer } from "@/types/playerTypes";

/** Effects of the season awards (`.claude/rules/game/awards.md`), pure. */

const sameAward = (a: PlayerAward, b: PlayerAward) => a.kind === b.kind && a.league === b.league && a.year === b.year;

/**
 * Adds the awards to the player's closing row of `season`/`league` (not partial). Same reference
 * when nothing changes (no such row, or every award already there).
 */
export function withAwardsOnRows(player: RosterPlayer, league: string, season: string, awards: PlayerAward[]): RosterPlayer {
  const rows = player.history ?? [];
  let idx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.season === season && r.league === league && !r.partial) { idx = i; break; }
  }
  if (idx < 0) return player;
  const row = rows[idx]!;
  const cur = row.awards ?? [];
  const add = awards.filter((a, i) => !cur.some((c) => sameAward(c, a)) && awards.findIndex((b) => sameAward(a, b)) === i);
  if (add.length === 0) return player;
  const history = rows.map((r, i) => (i === idx ? { ...r, awards: [...cur, ...add] } : r));
  return { ...player, history };
}

/** Largest market multiplier of the awards (1 = no value bonus). */
export function awardBoostOf(kinds: AwardKind[]): number {
  return Math.max(1, ...kinds.map((k) => AWARDS.VALUE_MULT[k] ?? 1));
}

/** Market-value boost until the next rollover of his league; no award with a value bonus → same player. */
export function applyAwardBoost(player: RosterPlayer, kinds: AwardKind[], league: string, season: string): RosterPlayer {
  const mult = awardBoostOf(kinds);
  if (mult <= 1) return player;
  if (player.awardBoost && player.awardBoost.mult >= mult && player.awardBoost.season === season && player.awardBoost.league === league) return player;
  return { ...player, awardBoost: { season, league, mult: Math.max(mult, player.awardBoost?.mult ?? 1) } };
}

/** Drops the boost (rollover of his league); same player when there is none. */
export function clearAwardBoost(player: RosterPlayer): RosterPlayer {
  if (!player.awardBoost) return player;
  const { awardBoost: _b, ...rest } = player;
  return rest;
}

/** Adds a manager award once per season / kind / competition; same array when nothing changes. */
export function addManagerAward(managers: ManagerRecord[], managerId: string, award: ManagerAward): ManagerRecord[] {
  const i = managers.findIndex((m) => m.id === managerId);
  if (i < 0) return managers;
  const m = managers[i]!;
  const cur = m.awards ?? [];
  if (cur.some((a) => a.season === award.season && a.kind === award.kind && a.competition === award.competition)) return managers;
  return managers.map((x, j) => (j === i ? { ...m, awards: [...cur, award] } : x));
}

/** Player awards of a league season by player id (the manager award is not a player's). */
export function awardKindsByPlayer(a: LeagueSeasonAwards): Map<string, LeagueAwardKind[]> {
  const out = new Map<string, LeagueAwardKind[]>();
  const add = (id: string | undefined, k: LeagueAwardKind) => {
    if (!id) return;
    const cur = out.get(id) ?? [];
    if (!cur.includes(k)) out.set(id, [...cur, k]);
  };
  add(a.bestPlayer?.playerId, "best_player");
  add(a.youngPlayer?.playerId, "young_player");
  add(a.topScorer?.playerId, "top_scorer");
  add(a.bestGoalkeeper?.playerId, "best_goalkeeper");
  for (const p of a.teamOfSeason) add(p.playerId, "team_of_season");
  add(a.goalOfSeason?.playerId, "goal_of_season");
  return out;
}
