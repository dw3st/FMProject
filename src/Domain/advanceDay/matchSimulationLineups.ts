import type { Fixture } from "@/types/calendarTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { Squad } from "@/types/playerTypes";
import type { TeamTactics } from "@/GameEngine/Domain/SimulateMatch";
import type { Formation } from "@/GameEngine/types";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId, formationForTactics } from "@/Domain/matchFormations";
import {
  autoFillLineup,
  autoFillLineupWithFitness,
  buildSlotAlignedLineup,
  replaceUnavailableStarters,
  suggestRotation,
  applyRotation,
  type InjuredReplacement,
} from "@/Domain/lineupHelpers";

function slotsFor(formation: Formation): ReturnType<typeof getFormationSlots> {
  return getFormationSlots(formation as unknown as FormationShape, "attacking");
}

/**
 * Resolves the lineup a human club actually takes to a match: the saved lineup when there is one,
 * otherwise the same fitness-aware auto-fill the AI uses. Exported so `/api/match-setup`
 * (`src/backend/routes.ts`) can fill in an empty saved lineup the exact same way for a LIVE match
 * — before this, a save that never touched the formation screen fell straight through to
 * `pickForRole` per slot (no fitness awareness at all) for a live match, while this headless path
 * (used when the human's fixture is resolved without the match screen) already fell back here.
 *
 * `date`, when given, excludes injured players from an auto-fill and, for a SAVED lineup, swaps out
 * any starter injured on `date` for the best eligible bench player (`replaceUnavailableStarters`) — a
 * saved lineup can go stale between the day it was saved and the day the fixture is played.
 * `injuredReplaced` lists any such swaps so a preview screen can warn the user.
 */
export interface RotationOverride {
  date: string;
  swaps: { out: string; in: string }[];
  optOut?: boolean;
}

export function resolveUserLineup(
  squad: Squad,
  formation: Formation,
  savedLineup: string[],
  date?: string,
  rotation?: { assistantRotation?: boolean; override?: RotationOverride | null },
): {
  lineup: string[];
  injuredReplaced: InjuredReplacement[];
  /** Tired-starter swaps NOT applied (the user may accept them on the preview). */
  rotationSuggestion: { out: string; in: string }[];
  /** Tired-starter swaps already applied (assistant on, or accepted override). */
  rotationApplied: { out: string; in: string }[];
} {
  const slots = slotsFor(formation);
  // No saved lineup (e.g. a career that never touched the formation screen) falls back to the same
  // fitness-aware auto-fill the AI uses, not the plain rating-only fill. See
  // `docs/superpowers/specs/2026-09-27-stamina-design.md` section 2.
  if (!savedLineup.length) {
    return {
      lineup: autoFillLineupWithFitness(slots, squad.players, date),
      injuredReplaced: [],
      rotationSuggestion: [],
      rotationApplied: [],
    };
  }
  const aligned = buildSlotAlignedLineup(squad.players, savedLineup);
  const lineup = aligned.map((p) => p?.id ?? "");
  if (!date) return { lineup, injuredReplaced: [], rotationSuggestion: [], rotationApplied: [] };
  const { lineup: fixed, replaced } = replaceUnavailableStarters(slots, lineup, squad.players, date);

  const suggestions = suggestRotation(slots, fixed, squad.players, date);
  const override = rotation?.override?.date === date ? rotation.override : null;
  let applied: { out: string; in: string }[] = [];
  let pending = suggestions;
  if (override) {
    applied = override.optOut ? [] : override.swaps.filter((s) => fixed.includes(s.out));
    const appliedOut = new Set(applied.map((s) => s.out));
    pending = suggestions.filter((s) => !appliedOut.has(s.out));
  } else if (rotation?.assistantRotation) {
    applied = suggestions;
    pending = [];
  }
  return {
    lineup: applyRotation(fixed, applied),
    injuredReplaced: replaced,
    rotationSuggestion: pending,
    rotationApplied: applied,
  };
}

/** Detailed role per formation slot — index i is slot i, aligned with a slot-ordered lineup. */
export function slotRoles(formation: Formation): string[] {
  return slotsFor(formation).map((s) => s.role);
}

/**
 * autoFillLineup for a given formation's slots. `date`, when given, excludes players injured on
 * that date — omitted by `clubLevel` (`src/backend/continentalWorld.ts`, a fitness/injury-
 * independent strength rating) and by `/test`/`/lab` tooling, which compare squads on their own
 * terms regardless of any specific matchday.
 */
export function autoLineupForFormation(squad: Squad, formation: Formation, date?: string): string[] {
  return autoFillLineup(slotsFor(formation), squad.players, date);
}

/** Default 4-3-3 + autoFillLineup — same as AI opponents in league matches and /simulate. */
export function autoLineupDefaultFormation(squad: Squad, date?: string): string[] {
  return autoLineupForFormation(squad, formationForSimId(DEFAULT_SIM_FORMATION_ID), date);
}

/**
 * `autoLineupForFormation`, but resting a tired starter for a fresher bench player — see
 * `autoFillLineupWithFitness` and `docs/superpowers/specs/2026-09-27-stamina-design.md` §2. Used
 * for the AI/opponent XI actually put on the pitch for a match. NOT used by `clubLevel`
 * (`src/backend/continentalWorld.ts`) — a club's continental strength rating for qualification/pots
 * must stay fitness-independent — nor by the `/test` and `/lab` tooling (`QuickSimPanel`,
 * `SimulationScreen`, `balanceWorker`), which compare squads on their own terms. `date`, when
 * given, also excludes injured players from the whole candidate pool (starters and bench).
 */
export function autoLineupForFormationWithFitness(
  squad: Squad,
  formation: Formation,
  date?: string,
): string[] {
  return autoFillLineupWithFitness(slotsFor(formation), squad.players, date);
}

/** Default 4-3-3 + `autoFillLineupWithFitness` — the AI opponent's actual matchday XI. */
export function autoLineupDefaultFormationWithFitness(squad: Squad, date?: string): string[] {
  return autoLineupForFormationWithFitness(squad, formationForSimId(DEFAULT_SIM_FORMATION_ID), date);
}

/**
 * Resolves engine formations and per-slot lineups for a fixture.
 * Human club uses saved tactics + lineup; the opponent uses default 4-3-3 with autoFillLineup.
 * Non-player fixtures use default + auto for both sides.
 */
export function computeMatchSimulationLineups(
  fixture: Fixture,
  homeSquad: Squad,
  awaySquad: Squad,
  playerSquadId: string | undefined,
  tactics: TacticsSave | null,
  rotationOverride?: RotationOverride | null,
): {
  homeFormation: Formation;
  homeLineup: string[];
  awayFormation: Formation;
  awayLineup: string[];
  /** Any of the human's saved-lineup starters swapped out for being injured on `fixture.date`. */
  userInjuredReplaced: InjuredReplacement[];
  userRotationApplied: { out: string; in: string }[];
  /** Tactics per engine side (A = home): the user's saved style/axes, the AI's default style. */
  tactics: { A: TeamTactics; B: TeamTactics };
} {
  const date = fixture.date;
  const defaultAi = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  const aiTactics: TeamTactics = { style: DEFAULT_TACTICAL_STYLE };
  const userPlays =
    Boolean(playerSquadId) && (fixture.home === playerSquadId || fixture.away === playerSquadId);

  if (!userPlays) {
    return {
      homeFormation: defaultAi,
      homeLineup: autoLineupDefaultFormationWithFitness(homeSquad, date),
      awayFormation: defaultAi,
      awayLineup: autoLineupDefaultFormationWithFitness(awaySquad, date),
      userInjuredReplaced: [],
      userRotationApplied: [],
      tactics: { A: aiTactics, B: aiTactics },
    };
  }

  const t = tactics ?? ({
    formation: DEFAULT_SIM_FORMATION_ID,
    tactical_style: DEFAULT_TACTICAL_STYLE,
    lineup: [],
  } satisfies TacticsSave);

  const userFormation = formationForTactics(t);
  const userTactics: TeamTactics = {
    style: t.tactical_style,
    axesOverride: t.axesOverride,
    ...(t.setPieceTakers ? { setPieceTakers: t.setPieceTakers } : {}),
  };
  const rot = { assistantRotation: t.assistantRotation, override: rotationOverride };

  if (fixture.home === playerSquadId) {
    const user = resolveUserLineup(homeSquad, userFormation, t.lineup ?? [], date, rot);
    return {
      homeFormation: userFormation,
      homeLineup: user.lineup,
      awayFormation: defaultAi,
      awayLineup: autoLineupDefaultFormationWithFitness(awaySquad, date),
      userInjuredReplaced: user.injuredReplaced,
      userRotationApplied: user.rotationApplied,
      tactics: { A: userTactics, B: aiTactics },
    };
  }

  const user = resolveUserLineup(awaySquad, userFormation, t.lineup ?? [], date, rot);
  return {
    homeFormation: defaultAi,
    homeLineup: autoLineupDefaultFormationWithFitness(homeSquad, date),
    awayFormation: userFormation,
    awayLineup: user.lineup,
    userInjuredReplaced: user.injuredReplaced,
    userRotationApplied: user.rotationApplied,
    tactics: { A: aiTactics, B: userTactics },
  };
}
