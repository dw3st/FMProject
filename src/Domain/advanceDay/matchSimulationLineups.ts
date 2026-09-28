import type { Fixture } from "@/types/calendarTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation } from "@/GameEngine/types";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import {
  autoFillLineup,
  autoFillLineupWithFitness,
  buildSlotAlignedLineup,
  replaceInjuredStarters,
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
 * any starter injured on `date` for the best eligible bench player (`replaceInjuredStarters`) — a
 * saved lineup can go stale between the day it was saved and the day the fixture is played.
 * `injuredReplaced` lists any such swaps so a preview screen can warn the user.
 */
export function resolveUserLineup(
  squad: Squad,
  formation: Formation,
  savedLineup: string[],
  date?: string,
): { lineup: string[]; injuredReplaced: InjuredReplacement[] } {
  const slots = slotsFor(formation);
  // No saved lineup (e.g. a career that never touched the formation screen) falls back to the same
  // fitness-aware auto-fill the AI uses, not the plain rating-only fill — a human's XI shouldn't
  // start a clearly-tired keeper/starter over a fresh bench player just because nobody ever saved
  // a lineup. See `docs/superpowers/specs/2026-09-27-stamina-design.md` §2.
  if (!savedLineup.length) {
    return { lineup: autoFillLineupWithFitness(slots, squad.players, date), injuredReplaced: [] };
  }
  const aligned = buildSlotAlignedLineup(squad.players, savedLineup);
  const lineup = aligned.map((p) => p?.id ?? "");
  if (!date) return { lineup, injuredReplaced: [] };
  const { lineup: fixed, replaced } = replaceInjuredStarters(slots, lineup, squad.players, date);
  return { lineup: fixed, injuredReplaced: replaced };
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
): {
  homeFormation: Formation;
  homeLineup: string[];
  awayFormation: Formation;
  awayLineup: string[];
  /** Any of the human's saved-lineup starters swapped out for being injured on `fixture.date`. */
  userInjuredReplaced: InjuredReplacement[];
} {
  const date = fixture.date;
  const defaultAi = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  const userPlays =
    Boolean(playerSquadId) && (fixture.home === playerSquadId || fixture.away === playerSquadId);

  if (!userPlays) {
    return {
      homeFormation: defaultAi,
      homeLineup: autoLineupDefaultFormationWithFitness(homeSquad, date),
      awayFormation: defaultAi,
      awayLineup: autoLineupDefaultFormationWithFitness(awaySquad, date),
      userInjuredReplaced: [],
    };
  }

  const t = tactics ?? ({
    formation: DEFAULT_SIM_FORMATION_ID,
    tactical_style: DEFAULT_TACTICAL_STYLE,
    lineup: [],
  } satisfies TacticsSave);

  const userFormation = formationForSimId(t.formation);

  if (fixture.home === playerSquadId) {
    const user = resolveUserLineup(homeSquad, userFormation, t.lineup ?? [], date);
    return {
      homeFormation: userFormation,
      homeLineup: user.lineup,
      awayFormation: defaultAi,
      awayLineup: autoLineupDefaultFormationWithFitness(awaySquad, date),
      userInjuredReplaced: user.injuredReplaced,
    };
  }

  const user = resolveUserLineup(awaySquad, userFormation, t.lineup ?? [], date);
  return {
    homeFormation: defaultAi,
    homeLineup: autoLineupDefaultFormationWithFitness(homeSquad, date),
    awayFormation: userFormation,
    awayLineup: user.lineup,
    userInjuredReplaced: user.injuredReplaced,
  };
}
