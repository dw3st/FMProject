import type { GameState } from "@/GameEngine/types";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import { getTeamStats, getPlayerStats } from "@/GameEngine/Domain/Statistics";
import type { TeamStats } from "@/GameEngine/Domain/Statistics";
import { getPlayerRating } from "@/GameEngine/Domain/PlayerRating";
import type { MatchTeamStats } from "@/types/dayLogTypes";

function toMatchTeamStats(t: TeamStats): MatchTeamStats {
  return {
    shots: t.shots,
    passesCompleted: t.passesCompleted,
    passesAttempted: t.passesAttempted,
    tackles: t.tackles,
    interceptions: t.interceptions,
  };
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
  for (const p of [...homeSquad.players, ...awaySquad.players]) {
    nameToRoster.set(p.name, p.id);
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

  // Defensive: ensure every playerStats key has a corresponding playerEnergy entry
  // so the server-side validation never silently falls back to headless simulation.
  for (const rid of Object.keys(playerStats)) {
    if (typeof playerEnergy[rid] !== "number" || !Number.isFinite(playerEnergy[rid])) {
      playerEnergy[rid] = 50;
    }
  }

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
    durationMs,
  };
}
