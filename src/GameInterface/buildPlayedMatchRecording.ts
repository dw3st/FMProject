import type { GameState } from "@/GameEngine/types";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import { toMatchTeamStats } from "@/Domain/advanceDay/matchTeamStats";
import { getGoalLog, getTeamStats, getPlayerStats } from "@/GameEngine/Domain/Statistics";
import { goalGeometry } from "@/Domain/awards/goalOfSeason";
import { getPlayerRating } from "@/GameEngine/Domain/PlayerRating";
import { knockoutDecider } from "@/GameEngine/Domain/gameState";

/**
 * For any `playerStats` entry with no valid (finite) recorded energy, fall back to that player's
 * own start-of-match fitness (`startFitness`) rather than a fixed number — `postMatchFitness` on
 * that value is then a no-op ("no change"), instead of forcibly resetting an unrelated player's
 * fitness to a fixed 50 whenever this (should-never-happen) defensive path fires.
 */
export function fillMissingEnergy(
  playerStats: Record<string, unknown>,
  playerEnergy: Record<string, number>,
  startFitness: Map<string, number>,
): void {
  for (const rid of Object.keys(playerStats)) {
    if (typeof playerEnergy[rid] !== "number" || !Number.isFinite(playerEnergy[rid])) {
      playerEnergy[rid] = startFitness.get(rid) ?? emptySeasonLog().fitness;
    }
  }
}

/**
 * Snapshot live pitch stats into the shape advance-day expects so the league save
 * matches what the player saw — no second headless simulation.
 */
export function buildPlayedMatchRecording(
  gameState: GameState,
  fixture: Fixture,
  mySquadId: string,
  homeSquad: Squad,
  awaySquad: Squad,
): PlayedMatchRecording {
  const myIsHome = fixture.home === mySquadId;
  const th = getTeamStats("A");
  const ta = getTeamStats("B");
  const homeEngineStats = myIsHome ? th : ta;
  const awayEngineStats = myIsHome ? ta : th;

  const s = gameState.score ?? { A: 0, B: 0 };
  const score = {
    home: myIsHome ? s.A : s.B,
    away: myIsHome ? s.B : s.A,
  };

  const nameToRoster = new Map<string, string>();
  const startFitness = new Map<string, number>();
  for (const p of [...homeSquad.players, ...awaySquad.players]) {
    nameToRoster.set(p.name, p.id);
    startFitness.set(p.id, p.seasonLog?.fitness ?? emptySeasonLog().fitness);
  }

  const playerStats: PlayedMatchRecording["playerStats"] = {};
  const playerRatings: Record<string, number> = {};
  const playerEnergy: Record<string, number> = {};

  // Players still on the pitch at full time
  for (const gp of gameState.players) {
    const rid = nameToRoster.get(gp.name);
    if (!rid) continue;
    playerEnergy[rid] = Math.max(0, Math.min(100, gp.energy));
    const ps = getPlayerStats(gp.id);
    playerStats[rid] = {
      passesAttempted: ps.passesAttempted,
      passesCompleted: ps.passesCompleted,
      passesFailed: ps.passesFailed,
      shots: ps.shots,
      goals: ps.goals,
      assists: ps.assists,
      interceptions: ps.interceptions,
      tackles: ps.tackles,
    };
    playerRatings[rid] = getPlayerRating(gp.id);
  }

  // Players who were substituted off — each kept their own engine id in the stats store
  for (const sub of gameState.substitutions ?? []) {
    const rid = sub.playerOutRosterId;
    if (!rid || playerStats[rid]) continue;
    playerEnergy[rid] = Math.max(0, Math.min(100, sub.playerOutEnergy));
    const ps = getPlayerStats(sub.playerOutId);
    playerStats[rid] = {
      passesAttempted: ps.passesAttempted,
      passesCompleted: ps.passesCompleted,
      passesFailed: ps.passesFailed,
      shots: ps.shots,
      goals: ps.goals,
      assists: ps.assists,
      interceptions: ps.interceptions,
      tackles: ps.tackles,
    };
    playerRatings[rid] = getPlayerRating(sub.playerOutId);
  }

  // Players injured and removed outright (no bench candidate / no subs left) — they never appear
  // on the pitch at full time, nor in `substitutions` (that log only covers replaced players), so
  // without this their accumulated stats/rating (still held in the Statistics/PlayerRating stores
  // by engine id — never purged just because a player left the pitch) would silently be dropped.
  for (const inj of gameState.injuries ?? []) {
    const rid = inj.playerRosterId;
    if (!rid || playerStats[rid]) continue;
    playerEnergy[rid] = Math.max(0, Math.min(100, inj.energy));
    const ps = getPlayerStats(inj.playerId);
    playerStats[rid] = {
      passesAttempted: ps.passesAttempted,
      passesCompleted: ps.passesCompleted,
      passesFailed: ps.passesFailed,
      shots: ps.shots,
      goals: ps.goals,
      assists: ps.assists,
      interceptions: ps.interceptions,
      tackles: ps.tackles,
    };
    playerRatings[rid] = getPlayerRating(inj.playerId);
  }

  // Players sent off (removed outright, no substitute) — same reasoning as the injured above.
  for (const c of gameState.cards ?? []) {
    const rid = c.playerRosterId;
    if (c.card !== "red" || !rid || playerStats[rid]) continue;
    playerEnergy[rid] = Math.max(0, Math.min(100, c.energy));
    const ps = getPlayerStats(c.playerId);
    playerStats[rid] = {
      passesAttempted: ps.passesAttempted,
      passesCompleted: ps.passesCompleted,
      passesFailed: ps.passesFailed,
      shots: ps.shots,
      goals: ps.goals,
      assists: ps.assists,
      interceptions: ps.interceptions,
      tackles: ps.tackles,
    };
    playerRatings[rid] = getPlayerRating(c.playerId);
  }

  // Defensive: ensure every playerStats key has a corresponding playerEnergy entry
  // so the server-side validation never silently falls back to headless simulation.
  fillMissingEnergy(playerStats, playerEnergy, startFitness);

  const durationMs = Math.max(0, Math.round((gameState.matchTime ?? 0) * 1000));

  // Map engine SubstitutionRecord to roster IDs for persistence
  const substitutions: import("@/types/dayLogTypes").MatchSubstitution[] = (gameState.substitutions ?? []).map((sub) => ({
    team: sub.team === "A"
      ? (myIsHome ? "home" : "away")
      : (myIsHome ? "away" : "home"),
    playerOutId:   sub.playerOutRosterId,
    playerOutName: sub.playerOutName,
    playerInId:    sub.playerInRosterId,
    playerInName:  sub.playerInName,
    matchMinute:   sub.matchMinute,
  }));

  const injuries: import("@/types/dayLogTypes").MatchInjury[] = (gameState.injuries ?? []).map((inj) => ({
    team:        inj.team === "A" ? (myIsHome ? "home" : "away") : (myIsHome ? "away" : "home"),
    playerId:    inj.playerRosterId,
    playerName:  inj.playerName,
    severity:    inj.severity,
    matchMinute: inj.matchMinute,
    energy:      inj.energy,
  }));

  const cards: import("@/types/dayLogTypes").MatchCard[] = (gameState.cards ?? []).map((c) => ({
    team:         c.team === "A" ? (myIsHome ? "home" : "away") : (myIsHome ? "away" : "home"),
    playerId:     c.playerRosterId,
    playerName:   c.playerName,
    card:         c.card,
    secondYellow: c.secondYellow,
    matchMinute:  c.matchMinute,
  }));

  // Goals with minute and shot position (season awards), engine ids → roster ids (same map as the stats).
  const engineToRoster = new Map<number, string>();
  for (const gp of gameState.players) {
    const rid = nameToRoster.get(gp.name);
    if (rid) engineToRoster.set(gp.id, rid);
  }
  for (const sub of gameState.substitutions ?? []) if (!engineToRoster.has(sub.playerOutId)) engineToRoster.set(sub.playerOutId, sub.playerOutRosterId);
  for (const inj of gameState.injuries ?? []) if (!engineToRoster.has(inj.playerId)) engineToRoster.set(inj.playerId, inj.playerRosterId);
  for (const c of gameState.cards ?? []) if (!engineToRoster.has(c.playerId)) engineToRoster.set(c.playerId, c.playerRosterId);
  const goals: import("@/types/dayLogTypes").MatchGoal[] = getGoalLog().flatMap((g) => {
    const playerId = engineToRoster.get(g.scorerId);
    if (!playerId) return [];
    const assistId = g.assistId != null ? engineToRoster.get(g.assistId) : undefined;
    return [{
      playerId,
      team: g.team === "A" ? (myIsHome ? "home" as const : "away" as const) : (myIsHome ? "away" as const : "home" as const),
      minute: g.minute + 1,
      header: g.header,
      ...(g.setPiece ? { setPiece: g.setPiece } : {}),
      ...goalGeometry(g),
      ...(assistId ? { assistId } : {}),
    }];
  });

  const kd = knockoutDecider(gameState);
  const side = <T extends { A: number; B: number }>(v: T) =>
    ({ home: myIsHome ? v.A : v.B, away: myIsHome ? v.B : v.A });
  const decider = kd
    ? { extraTime: side(kd.extraTime), ...(kd.penalties ? { penalties: side(kd.penalties) } : {}) }
    : undefined;

  return {
    fixtureId: fixture.id,
    score,
    teamStats: {
      home: toMatchTeamStats(homeEngineStats),
      away: toMatchTeamStats(awayEngineStats),
    },
    playerStats,
    playerRatings,
    playerEnergy,
    substitutions,
    injuries,
    ...(cards.length > 0 ? { cards } : {}),
    goals,
    durationMs,
    ...(decider ? { decider } : {}),
  };
}
