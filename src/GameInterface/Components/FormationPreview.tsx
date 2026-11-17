import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { shirtName } from "@/Domain/shirtName";
import { spreadSubsMarkers } from "@/Domain/formation/pitchMarkers";
import { reorganizedSlots } from "@/Domain/formation/reorganize";
import { getFormationSlots } from "@/types/formationSlots";
import type { Formation } from "@/GameEngine/types";
import type { GamePlayer } from "@/GameEngine/types";
import { gamePlayerNaturalRole, getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { displayRating10 } from "@/GameInterface/Components/SubsPitchView";
import { PanelPitch, PitchMarker } from "@/GameInterface/Components/SubsPanelLayout";

export { PANEL_PITCH_HEIGHT } from "@/GameInterface/Components/SubsPanelLayout";

/**
 * What a formation change would do: the team reorganises by the same rule as `changeFormation`
 * (the current formation itself shows everyone where he is). `outOfPosition` counts who would leave
 * his natural position.
 */
export function formationPreview(players: GamePlayer[], formation: Formation, current: Formation, blocked: readonly number[] = []) {
  const slotOf = formation.id === current.id
    ? new Map(players.map((p) => [p.id, p.slotIndex]))
    : reorganizedSlots(
      players.map((p) => ({ id: p.id, role: p.role, slotIndex: p.slotIndex, aptitudes: p.fit?.aptitudes })),
      current.attacking, formation.attacking, blocked,
    );
  const rows = players.flatMap((player) => {
    const slot = slotOf.get(player.id) ?? player.slotIndex;
    const role = formation.attacking[slot]?.role;
    if (!role) return [];
    const natural = gamePlayerNaturalRole({ role: player.role, fit: player.fit });
    // Out of position = a slot that needs training or worse, the same test as the substitutions tab (a wing-back at
    // full-back is fine). Without aptitudes, the slot differs from his natural role.
    const apt = player.fit?.aptitudes[role];
    const off = player.fit ? apt !== "natural" && apt !== "apt" : natural !== role;
    return [{ player, slot, role, natural, outOfPosition: off }];
  });
  return { rows, outOfPosition: rows.filter((r) => r.outOfPosition).length };
}

/**
 * Mini pitch of a formation with the current XI (attacking up), the same pitch and marker as the substitutions tab.
 * With `onPick` the players are buttons (the instructions tab picks a slot on the pitch).
 */
export function FormationPreview({ players, formation, current, blocked, faceUrls, ratings, onPick, selectedSlot }: {
  players: GamePlayer[];
  formation: Formation;
  /** The formation in use (the players' slots belong to it). */
  current: Formation;
  /** Slots waiting for an injured player's replacement. */
  blocked?: readonly number[];
  faceUrls?: Record<string, string>;
  /** Live match ratings keyed by engine id (the number on each marker). */
  ratings?: Record<number, number>;
  onPick?: (slot: number) => void;
  selectedSlot?: number | null;
}) {
  const { t } = useTranslation();
  const slotPos = useMemo(() => spreadSubsMarkers(getFormationSlots(formation)), [formation]);
  const { rows, outOfPosition } = formationPreview(players, formation, current, blocked);
  const abbr = (role: string) => t(`roles.detailedAbbr.${role}`, { defaultValue: role });

  return (
    <PanelPitch
      note={outOfPosition > 0
        ? t("substitutionPanel.previewOffPosition", { count: outOfPosition })
        : t("substitutionPanel.previewAllInPosition")}
      noteWarn={outOfPosition > 0}
    >
      {rows.map(({ player, slot, role, natural, outOfPosition: off }) => {
        const pos = slotPos[slot] ?? { x: 50, y: 50 };
        const picked = onPick !== undefined && selectedSlot === slot;
        const marker = (
          <PitchMarker
            name={player.name}
            shortName={shirtName(player.name)}
            roleLabel={abbr(role)}
            roleClass={off ? "text-chart-4" : getDetailedPositionColor(role)}
            {...(off ? { roleTitle: t("substitutionPanel.naturalRole", { role: abbr(natural) }) } : {})}
            {...(faceUrls?.[player.rosterId] ? { face: faceUrls[player.rosterId] } : {})}
            rating={displayRating10(player, ratings)}
            energy={player.energy}
            selected={picked}
            fitnessTitle={t("substitutionPanel.fitnessTitle", { value: Math.round(player.energy) })}
          />
        );
        const place = { left: `${pos.x}%`, top: `${pos.y}%` };
        const base = "absolute -translate-x-1/2 -translate-y-[35%] flex flex-col items-center gap-1";
        return onPick ? (
          <button
            key={player.id}
            type="button"
            onClick={() => onPick(slot)}
            aria-pressed={picked}
            aria-label={`${abbr(role)} ${player.name}`}
            className={`${base} bg-transparent border-0 p-0 cursor-pointer select-none ${picked ? "z-20" : "z-10 hover:brightness-110"}`}
            style={place}
          >
            {marker}
          </button>
        ) : (
          <div key={player.id} className={`${base} pointer-events-none`} style={place}>
            {marker}
          </div>
        );
      })}
    </PanelPitch>
  );
}
