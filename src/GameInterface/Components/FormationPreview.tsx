import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { shirtName } from "@/Domain/shirtName";
import { spreadSubsMarkers } from "@/Domain/formation/pitchMarkers";
import { reorganizedSlots } from "@/Domain/formation/reorganize";
import { getFormationSlots } from "@/types/formationSlots";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import type { Formation } from "@/GameEngine/types";
import type { GamePlayer } from "@/GameEngine/types";
import { gamePlayerNaturalRole, getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { FaceImage, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { PITCH_BOARD, PitchLinesVertical } from "@/GameInterface/Components/SubsPitchView";

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
    return [{ player, slot, role, natural, outOfPosition: natural !== role }];
  });
  return { rows, outOfPosition: rows.filter((r) => r.outOfPosition).length };
}

/** Height of the mini pitch, the same on every tab of the substitutions panel. */
export const PANEL_PITCH_HEIGHT = "h-[min(34rem,calc(100vh-18rem))]";

/**
 * Mini pitch of a formation with the current XI (attacking up), as in the substitutions tab. With `onPick` the players
 * are buttons (the instructions tab picks a slot on the pitch).
 */
export function FormationPreview({ players, formation, current, blocked, faceUrls, onPick, selectedSlot }: {
  players: GamePlayer[];
  formation: Formation;
  /** The formation in use (the players' slots belong to it). */
  current: Formation;
  /** Slots waiting for an injured player's replacement. */
  blocked?: readonly number[];
  faceUrls?: Record<string, string>;
  onPick?: (slot: number) => void;
  selectedSlot?: number | null;
}) {
  const { t } = useTranslation();
  const slotPos = useMemo(() => spreadSubsMarkers(getFormationSlots(formation)), [formation]);
  const { rows, outOfPosition } = formationPreview(players, formation, current, blocked);
  const abbr = (role: string) => t(`roles.detailedAbbr.${role}`, { defaultValue: role });

  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className={`relative ${PANEL_PITCH_HEIGHT} aspect-[3/4] rounded-md border border-chart-2/50`}>
        <div className="absolute inset-0 rounded-md overflow-hidden">
          {newVisualOn() && <img src={gameArtUrl(PITCH_BOARD)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />}
          <PitchLinesVertical grass={!newVisualOn()} />
        </div>
        {rows.map(({ player, slot, role, natural, outOfPosition: off }) => {
          const pos = slotPos[slot] ?? { x: 50, y: 50 };
          const roleClass = off ? "text-chart-4" : getDetailedPositionColor(role);
          const face = faceUrls?.[player.rosterId];
          const picked = onPick !== undefined && selectedSlot === slot;
          const Tag = onPick ? "button" : "div";
          return (
            <Tag
              key={player.id}
              {...(onPick ? { type: "button" as const, onClick: () => onPick(slot), "aria-pressed": picked } : {})}
              className={`absolute -translate-x-1/2 -translate-y-[35%] flex flex-col items-center gap-0.5 ${onPick ? "cursor-pointer rounded-md p-0.5 hover:bg-background/40" : "pointer-events-none"} ${picked ? "ring-2 ring-primary bg-background/50" : ""}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={off ? t("substitutionPanel.naturalRole", { role: abbr(natural) }) : undefined}
            >
              <span className="relative">
                {face ? (
                  <FaceImage src={face} size={32} fallback={playerInitials(player.name)} ringClassName={`border-2 border-current ${roleClass}`} />
                ) : (
                  <span className={`w-8 h-8 rounded-full border-2 border-current bg-secondary flex items-center justify-center ${roleClass}`}>
                    <span className="font-display text-sm text-foreground">{playerInitials(player.name)}</span>
                  </span>
                )}
                <span className={`absolute -top-2 -left-3 min-w-7 rounded border border-current bg-background/95 px-1 text-center font-display font-bold uppercase text-[13px] leading-tight ${roleClass}`}>
                  {abbr(role)}
                </span>
              </span>
              <span className="max-w-24 truncate rounded bg-background/85 px-1.5 text-sm leading-tight text-foreground">{shirtName(player.name)}</span>
            </Tag>
          );
        })}
      </div>
      <p className={`text-sm m-0 ${outOfPosition > 0 ? "text-chart-4" : "text-muted-foreground"}`}>
        {outOfPosition > 0
          ? t("substitutionPanel.previewOffPosition", { count: outOfPosition })
          : t("substitutionPanel.previewAllInPosition")}
      </p>
    </div>
  );
}
