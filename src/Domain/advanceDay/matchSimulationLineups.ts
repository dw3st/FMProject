import type { Fixture } from "@/types/calendarTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation } from "@/GameEngine/types";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { autoFillLineup, buildSlotAlignedLineup } from "@/Domain/lineupHelpers";

function slotsFor(formation: Formation): ReturnType<typeof getFormationSlots> {
  return getFormationSlots(formation as unknown as FormationShape, "attacking");
}

function resolveUserLineup(squad: Squad, formation: Formation, savedLineup: string[]): string[] {
  const slots = slotsFor(formation);
  if (!savedLineup.length) return autoFillLineup(slots, squad.players);
  const aligned = buildSlotAlignedLineup(squad.players, savedLineup);
  return aligned.map((p) => p?.id ?? "");
}

/** Default 4-3-3 + autoFillLineup — same as AI opponents in league matches and /simulate. */
export function autoLineupDefaultFormation(squad: Squad): string[] {
  const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  return autoFillLineup(slotsFor(formation), squad.players);
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
    const hSlots = slotsFor(defaultAi);
    const aSlots = slotsFor(defaultAi);
    return {
      homeFormation: defaultAi,
      homeLineup: autoFillLineup(hSlots, homeSquad.players),
      awayFormation: defaultAi,
      awayLineup: autoFillLineup(aSlots, awaySquad.players),
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
      awayLineup: autoLineupDefaultFormation(awaySquad),
    };
  }

  return {
    homeFormation: defaultAi,
    homeLineup: autoLineupDefaultFormation(homeSquad),
    awayFormation: userFormation,
    awayLineup: resolveUserLineup(awaySquad, userFormation, t.lineup ?? []),
  };
}
