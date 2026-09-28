import type { Fixture } from "@/types/calendarTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation } from "@/GameEngine/types";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { autoFillLineup, autoFillLineupWithFitness, buildSlotAlignedLineup } from "@/Domain/lineupHelpers";

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
 */
export function resolveUserLineup(squad: Squad, formation: Formation, savedLineup: string[]): string[] {
  const slots = slotsFor(formation);
  // No saved lineup (e.g. a career that never touched the formation screen) falls back to the same
  // fitness-aware auto-fill the AI uses, not the plain rating-only fill — a human's XI shouldn't
  // start a clearly-tired keeper/starter over a fresh bench player just because nobody ever saved
  // a lineup. See `docs/superpowers/specs/2026-09-27-stamina-design.md` §2.
  if (!savedLineup.length) return autoFillLineupWithFitness(slots, squad.players);
  const aligned = buildSlotAlignedLineup(squad.players, savedLineup);
  return aligned.map((p) => p?.id ?? "");
}

/** Detailed role per formation slot — index i is slot i, aligned with a slot-ordered lineup. */
export function slotRoles(formation: Formation): string[] {
  return slotsFor(formation).map((s) => s.role);
}

/** autoFillLineup for a given formation's slots. */
export function autoLineupForFormation(squad: Squad, formation: Formation): string[] {
  return autoFillLineup(slotsFor(formation), squad.players);
}

/** Default 4-3-3 + autoFillLineup — same as AI opponents in league matches and /simulate. */
export function autoLineupDefaultFormation(squad: Squad): string[] {
  return autoLineupForFormation(squad, formationForSimId(DEFAULT_SIM_FORMATION_ID));
}

/**
 * `autoLineupForFormation`, but resting a tired starter for a fresher bench player — see
 * `autoFillLineupWithFitness` and `docs/superpowers/specs/2026-09-27-stamina-design.md` §2. Used
 * for the AI/opponent XI actually put on the pitch for a match. NOT used by `clubLevel`
 * (`src/backend/continentalWorld.ts`) — a club's continental strength rating for qualification/pots
 * must stay fitness-independent — nor by the `/test` and `/lab` tooling (`QuickSimPanel`,
 * `SimulationScreen`, `balanceWorker`), which compare squads on their own terms.
 */
export function autoLineupForFormationWithFitness(squad: Squad, formation: Formation): string[] {
  return autoFillLineupWithFitness(slotsFor(formation), squad.players);
}

/** Default 4-3-3 + `autoFillLineupWithFitness` — the AI opponent's actual matchday XI. */
export function autoLineupDefaultFormationWithFitness(squad: Squad): string[] {
  return autoLineupForFormationWithFitness(squad, formationForSimId(DEFAULT_SIM_FORMATION_ID));
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
} {
  const defaultAi = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  const userPlays =
    Boolean(playerSquadId) && (fixture.home === playerSquadId || fixture.away === playerSquadId);

  if (!userPlays) {
    return {
      homeFormation: defaultAi,
      homeLineup: autoLineupDefaultFormationWithFitness(homeSquad),
      awayFormation: defaultAi,
      awayLineup: autoLineupDefaultFormationWithFitness(awaySquad),
    };
  }

  const t = tactics ?? ({
    formation: DEFAULT_SIM_FORMATION_ID,
    tactical_style: DEFAULT_TACTICAL_STYLE,
    lineup: [],
  } satisfies TacticsSave);

  const userFormation = formationForSimId(t.formation);

  if (fixture.home === playerSquadId) {
    return {
      homeFormation: userFormation,
      homeLineup: resolveUserLineup(homeSquad, userFormation, t.lineup ?? []),
      awayFormation: defaultAi,
      awayLineup: autoLineupDefaultFormationWithFitness(awaySquad),
    };
  }

  return {
    homeFormation: defaultAi,
    homeLineup: autoLineupDefaultFormationWithFitness(homeSquad),
    awayFormation: userFormation,
    awayLineup: resolveUserLineup(awaySquad, userFormation, t.lineup ?? []),
  };
}
