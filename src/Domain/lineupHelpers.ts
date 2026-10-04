import type { RosterPlayer } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { FormationSlot } from "@/types/formationSlots";
import { aptitudeFor, slotValue } from "@/Domain/positions/positionAptitude";
import { getMainRole } from "@/Domain/roles";
import { overallEnergyFactor } from "@/GameEngine/Domain/RuntimeLineup";
import { drainMultiplier, matchStartEnergy } from "@/Domain/fitness/fitness";
import { isInjured } from "@/Domain/injury/injury";
import { isUnavailable } from "@/Domain/discipline/discipline";

/** Same default as `ensureSeasonLog`/`emptySeasonLog` — a player never touched by the fitness model yet. */
const DEFAULT_FITNESS = emptySeasonLog().fitness;

/**
 * Filters `players` down to those eligible to play on `date` — i.e. not injured and not
 * suspended (`isUnavailable`). When
 * `date` is omitted the pool is returned unchanged: some callers (continental club-strength
 * ratings, `/test` and `/lab` tooling) deliberately compare squads on their own terms, independent
 * of any specific matchday, and must not have injuries silently filtered in.
 */
function eligiblePool(players: RosterPlayer[], date: string | undefined): RosterPlayer[] {
  if (!date) return players;
  return players.filter((p) => !isUnavailable(p, date));
}

/**
 * Auto-fills a lineup from available players for a given set of formation slots.
 *
 * Priority per slot:
 *  1. Players whose `positions` list includes the exact slot role, or share its line (best
 *     `slotValue` first; an `unsuitable` player only when nobody else of the line is left).
 *  2. Any remaining unassigned player, scored by the slot's weighted score.
 *
 * Exported separately so non-player teams (AI squads) can reuse the same logic.
 *
 * `date`, when given, excludes any player injured on that date from the whole candidate pool —
 * see `eligiblePool`. Omit it for context-free squad comparisons (see `eligiblePool`'s doc).
 */
export function autoFillLineup(
  slots: FormationSlot[],
  players: RosterPlayer[],
  date?: string,
): string[] {
  players = eligiblePool(players, date);
  const used = new Set<string>();
  const result: string[] = new Array(slots.length).fill("");

  // First pass: role-matched players (exact code, or same main role). Slots are filled
  // scarcest-fit first: the slot with the fewest natural/apt candidates left picks next, so a
  // versatile player is not burned in a slot that others could fill while a scarcer slot goes
  // to someone unsuitable.
  const eligibleFor = (role: string) => {
    const roleMain = getMainRole(role);
    return players.filter(
      (p) =>
        !used.has(p.id) &&
        (p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === roleMain),
    );
  };
  const pending = new Set(slots.map((_, i) => i));
  while (pending.size > 0) {
    let pick = -1;
    let pickGood = Infinity;
    for (const i of pending) {
      const role = slots[i]!.role;
      const good = eligibleFor(role).filter((p) => {
        const a = aptitudeFor(p, role);
        return a === "natural" || a === "apt";
      }).length;
      if (good < pickGood) {
        pickGood = good;
        pick = i;
      }
    }
    pending.delete(pick);
    const role = slots[pick]!.role;
    const candidates = eligibleFor(role).sort(
      (a, b) =>
        Number(aptitudeFor(a, role) === "unsuitable") - Number(aptitudeFor(b, role) === "unsuitable") ||
        slotValue(b, role) - slotValue(a, role),
    );
    if (candidates[0]) {
      result[pick] = candidates[0].id;
      used.add(candidates[0].id);
    }
  }

  // Second pass: fill any remaining slots with the best available player by slot score.
  for (let i = 0; i < slots.length; i++) {
    if (result[i]) continue;
    const role = slots[i]!.role;
    const remaining = players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => slotValue(b, role) - slotValue(a, role));

    if (remaining[0]) {
      result[i] = remaining[0].id;
      used.add(remaining[0].id);
    }
  }

  return result;
}

/**
 * Re-seats the current XI in a new formation's slots. The slot-indexed `lineup` would otherwise be
 * reinterpreted against different slots (a CB landing on a wing). Starters are assigned by the same
 * aptitude logic as `autoFillLineup`, restricted to the current starters; slots left empty (fewer
 * starters than slots, or injured ones dropped via `date`) are then filled from the bench.
 */
export function remapLineupToFormation(
  lineup: string[],
  newSlots: FormationSlot[],
  players: RosterPlayer[],
  date?: string,
): string[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters = [...new Set(lineup.filter(Boolean))].map((id) => byId.get(id)).filter((p): p is RosterPlayer => !!p);
  const result = autoFillLineup(newSlots, starters, date);
  const used = new Set(result.filter(Boolean));
  const bench = eligiblePool(players, date).filter((p) => !used.has(p.id));
  for (let i = 0; i < newSlots.length; i++) {
    if (result[i]) continue;
    const role = newSlots[i]!.role;
    bench.sort((a, b) => slotValue(b, role) - slotValue(a, role));
    const pick = bench.shift();
    if (pick) result[i] = pick.id;
  }
  return result;
}

/** Fitness below this (0..100) makes a starter (from the plain `autoFillLineup`) a swap candidate. */
const TIRED_FITNESS_THRESHOLD = 75;

/**
 * A bench player must reach this fraction of the tired starter's fitness-adjusted value to take
 * the slot. Above 1.0 the bench player must actually be BETTER than the tired starter, not merely
 * close — this is deliberate: with `TIRED_FITNESS_THRESHOLD` alone gating eligibility, almost any
 * clearly-tired starter (fitness well under 75) loses so much value to a fresh bench player under
 * the engine's fatigue curve (`overallEnergyFactor`, `RuntimeLineup.ts`) that a ratio below ~1
 * barely filters anything, which over-rotates a congested AI squad.
 *
 * `fitnessAdjustedValue` values BOTH players by `matchStartEnergy(fitness)` — the compressed
 * energy the ENGINE will actually kick off with (2026-09-27 "compress the relative gap" balance
 * pass, see `src/Domain/fitness/fitness.ts` and `.claude/rules/non-player-games.md` → "Fadiga") —
 * not raw fitness. That compression narrows the value gap between a tired starter and a fresh
 * bench player considerably (both are pulled toward `FITNESS.FITNESS_REF`), so `BENCH_SWAP_RATIO`
 * had to be re-swept against it every time `START_COMPRESSION` changed. Re-swept with a
 * rotation-sweep harness (8 matches every 3 days, real `premier_league`/`of_championship` squads)
 * at the final `START_COMPRESSION = 0.4`: `1.17` lands a congested run at ~2.8-3.1 rotated starters
 * per match (inside the 2-3.5 target) and a normal week at ~0, and keeps the pre-existing
 * `fitness.congestion.test.ts` acceptance criterion (a starter rested by the 3rd of 3 matches in 7
 * days) passing. Depends on both `matchStartEnergy`'s compression and the fatigue
 * curve's steepness (`RuntimeLineup.ts`) — re-sweep this constant if either changes.
 */
const BENCH_SWAP_RATIO = 1.17;

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
  const stat = slotValue(player, role);
  const fitness = player.seasonLog?.fitness ?? DEFAULT_FITNESS;
  const load = player.seasonLog?.load ?? 0;
  // Value the player by what the ENGINE will actually play him at — the match's compressed
  // starting energy (`matchStartEnergy`), not raw persisted fitness. Otherwise a moderately tired
  // starter (say fitness 70, which the engine will actually start at ~79 — see
  // `.claude/rules/non-player-games.md` → "Fadiga") looks more degraded to the selector than he'll
  // actually be on the pitch, over-resting him relative to what the match itself will show.
  return (stat * overallEnergyFactor(matchStartEnergy(fitness))) / drainMultiplier(load);
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
 *
 * `date`, when given, excludes any player injured on that date from the whole candidate pool
 * (starters and bench alike) before any of the above runs — see `eligiblePool`.
 */
export function autoFillLineupWithFitness(
  slots: FormationSlot[],
  players: RosterPlayer[],
  date?: string,
): string[] {
  players = eligiblePool(players, date);
  const plain = autoFillLineup(slots, players);
  return applyRotation(plain, suggestRotation(slots, plain, players, date));
}

/** Applies `{ out, in }` swaps to a slot-aligned lineup. */
export function applyRotation(lineup: string[], swaps: { out: string; in: string }[]): string[] {
  const map = new Map(swaps.map((s) => [s.out, s.in]));
  return lineup.map((id) => map.get(id) ?? id);
}

/**
 * Tired-starter swaps for a slot-aligned lineup: same rule the AI uses in
 * `autoFillLineupWithFitness`. Injured bench players never come in (when `date` is given); a bench
 * player is used at most once.
 */
export function suggestRotation(
  slots: FormationSlot[],
  lineupIds: string[],
  players: RosterPlayer[],
  date?: string,
): { out: string; in: string }[] {
  const pool = eligiblePool(players, date);
  const byId = new Map(players.map((p) => [p.id, p]));
  const usedIds = new Set(lineupIds.filter((id) => id));
  const swaps: { out: string; in: string }[] = [];

  for (let i = 0; i < slots.length; i++) {
    const starterId = lineupIds[i];
    if (!starterId) continue;
    const starter = byId.get(starterId);
    if (!starter) continue;

    const role = slots[i]!.role;
    const isGK = role === "GK";
    const fitness = starter.seasonLog?.fitness ?? DEFAULT_FITNESS;
    const tiredThreshold = isGK ? GK_TIRED_FITNESS_THRESHOLD : TIRED_FITNESS_THRESHOLD;
    if (fitness >= tiredThreshold) continue;

    const roleMain = getMainRole(role);
    let bench = pool.filter(
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

    if (bestValue >= fitnessAdjustedValue(starter, role) * BENCH_SWAP_RATIO) {
      usedIds.delete(starterId);
      usedIds.add(best.id);
      swaps.push({ out: starterId, in: best.id });
    }
  }
  return swaps;
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

/** One starter swapped out because they were injured or suspended on the match date. */
export interface InjuredReplacement {
  out: string;
  in: string;
  reason: "injured" | "suspended";
}

/**
 * Takes a slot-aligned lineup (e.g. from `buildSlotAlignedLineup`, index i = formation slot i) and
 * swaps out any player injured or suspended on `date` (`isUnavailable`) for the best eligible bench player — same-role/main-role
 * candidates ranked by `fitnessAdjustedValue` first, falling back to any remaining eligible player
 * if none fit the role. A slot whose player is injured but no eligible replacement exists (squad
 * too thin) is left as-is — better to field an injured player than an empty slot.
 *
 * Used for a HUMAN club's saved lineup, which (unlike AI auto-fill) can go stale between the day it
 * was saved and the day the fixture is actually played — see `resolveUserLineup`
 * (`matchSimulationLineups.ts`).
 */
export function replaceUnavailableStarters(
  slots: FormationSlot[],
  lineupIds: string[],
  players: RosterPlayer[],
  date: string,
): { lineup: string[]; replaced: InjuredReplacement[] } {
  const byId = new Map(players.map((p) => [p.id, p]));
  const used = new Set(lineupIds.filter((id): id is string => Boolean(id)));
  const result = [...lineupIds];
  const replaced: InjuredReplacement[] = [];

  for (let i = 0; i < slots.length && i < lineupIds.length; i++) {
    const starterId = lineupIds[i];
    if (!starterId) continue;
    const starter = byId.get(starterId);
    if (!starter || !isUnavailable(starter, date)) continue;

    const role = slots[i]!.role;
    const roleMain = getMainRole(role);
    const eligible = players.filter((p) => !used.has(p.id) && !isUnavailable(p, date));
    const sameRole = eligible.filter(
      (p) => p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === roleMain,
    );
    const pool = sameRole.length > 0 ? sameRole : eligible;

    let best: RosterPlayer | null = null;
    let bestValue = -Infinity;
    for (const candidate of pool) {
      const value = fitnessAdjustedValue(candidate, role);
      if (value > bestValue) {
        bestValue = value;
        best = candidate;
      }
    }
    if (!best) continue;

    used.delete(starterId);
    used.add(best.id);
    result[i] = best.id;
    replaced.push({ out: starterId, in: best.id, reason: isInjured(starter, date) ? "injured" : "suspended" });
  }

  return { lineup: result, replaced };
}
