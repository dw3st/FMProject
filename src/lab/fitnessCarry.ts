/**
 * Fitness carry-over between consecutive matches in a `/lab` "congestion" run — see
 * `docs/superpowers/specs/2026-09-27-stamina-design.md` §3 (`BalanceScenario.congestion`).
 *
 * This mirrors the production advance-day pipeline (`src/Domain/advanceDay/matches.ts`'s private
 * `finalizeSquadsAfterMatch`) exactly for the two fields it touches, `seasonLog.fitness`/
 * `seasonLog.load` (what the engine reads to seed a player's in-match energy and drain
 * multiplier) — both the per-player update (`applyMatchFitness`) and the minutes-played
 * computation (`computeMinutesPlayed`) are the SAME functions production uses, not hand-copied
 * approximations. Never touches appearances/goals/ratings/development, since a congestion run
 * never displays any of that per player. No I/O, no real day advance.
 */

import { applyMatchFitness } from "@/Domain/fitness/fitness";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { GamePlayer, SubstitutionRecord } from "@/GameEngine/types";
import { computeMinutesPlayed, type PlayedMatchRecording } from "@/Domain/advanceDay/matches";

/** `stats.stamina` (0–10) is required on the type, but fall back defensively — see fitness.md. */
const DEFAULT_STAMINA = 7;

/** Full match length in minutes for load purposes — 120 once extra time was played, else 90. */
export function totalMatchMinutes(hadExtraTime: boolean): number {
  return hadExtraTime ? 120 : 90;
}

/** roster id → how this match affected them (end energy + minutes played). Absent id = did not appear. */
export type MatchAppearances = Map<string, { endEnergy: number; minutes: number }>;

/**
 * Build the appearances map for one side of a full-engine match result. Minutes come from
 * `computeMinutesPlayed` — the same substitution-log walk production uses — so a player subbed on
 * and later subbed off again is credited the minutes they were actually on the pitch for, not the
 * match minute of their final substitution (a bug an earlier hand-rolled version of this function
 * had: it fell back to the substitution's own `matchMinute` for that case).
 */
export function fullEngineAppearances(
  players: GamePlayer[],
  substitutions: SubstitutionRecord[],
  team: "A" | "B",
  hadExtraTime: boolean,
): MatchAppearances {
  const totalMinutes = totalMatchMinutes(hadExtraTime);
  const teamSubs = substitutions.filter((s) => s.team === team);

  // endEnergy: on-pitch-at-full-time players read their live GamePlayer.energy; anyone subbed off
  // (including subbed-on-then-off) reads the energy recorded at their own substitution.
  const endEnergyById = new Map<string, number>();
  for (const p of players) {
    if (p.team === team) endEnergyById.set(p.rosterId, p.energy);
  }
  for (const sub of teamSubs) {
    if (!endEnergyById.has(sub.playerOutRosterId)) {
      endEnergyById.set(sub.playerOutRosterId, sub.playerOutEnergy);
    }
  }

  const playerIds = [...endEnergyById.keys()];
  const minutesById = computeMinutesPlayed(
    playerIds,
    teamSubs.map((s) => ({
      playerOutId: s.playerOutRosterId,
      playerInId: s.playerInRosterId,
      matchMinute: s.matchMinute,
    })),
    totalMinutes,
  );

  const map: MatchAppearances = new Map();
  for (const id of playerIds) {
    map.set(id, { endEnergy: endEnergyById.get(id)!, minutes: minutesById[id] ?? 0 });
  }
  return map;
}

/**
 * Build the appearances map for one side of a quickSim recording. quickSim never subs — every id
 * in `playerEnergy` played the full match (see `.claude/rules/non-player-games.md`); minutes still
 * go through `computeMinutesPlayed` (with an empty substitution list) for a single source of truth.
 */
export function quickSimAppearances(
  recording: Pick<PlayedMatchRecording, "playerEnergy" | "decider">,
  isThisSide: (rosterId: string) => boolean,
): MatchAppearances {
  const totalMinutes = totalMatchMinutes(recording.decider != null);
  const playerIds = Object.keys(recording.playerEnergy).filter(isThisSide);
  const minutesById = computeMinutesPlayed(playerIds, [], totalMinutes);
  const map: MatchAppearances = new Map();
  for (const id of playerIds) {
    map.set(id, { endEnergy: recording.playerEnergy[id]!, minutes: minutesById[id] ?? totalMinutes });
  }
  return map;
}

/**
 * Apply one match's effect to a squad's `seasonLog.fitness`/`.load` via `applyMatchFitness` — the
 * same function production's `finalizeSquadsAfterMatch` uses — for anyone who appears in
 * `appearances`. A squad member who didn't play still gets one day's worth of recovery (the same
 * `applyMatchFitness` call with no appearance) — their club "played today", so a daily rest loop
 * would skip them entirely; this is their only chance to recover on this day.
 */
export function applyMatchToSquad(squad: Squad, appearances: MatchAppearances): Squad {
  return {
    ...squad,
    players: squad.players.map((p) => {
      const log = { ...(p.seasonLog ?? emptySeasonLog()) };
      const appearance = appearances.get(p.id);
      const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
      const updated = applyMatchFitness(log, { age: p.age, stamina }, appearance);
      return { ...p, seasonLog: { ...log, fitness: updated.fitness, load: updated.load } };
    }),
  };
}

/**
 * Apply `days` full rest days (no match, no training) to every player in the squad — each day is
 * the same `applyMatchFitness(..., undefined)` ("did not appear") call production uses for a
 * non-playing squad member, run `days` times in a row.
 */
export function applyRestDays(squad: Squad, days: number): Squad {
  if (days <= 0) return squad;
  return {
    ...squad,
    players: squad.players.map((p) => {
      let log = { ...(p.seasonLog ?? emptySeasonLog()) };
      const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
      for (let d = 0; d < days; d++) {
        const updated = applyMatchFitness(log, { age: p.age, stamina }, undefined);
        log = { ...log, fitness: updated.fitness, load: updated.load };
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
