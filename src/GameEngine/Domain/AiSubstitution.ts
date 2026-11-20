/**
 * AiSubstitution — decides which substitutions an AI-controlled team should make.
 *
 * Called periodically during the second half. Returns a list of { outId, inId }
 * pairs to push into the pending sub queue; the engine processes them at the next
 * dead-ball moment.
 */

import type { GamePlayer, GameState, PendingSub, TeamId } from '@/GameEngine/types';
import { factorFromAptitudes } from '@/Domain/positions/positionAptitude';
import { CONDITION } from '@/GameEngine/Configs/ConditionConfig';
import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';

/** Subs a team starts with (`createMatchState`). */
const SUBS_PER_MATCH = 5;

/** Game-seconds between AI sub evaluations (~5 game-minutes). */
const AI_SUB_CHECK_INTERVAL = 300;

/** Energy threshold below which a player is considered a substitution candidate. */
const LOW_ENERGY_THRESHOLD = 40;

/** Energy threshold below which a player is considered critically tired. */
const CRITICAL_ENERGY_THRESHOLD = 25;

/**
 * Returns all sub recommendations for the given AI team based on energy levels.
 * May return an empty array (nobody tired), or multiple entries (batch subs).
 * Capped by remaining substitutions.
 */
export function evaluateAiSubstitutions(
  state: GameState,
  team: TeamId,
  minute?: number,
): PendingSub[] {
  if (DECISION_FLAGS.FM_CONDITION && minute !== undefined) return evaluateFmSubstitutions(state, team, minute);
  // Only sub during second half or extra time
  if (state.matchPhase !== 'secondHalf' && state.matchPhase !== 'extraTimeFirst' && state.matchPhase !== 'extraTimeSecond') return [];

  const subsRemaining = team === 'A' ? state.subsRemainingA : state.subsRemainingB;
  if (subsRemaining <= 0) return [];

  const bench = team === 'A' ? state.benchA : state.benchB;
  if (bench.length === 0) return [];

  const onPitch = state.players.filter(p => p.team === team && p.role !== 'GK');
  const usedBenchIds = new Set<number>();
  const subs: PendingSub[] = [];

  // Sort candidates: most tired first (critical first, then low energy)
  const candidates = onPitch
    .filter(p => p.energy < LOW_ENERGY_THRESHOLD)
    .sort((a, b) => a.energy - b.energy);

  for (const tired of candidates) {
    if (subs.length >= subsRemaining) break;

    // Find best bench player for this slot's role
    const slotRole = tired.role;
    const availableBench = bench.filter(p => !usedBenchIds.has(p.id));
    if (availableBench.length === 0) break;

    const best = findBestBenchForRole(availableBench, slotRole);
    if (!best) continue;

    // Only sub if the bench player is meaningfully better energetically
    // or the on-pitch player is critically low
    const worthSub = tired.energy < CRITICAL_ENERGY_THRESHOLD
      || best.energy > tired.energy + 20;
    if (!worthSub) continue;

    subs.push({ outId: tired.id, inId: best.id, reason: 'fatigue' });
    usedBenchIds.add(best.id);
  }

  return subs;
}

/**
 * FM's AI changes (stage 14, `ConditionConfig.ts` → `AI_SUBS`): from minute 55 the players below 75 % condition, most
 * tired first, when the bench player is fresher by `BENCH_MARGIN`; from minute 70 a side with fewer than `MIN_CHANGES`
 * changes freshens its most tired outfield player anyway (`tactical`). At most `MAX_CHANGES` planned changes a match
 * (the rest stays for injuries) and `PER_CHECK` per check. Changes already queued count.
 */
function evaluateFmSubstitutions(state: GameState, team: TeamId, minute: number): PendingSub[] {
  const cfg = CONDITION.AI_SUBS;
  const live = state.matchPhase === 'secondHalf' || state.matchPhase === 'extraTimeFirst' || state.matchPhase === 'extraTimeSecond';
  if (!live || minute < cfg.FROM_MINUTE) return [];
  const subsRemaining = team === 'A' ? state.subsRemainingA : state.subsRemainingB;
  const queued = team === 'A' ? state.pendingSubsA : state.pendingSubsB;
  const made = SUBS_PER_MATCH - subsRemaining + queued.length;
  const room = Math.min(subsRemaining - queued.length, cfg.MAX_CHANGES - made, cfg.PER_CHECK);
  if (room <= 0) return [];
  const queuedOut = new Set(queued.map(q => q.outId));
  const queuedIn = new Set(queued.map(q => q.inId));
  const bench = (team === 'A' ? state.benchA : state.benchB).filter(p => !queuedIn.has(p.id));
  if (bench.length === 0) return [];
  const onPitch = state.players
    .filter(p => p.team === team && p.role !== 'GK' && !queuedOut.has(p.id))
    .sort((a, b) => a.energy - b.energy);

  const used = new Set<number>();
  const subs: PendingSub[] = [];
  const pick = (tired: GamePlayer, reason: 'fatigue' | 'tactical', why: string): boolean => {
    const best = findBestBenchForRole(bench.filter(p => !used.has(p.id)), tired.role);
    if (!best || best.energy < tired.energy + cfg.BENCH_MARGIN) return false;
    subs.push({ outId: tired.id, inId: best.id, reason, why });
    used.add(best.id);
    return true;
  };
  for (const tired of onPitch) {
    if (subs.length >= room || tired.energy >= cfg.CONDITION) break;
    pick(tired, 'fatigue', `condition ${Math.round(tired.energy)} < ${cfg.CONDITION} at ${minute}'`);
  }
  if (subs.length === 0 && minute >= cfg.TACTICAL_FROM && made < cfg.MIN_CHANGES) {
    const tired = onPitch.find(p => !subs.some(q => q.outId === p.id));
    if (tired) pick(tired, 'tactical', `${made} of ${cfg.MIN_CHANGES} changes by ${minute}', most tired at ${Math.round(tired.energy)}`);
  }
  return subs;
}

/**
 * Find the best available bench player for a given role.
 * Priority: exact role match → same main role → any player.
 * Among equals, picks the one with better weighted score for the role.
 */
export function findBestBenchForRole(bench: GamePlayer[], role: string): GamePlayer | null {
  if (bench.length === 0) return null;

  const exactMatch = bench
    .filter(p => p.role === role)
    .sort((a, b) => scoreForRole(b, role) - scoreForRole(a, role));
  if (exactMatch[0]) return exactMatch[0];

  const mainRoleMatch = bench
    .filter(p => sameMainRole(p.role, role))
    .sort((a, b) => scoreForRole(b, role) - scoreForRole(a, role));
  if (mainRoleMatch[0]) return mainRoleMatch[0];

  // Fall back to any bench player, highest overall
  return bench.sort((a, b) => scoreForRole(b, role) - scoreForRole(a, role))[0] ?? null;
}

function scoreForRole(player: GamePlayer, role: string): number {
  // Use a composite of energy and base stats proxy (withBall.speed as a crude overall)
  const statScore = player.baseStats.withBall.speed
    + player.baseStats.withBall.passingSkill
    + player.baseStats.withoutBall.tackleChance;
  // Position fit for the slot: a natural beats an unsuitable one (same factor the engine applies).
  const fitK = factorFromAptitudes(player.fit?.aptitudes, role);
  return statScore * fitK * (player.energy / 100);
}

const MAIN_ROLE_BANDS: Record<string, string> = {
  GK: 'GK',
  LB: 'DEF', CB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', ST: 'FWD',
};

function sameMainRole(roleA: string, roleB: string): boolean {
  return (MAIN_ROLE_BANDS[roleA] ?? roleA) === (MAIN_ROLE_BANDS[roleB] ?? roleB);
}

/**
 * Returns true if a 300-game-second check boundary was crossed this tick.
 *
 * `dt` is the game-time advance for this tick (already scaled by the clock
 * scale by the caller). Callers pass `physicalDt * clockScaleOf(state)`.
 *
 * Previously re-multiplied `dt` by the clock scale internally, which looked back
 * ~65 game-seconds instead of ~3.6, causing the check to fire ~18 consecutive
 * ticks at every interval boundary. That bloated pendingSubsA/B because each
 * firing re-queued the same recommended subs.
 */
export function shouldCheckAiSubs(matchTime: number, dt: number): boolean {
  const prev = matchTime - dt;
  const cur  = matchTime;
  return Math.floor(prev / AI_SUB_CHECK_INTERVAL) !== Math.floor(cur / AI_SUB_CHECK_INTERVAL);
}
