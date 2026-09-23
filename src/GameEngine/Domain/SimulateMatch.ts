/**
 * SimulateMatch — headless match simulation (non-player mode).
 *
 * Runs the same tickState engine in a tight while-loop with no rendering,
 * no real-time clock, and no presentation pauses. Produces the same stats
 * and ratings as a live match.
 *
 * Usage:
 *   const result = simulateMatch(squadA, squadB);
 *   // result.score, result.teamStats, result.playerStats, result.playerRatings
 */

import type { GameState, GamePlayer, Formation } from '@/GameEngine/types';
import { tickState, createMatchState } from '@/GameEngine/Domain/gameState';
import { initStats, getAllPlayerStats, getTeamStats } from '@/GameEngine/Domain/Statistics';
import { initRatings, getAllRatings } from '@/GameEngine/Domain/PlayerRating';
import { evaluateAiSubstitutions, shouldCheckAiSubs } from '@/GameEngine/Domain/AiSubstitution';
import type { PlayerStats as MatchPlayerStats, TeamStats } from '@/GameEngine/Domain/Statistics';
import type { Squad } from '@/types/playerTypes';

// Re-export Squad for consumers
export type { Squad } from '@/types/playerTypes';

// Side-effect imports activate event-bus subscriptions
import '@/GameEngine/Domain/Statistics';
import '@/GameEngine/Domain/PlayerRating';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchResult {
  score:         { A: number; B: number };
  teamStats:     { A: TeamStats; B: TeamStats };
  playerStats:   Map<number, MatchPlayerStats>;
  playerRatings: Record<number, number>;
  /** Full player list — useful for mapping IDs to names */
  players:       GamePlayer[];
  /** All substitutions made by either team during the match. */
  substitutions: import('@/GameEngine/types').SubstitutionRecord[];
  durationMs:    number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default simulation step in real-seconds (matches live game tick rate). */
const SIM_DT = 0.2;

/** Safety cap to prevent infinite loops in degenerate states. */
const MAX_TICKS = 2_000_000;

/** Default 4-3-3 formation used for both teams when none is specified. */
const DEFAULT_FORMATION: Formation = {
  id: '4-3-3',
  attacking: [
    { role: 'GK',  x: 10, y: 37 },
    { role: 'LB',  x: 36, y: 11 },
    { role: 'CB',  x: 38, y: 28 },
    { role: 'CB',  x: 38, y: 46 },
    { role: 'RB',  x: 36, y: 63 },
    { role: 'CM',  x: 72, y: 24 },
    { role: 'CM',  x: 72, y: 50 },
    { role: 'CAM', x: 78, y: 37 },
    { role: 'LW',  x: 95, y: 8  },
    { role: 'ST',  x: 98, y: 37 },
    { role: 'RW',  x: 95, y: 66 },
  ],
  defending: [
    { role: 'GK',  x: 5,  y: 37 },
    { role: 'LB',  x: 13, y: 11 },
    { role: 'CB',  x: 14, y: 28 },
    { role: 'CB',  x: 14, y: 46 },
    { role: 'RB',  x: 13, y: 63 },
    { role: 'CM',  x: 38, y: 24 },
    { role: 'CM',  x: 38, y: 50 },
    { role: 'CAM', x: 36, y: 37 },
    { role: 'LW',  x: 50, y: 8  },
    { role: 'ST',  x: 60, y: 37 },
    { role: 'RW',  x: 50, y: 66 },
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a complete headless match simulation between two squads.
 * Blocks synchronously — completes in ~5–30 ms.
 *
 * @param formationA  Formation for Team A (defaults to 4-3-3 if omitted).
 * @param formationB  Formation for Team B (defaults to 4-3-3 if omitted).
 * @param lineupA     Optional player IDs in slot order for Team A (home in league sims).
 * @param lineupB     Optional player IDs in slot order for Team B (away in league sims).
 *
 * Note: uses the shared Statistics and PlayerRating modules, so results
 * will overwrite any in-progress live match data.
 */
export function simulateMatch(
  squadA: Squad,
  squadB: Squad,
  formationA: Formation = DEFAULT_FORMATION,
  formationB: Formation = DEFAULT_FORMATION,
  lineupA?: string[],
  lineupB?: string[],
): MatchResult {
  const startMs = performance.now();

  // Build state — skip preMatch presentation so the loop starts in firstHalf
  let s: GameState = {
    ...createMatchState(squadA.players, formationA, squadB.players, formationB, lineupA, lineupB),
    matchPhase:            'firstHalf',
    presentationCountdown: 0,
  };

  // Reset shared accumulators so live-game stats don't bleed in
  initStats(s.players.map(p => ({ id: p.id, team: p.team })));
  initRatings(s.players.map(p => p.id));

  let ticks = 0;
  while (s.matchPhase !== 'matchEnd' && ticks < MAX_TICKS) {
    // Fast-forward any presentation freeze (half-time) without waiting
    if (s.presentationCountdown > 0) {
      s = { ...s, presentationCountdown: 0 };
    }
    // In headless simulation both teams are AI-controlled — evaluate subs for Team A too
    if (s.matchPhase === 'secondHalf' && shouldCheckAiSubs(s.matchTime, SIM_DT * (2700 / 150))) {
      const subsA = evaluateAiSubstitutions(s, 'A');
      if (subsA.length > 0) s = { ...s, pendingSubsA: [...s.pendingSubsA, ...subsA] };
    }
    s = tickState(s, SIM_DT).state;
    ticks++;
  }

  return {
    score:         s.score,
    teamStats:     { A: getTeamStats('A'), B: getTeamStats('B') },
    playerStats:   getAllPlayerStats(),
    playerRatings: getAllRatings(),
    players:       s.players,
    substitutions: s.substitutions,
    durationMs:    performance.now() - startMs,
  };
}
