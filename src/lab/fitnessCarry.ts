/**
 * Fitness carry-over between consecutive matches in a `/lab` "congestion" run — see
 * `docs/superpowers/specs/2026-09-27-stamina-design.md` §3 (`BalanceScenario.congestion`).
 *
 * This is a lab-only, self-contained approximation of the production advance-day pipeline
 * (`src/Domain/advanceDay/matches.ts`'s private `finalizeSquadsAfterMatch`) — it only touches
 * `seasonLog.fitness`/`seasonLog.load` (the two fields the engine actually reads to seed a
 * player's in-match energy and drain multiplier), never appearances/goals/ratings/development,
 * since a congestion run never displays any of that per player. No I/O, no real day advance.
 */

import { addMatchLoad, decayLoad, postMatchFitness, recoverDay } from "@/Domain/fitness/fitness";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { GamePlayer, SubstitutionRecord } from "@/GameEngine/types";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";

/** `stats.stamina` (0–10) is required on the type, but fall back defensively — see fitness.md. */
const DEFAULT_STAMINA = 7;

/** Full match length in minutes for load purposes — 120 once extra time was played, else 90. */
export function totalMatchMinutes(hadExtraTime: boolean): number {
  return hadExtraTime ? 120 : 90;
}

/** roster id → how this match affected them (end energy + minutes played). Absent id = did not appear. */
export type MatchAppearances = Map<string, { endEnergy: number; minutes: number }>;

/**
 * Build the appearances map for one side of a full-engine match result. A player still on the
 * pitch at full time played the whole match; a substituted-off player's minutes stop at their sub
 * minute, and whoever replaced them is credited the remainder. Mirrors
 * `src/GameInterface/buildPlayedMatchRecording.ts`, minus the `Statistics`/`PlayerRating` store
 * lookups a fitness-only carry-over doesn't need.
 */
export function fullEngineAppearances(
  players: GamePlayer[],
  substitutions: SubstitutionRecord[],
  team: "A" | "B",
  hadExtraTime: boolean,
): MatchAppearances {
  const minutes = totalMatchMinutes(hadExtraTime);
  const map: MatchAppearances = new Map();
  for (const p of players) {
    if (p.team !== team) continue;
    map.set(p.rosterId, { endEnergy: p.energy, minutes });
  }
  for (const sub of substitutions) {
    if (sub.team !== team) continue;
    map.set(sub.playerOutRosterId, { endEnergy: sub.playerOutEnergy, minutes: sub.matchMinute });
    const incoming = map.get(sub.playerInRosterId);
    if (incoming) {
      map.set(sub.playerInRosterId, { ...incoming, minutes: Math.max(1, minutes - sub.matchMinute) });
    }
  }
  return map;
}

/**
 * Build the appearances map for one side of a quickSim recording. quickSim never subs — every id
 * in `playerEnergy` played the full match (see `.claude/rules/non-player-games.md`).
 */
export function quickSimAppearances(
  recording: Pick<PlayedMatchRecording, "playerEnergy" | "decider">,
  isThisSide: (rosterId: string) => boolean,
): MatchAppearances {
  const minutes = totalMatchMinutes(recording.decider != null);
  const map: MatchAppearances = new Map();
  for (const [id, energy] of Object.entries(recording.playerEnergy)) {
    if (!isThisSide(id)) continue;
    map.set(id, { endEnergy: energy, minutes });
  }
  return map;
}

/**
 * Apply one match's effect to a squad's `seasonLog.fitness`/`.load`: `postMatchFitness` +
 * `addMatchLoad` for anyone who appears in `appearances`. A squad member who didn't play still
 * gets one day's worth of recovery — their club "played today", so a daily rest loop would skip
 * them entirely; this is their only chance to recover on this day (same rule as
 * `finalizeSquadsAfterMatch`'s "did not appear" branch).
 */
export function applyMatchToSquad(squad: Squad, appearances: MatchAppearances): Squad {
  return {
    ...squad,
    players: squad.players.map((p) => {
      const log = { ...(p.seasonLog ?? emptySeasonLog()) };
      const appearance = appearances.get(p.id);
      const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
      if (appearance) {
        log.fitness = postMatchFitness(appearance.endEnergy);
        log.load = addMatchLoad(decayLoad(log.load ?? 0), appearance.minutes);
      } else {
        const preDecayLoad = log.load ?? 0;
        log.fitness = Math.min(100, Math.max(0, recoverDay(log.fitness, { age: p.age, load: preDecayLoad, stamina })));
        log.load = decayLoad(preDecayLoad);
      }
      return { ...p, seasonLog: log };
    }),
  };
}

/** Apply `days` full rest days (no match, no training) to every player in the squad. */
export function applyRestDays(squad: Squad, days: number): Squad {
  if (days <= 0) return squad;
  return {
    ...squad,
    players: squad.players.map((p) => {
      let log = { ...(p.seasonLog ?? emptySeasonLog()) };
      const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
      for (let d = 0; d < days; d++) {
        const preDecayLoad = log.load ?? 0;
        log = {
          ...log,
          fitness: Math.min(100, Math.max(0, recoverDay(log.fitness, { age: p.age, load: preDecayLoad, stamina }))),
          load: decayLoad(preDecayLoad),
        };
      }
      return { ...p, seasonLog: log };
    }),
  };
}

/** Average end-of-match energy across everyone who appeared (0 if nobody did). */
export function avgAppearanceEnergy(appearances: MatchAppearances): number {
  if (appearances.size === 0) return 0;
  let sum = 0;
  for (const a of appearances.values()) sum += a.endEnergy;
  return sum / appearances.size;
}
