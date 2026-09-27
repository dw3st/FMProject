import type { RosterPlayer } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { FormationSlot } from "@/types/formationSlots";
import { Player } from "@/Domain/Player";
import { getMainRole } from "@/GameInterface/positionHelpers";
import { overallEnergyFactor } from "@/GameEngine/Domain/RuntimeLineup";
import { drainMultiplier } from "@/Domain/fitness/fitness";

/** Same default as `ensureSeasonLog`/`emptySeasonLog` — a player never touched by the fitness model yet. */
const DEFAULT_FITNESS = emptySeasonLog().fitness;

/**
 * Auto-fills a lineup from available players for a given set of formation slots.
 *
 * Priority per slot:
 *  1. Players whose `positions` list includes the exact slot role (best score first).
 *  2. Any remaining unassigned player, scored by the slot's weighted score.
 *
 * Exported separately so non-player teams (AI squads) can reuse the same logic.
 */
export function autoFillLineup(slots: FormationSlot[], players: RosterPlayer[]): string[] {
  const used = new Set<string>();
  const result: string[] = new Array(slots.length).fill("");

  // First pass: assign the best role-matched player to each slot (exact code, or same main role).
  for (let i = 0; i < slots.length; i++) {
    const role = slots[i]!.role;
    const roleMain = getMainRole(role);
    const candidates = players
      .filter(
        (p) =>
          !used.has(p.id) &&
          (p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === roleMain),
      )
      .sort((a, b) => Player.weightedScore(b.stats, role) - Player.weightedScore(a.stats, role));

    if (candidates[0]) {
      result[i] = candidates[0].id;
      used.add(candidates[0].id);
    }
  }

  // Second pass: fill any remaining slots with the best available player by slot score.
  for (let i = 0; i < slots.length; i++) {
    if (result[i]) continue;
    const role = slots[i]!.role;
    const remaining = players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => Player.weightedScore(b.stats, role) - Player.weightedScore(a.stats, role));

    if (remaining[0]) {
      result[i] = remaining[0].id;
      used.add(remaining[0].id);
    }
  }

  return result;
}

/** Fitness below this (0..100) makes a starter (from the plain `autoFillLineup`) a swap candidate. */
const TIRED_FITNESS_THRESHOLD = 75;

/**
 * A bench player must reach this fraction of the tired starter's fitness-adjusted value to take
 * the slot. Above 1.0 the bench player must actually be BETTER than the tired starter, not merely
 * close — this is deliberate: with `TIRED_FITNESS_THRESHOLD` alone gating eligibility, almost any
 * clearly-tired starter (fitness well under 75) loses so much value to a fresh bench player that a
 * ratio below ~1 barely filters anything, which over-rotates a congested AI squad (measured ~8-9
 * starters changed per match at 0.85-1.0 on a 3-day fixture gap). Tuned so a congested run (match
 * every 3 days) lands ~2-3.5 rotated starters per match, while a normal week (fitness barely dips
 * below the threshold) still rotates ~0 — see `.claude/rules/non-player-games.md` → "Fadiga" for
 * the rotation sweep and the fatigue curve this was calibrated alongside.
 */
const BENCH_SWAP_RATIO = 1.09;

/** GK slot is exempt from ordinary rotation unless the starter is really struggling. */
const GK_TIRED_FITNESS_THRESHOLD = 60;
/** ...and even then, only when a bench keeper is clearly not carrying his own fatigue. */
const GK_BENCH_FITNESS_FLOOR = 85;

/**
 * A player's value in a slot once today's fitness is taken into account:
 * `Player.weightedScore(stats, role) × overallEnergyFactor(fitness)`, further discounted by
 * `drainMultiplier(load)` — a simple forward-looking penalty for a high-load player who will drain
 * faster than their current fitness alone suggests over 90 minutes (see
 * `docs/superpowers/specs/2026-09-27-stamina-design.md` §2 and `src/Domain/fitness/fitness.ts`).
 * This does not simulate the match; it is only a cheap proxy used to rank lineup candidates.
 */
function fitnessAdjustedValue(player: RosterPlayer, role: string): number {
  const stat = Player.weightedScore(player.stats, role);
  const fitness = player.seasonLog?.fitness ?? DEFAULT_FITNESS;
  const load = player.seasonLog?.load ?? 0;
  return (stat * overallEnergyFactor(fitness)) / drainMultiplier(load);
}

/**
 * `autoFillLineup`, but a tired starter can be rested for a nearly-as-good bench player of the same
 * slot. Used by AI clubs (and the formation screen's "auto" button) for lineup selection — see
 * `docs/superpowers/specs/2026-09-27-stamina-design.md` §2.
 *
 * Algorithm: start from the plain `autoFillLineup` result (identical slot-filling logic/order — a
 * fully fit squad returns exactly the same lineup). Then, for each slot whose starter has
 * `seasonLog.fitness < TIRED_FITNESS_THRESHOLD`, look at the best-fit bench player for that same
 * slot (same eligibility rule as `autoFillLineup`'s first pass: exact position code, else same main
 * role) ranked by `fitnessAdjustedValue`. If the bench player's fitness-adjusted value is at least
 * `BENCH_SWAP_RATIO` of the tired starter's, the bench player takes the slot; otherwise the starter
 * — however tired — stays, because they are still clearly the better pick.
 *
 * The GK slot is exempt from this by default: a keeper is only a swap candidate when his own
 * fitness drops below `GK_TIRED_FITNESS_THRESHOLD` (well under the outfield threshold — resting a
 * keeper mid-week is a bigger call than resting an outfield player), and even then only among bench
 * keepers whose own fitness is at least `GK_BENCH_FITNESS_FLOOR` (a barely-fresher backup keeper
 * isn't worth the disruption).
 */
export function autoFillLineupWithFitness(slots: FormationSlot[], players: RosterPlayer[]): string[] {
  const plain = autoFillLineup(slots, players);
  const byId = new Map(players.map((p) => [p.id, p]));
  const usedIds = new Set(plain.filter((id) => id));
  const result = [...plain];

  for (let i = 0; i < slots.length; i++) {
    const starterId = result[i];
    if (!starterId) continue;
    const starter = byId.get(starterId);
    if (!starter) continue;

    const role = slots[i]!.role;
    const isGK = role === "GK";
    const fitness = starter.seasonLog?.fitness ?? DEFAULT_FITNESS;
    const tiredThreshold = isGK ? GK_TIRED_FITNESS_THRESHOLD : TIRED_FITNESS_THRESHOLD;
    if (fitness >= tiredThreshold) continue;

    const roleMain = getMainRole(role);
    let bench = players.filter(
      (p) =>
        !usedIds.has(p.id) &&
        (p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === roleMain),
    );
    if (isGK) {
      bench = bench.filter((p) => (p.seasonLog?.fitness ?? DEFAULT_FITNESS) >= GK_BENCH_FITNESS_FLOOR);
    }
    if (bench.length === 0) continue;

    let best: RosterPlayer | null = null;
    let bestValue = -Infinity;
    for (const candidate of bench) {
      const value = fitnessAdjustedValue(candidate, role);
      if (value > bestValue) {
        bestValue = value;
        best = candidate;
      }
    }
    if (!best) continue;

    const starterValue = fitnessAdjustedValue(starter, role);
    if (bestValue >= starterValue * BENCH_SWAP_RATIO) {
      usedIds.delete(starterId);
      usedIds.add(best.id);
      result[i] = best.id;
    }
  }

  return result;
}

/**
 * Returns true when the player's primary role does not match the slot's role at the main-role level
 * (GK / Defender / Midfielder / Forward). Detailed codes (CB vs LB) no longer matter — only whether
 * the slot and the player's main position are in the same band.
 */
export function isOutOfPosition(player: RosterPlayer, slotRole: string): boolean {
  const primary = player.positions[0] ?? "CM";
  return getMainRole(primary) !== getMainRole(slotRole);
}

/**
 * Indices 0–10 match formation slot indices. Saved lineup IDs are placed first; any empty slots are
 * filled from remaining players in squad order (same idea as auto-fill gaps).
 */
export function buildSlotAlignedLineup(
  players: RosterPlayer[],
  lineupIds: string[],
): (RosterPlayer | undefined)[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const ordered: (RosterPlayer | undefined)[] = new Array(11).fill(undefined);
  const used = new Set<string>();

  for (let i = 0; i < Math.min(lineupIds.length, 11); i++) {
    const id = lineupIds[i];
    if (id) {
      const p = byId.get(id);
      if (p) {
        ordered[i] = p;
        used.add(id);
      }
    }
  }

  const remaining = players.filter((p) => !used.has(p.id));
  let ri = 0;
  for (let i = 0; i < 11; i++) {
    if (!ordered[i] && ri < remaining.length) {
      ordered[i] = remaining[ri];
      used.add(remaining[ri]!.id);
      ri++;
    }
  }
  return ordered;
}

/** Higher = better fit for the slot: exact position code → same main-role band → mismatch. */
export function slotRoleFitRank(player: RosterPlayer, slotRole: string): number {
  if (player.positions.includes(slotRole)) return 2;
  if (getMainRole(player.positions[0] ?? "CM") === getMainRole(slotRole)) return 1;
  return 0;
}
