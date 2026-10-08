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

import { setTeamTemperamentOverride } from '@/GameEngine/Configs/PersonalityMatchConfig';
import { setTeamMoraleOverride } from '@/GameEngine/Configs/MoraleConfig';
import { applyTeamTacticsConfig } from '@/GameEngine/Configs/DefenseConfig';
import { applyTeamAttackConfig } from '@/GameEngine/Configs/AttackConfig';
import { DEFAULT_MENTALITY, type TacticalStyle, type TacticalAxes, type SlotInstruction } from '@/types/tacticsTypes';
import type { FamiliarityLevels } from '@/types/familiarityTypes';
import { setTeamExecution } from '@/GameEngine/Configs/FamiliarityConfig';
import { familiarityFactor } from '@/Domain/familiarity/familiarity';
import type { GameState, GamePlayer, Formation, KnockoutDecider, SetPieceTakers } from '@/GameEngine/types';
import { tickState, createMatchState, knockoutDecider, applyTeamInstructions, setManMarksBySlot } from '@/GameEngine/Domain/gameState';
import { initStats, getAllPlayerStats, getGoalLog, getTeamStats, type GoalLogEntry } from '@/GameEngine/Domain/Statistics';
import { initRatings, getAllRatings } from '@/GameEngine/Domain/PlayerRating';
import { evaluateAiSubstitutions, shouldCheckAiSubs } from '@/GameEngine/Domain/AiSubstitution';
import type { PlayerStats as MatchPlayerStats, TeamStats } from '@/GameEngine/Domain/Statistics';
import type { Squad } from '@/types/playerTypes';

// Re-export Squad for consumers
export type { Squad } from '@/types/playerTypes';

// Side-effect imports activate event-bus subscriptions
import '@/GameEngine/Domain/Statistics';
import '@/GameEngine/Domain/PlayerRating';
import { staffEffectsOf } from '@/Domain/staff/staff';

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
  /** All in-match injuries suffered by either team, in chronological order. */
  injuries: import('@/GameEngine/types').InjuryRecord[];
  /** All cards shown, in chronological order (a second yellow = the yellow, then a red). */
  cards: import('@/GameEngine/types').CardRecord[];
  /** Extra time / shootout outcome of a knockout match; null otherwise or when decided in 90'. */
  decider:       KnockoutDecider | null;
  /** Every goal with minute and shot position, in order (engine ids; data for the season awards). */
  goals:         GoalLogEntry[];
  durationMs:    number;
}

export interface SimulateMatchOptions {
  /** Knockout: a draw after 90' goes to extra time and penalties. */
  knockout?: boolean;
  /** Second leg of a two-legged tie: first-leg goals per side of THIS match. */
  aggregate?: { A: number; B: number };
  /**
   * Tactics applied to each team before simulating (style + optional axes override, balanced
   * mentality). The config stores are process-global, so a caller that passes this gets a
   * per-match apply and nothing leaks from the previous match. Omit to keep whatever is applied
   * (the lab applies its own variants).
   */
  tactics?: { A: TeamTactics; B: TeamTactics };
  /**
   * Fitness-coach injury multiplier per team. Omitted = derived from each squad's staff
   * (`staffEffectsOf`: the human club's hired coach, the financial tier for AI clubs).
   */
  injuryMult?: { A?: number; B?: number };
  /**
   * Style familiarity (0..100) per side, read ONLY when `tactics` is omitted (the caller applied its
   * own tactics, e.g. the lab): sets each team's execution multiplier (`FamiliarityConfig.ts`).
   * Absent = neutral, so a caller that never deals with familiarity never inherits a previous one.
   */
  executionFamiliarity?: { A?: number; B?: number };
  /**
   * Morale (0..100) of a whole side (the lab, scripts): every player of that team plays at it
   * (`MoraleConfig.ts`). Absent = each player's own stored morale (human club; AI = neutral 65).
   * Always set or cleared here, so no override leaks from a previous match.
   */
  morale?: { A?: number; B?: number };
  /**
   * Temperament (1..20) of a whole side (the lab, `/test`, scripts): every player of that team fouls
   * and is booked as if he had it (`PersonalityMatchConfig.ts`). Absent = each player's own
   * (derived from his id). Always set or cleared here.
   */
  temperament?: { A?: number; B?: number };
  /**
   * Called with the state after every tick (diagnostics only — `scripts/formation-matrix.ts`, the
   * lab's formation matrix). Must not mutate the state.
   */
  onTick?: (state: GameState) => void;
  /**
   * Player instructions / man-marking per side for callers that apply their own tactics (the lab,
   * scripts) — `tactics[team]` takes precedence when given.
   */
  instructions?: { A?: TeamInstructions; B?: TeamInstructions };
}

/** Player instructions of one side (`player-instructions.md`). */
export interface TeamInstructions {
  slotInstructions?: (SlotInstruction | null)[];
  manMarks?: { slot: number; targetRosterId?: string; targetSlot?: number }[];
}

export interface TeamTactics {
  style: TacticalStyle;
  axesOverride?: Partial<TacticalAxes>;
  /** Manager's set-piece takers (roster ids); absent = automatic (`set-pieces-play.md`). */
  setPieceTakers?: SetPieceTakers;
  /** Style familiarity (`src/Domain/familiarity`); absent = neutral (no effect). */
  familiarity?: FamiliarityLevels;
  /** Per-slot player instructions (index = slot); absent = default (`player-instructions.md`). */
  slotInstructions?: (SlotInstruction | null)[];
  /**
   * Man-marking pairs: this side's `slot` marks the opponent named by roster id
   * (`targetRosterId`) or by the opponent's slot (`targetSlot`, the lab). At most 2.
   */
  manMarks?: { slot: number; targetRosterId?: string; targetSlot?: number }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default simulation step in real-seconds (matches live game tick rate). */
const SIM_DT = 0.2;

/** Safety cap to prevent infinite loops in degenerate states. */
const MAX_TICKS = 2_000_000;

/** Default 4-3-3 formation used for both teams when none is specified. */
export const DEFAULT_FORMATION: Formation = {
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
  options: SimulateMatchOptions = {},
): MatchResult {
  const startMs = performance.now();

  if (options.tactics) {
    for (const team of ['A', 'B'] as const) {
      const t = options.tactics[team];
      applyTeamTacticsConfig(team, t.style, DEFAULT_MENTALITY, t.axesOverride, t.familiarity);
      applyTeamAttackConfig(team, t.style, DEFAULT_MENTALITY, t.axesOverride, t.familiarity);
    }
  } else {
    for (const team of ['A', 'B'] as const) {
      setTeamExecution(team, familiarityFactor(options.executionFamiliarity?.[team]));
    }
  }

  setTeamMoraleOverride('A', options.morale?.A);
  setTeamMoraleOverride('B', options.morale?.B);
  setTeamTemperamentOverride('A', options.temperament?.A);
  setTeamTemperamentOverride('B', options.temperament?.B);

  // Build state — skip preMatch presentation so the loop starts in firstHalf
  let s: GameState = {
    ...createMatchState(squadA.players, formationA, squadB.players, formationB, lineupA, lineupB, {
      A: options.injuryMult?.A ?? staffEffectsOf(squadA).injuryMult,
      B: options.injuryMult?.B ?? staffEffectsOf(squadB).injuryMult,
    }),
    matchPhase:            'firstHalf',
    presentationCountdown: 0,
    knockout:              options.knockout === true,
    ...(options.aggregate ? { aggregate: options.aggregate } : {}),
    ...(options.tactics?.A.setPieceTakers || options.tactics?.B.setPieceTakers
      ? { setPieceTakers: { A: options.tactics.A.setPieceTakers, B: options.tactics.B.setPieceTakers } }
      : {}),
  };

  // Player instructions (manager's slots) and man-marking — the AI never sets either.
  for (const team of ['A', 'B'] as const) {
    const instr = options.tactics?.[team] ?? options.instructions?.[team];
    s = applyTeamInstructions(s, team, instr?.slotInstructions);
    s = setManMarksBySlot(s, team, instr?.manMarks);
  }

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
    const subsWindow = s.matchPhase === 'secondHalf' || s.matchPhase === 'extraTimeFirst' || s.matchPhase === 'extraTimeSecond';
    if (subsWindow && shouldCheckAiSubs(s.matchTime, SIM_DT * (2700 / 150))) {
      const subsA = evaluateAiSubstitutions(s, 'A');
      if (subsA.length > 0) s = { ...s, pendingSubsA: [...s.pendingSubsA, ...subsA] };
    }
    s = tickState(s, SIM_DT).state;
    options.onTick?.(s);
    ticks++;
  }

  return {
    score:         s.score,
    teamStats:     { A: getTeamStats('A'), B: getTeamStats('B') },
    playerStats:   getAllPlayerStats(),
    playerRatings: getAllRatings(),
    players:       s.players,
    substitutions: s.substitutions,
    injuries:      s.injuries,
    cards:         s.cards,
    decider:       knockoutDecider(s),
    goals:         getGoalLog(),
    durationMs:    performance.now() - startMs,
  };
}
