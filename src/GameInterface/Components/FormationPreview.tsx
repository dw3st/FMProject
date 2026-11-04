import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { shirtName } from "@/Domain/shirtName";
import { spreadSubsMarkers } from "@/Domain/formation/pitchMarkers";
import { getFormationSlots } from "@/types/formationSlots";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import type { Formation } from "@/GameEngine/types";
import type { GamePlayer } from "@/GameEngine/types";
import { gamePlayerNaturalRole, getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { FaceImage, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { PITCH_BOARD, PitchLinesVertical } from "@/GameInterface/Components/SubsPitchView";

/**
 * What a formation change would do: each player on the pitch stays in his slot index and takes the
 * role of that slot in the new formation (`changeFormation`). `outOfPosition` counts the ones who
 * would leave their natural position.
 */
export function formationPreview(players: GamePlayer[], formation: Formation) {
  const rows = players.flatMap((player) => {
    const role = formation.attacking[player.slotIndex]?.role;
    if (!role) return [];
    const natural = gamePlayerNaturalRole({ role: player.role, fit: player.fit });
    return [{ player, role, natural, outOfPosition: natural !== role }];
  });
  return { rows, outOfPosition: rows.filter((r) => r.outOfPosition).length };
}

/** Mini pitch of a formation with the current XI (attacking up), as in the substitutions tab. */
export function FormationPreview({ players, formation, faceUrls }: {
  players: GamePlayer[];
  formation: Formation;
  faceUrls?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const slotPos = useMemo(() => spreadSubsMarkers(getFormationSlots(formation)), [formation]);
  const { rows, outOfPosition } = formationPreview(players, formation);
  const abbr = (role: string) => t(`roles.detailedAbbr.${role}`, { defaultValue: role });

  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className="relative h-[min(26rem,calc(100vh-20rem))] aspect-[3/4] rounded-md border border-chart-2/50">
        <div className="absolute inset-0 rounded-md overflow-hidden">
          {newVisualOn() && <img src={gameArtUrl(PITCH_BOARD)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />}
          <PitchLinesVertical grass={!newVisualOn()} />
        </div>
        {rows.map(({ player, role, natural, outOfPosition: off }) => {
          const pos = slotPos[player.slotIndex] ?? { x: 50, y: 50 };
          const roleClass = off ? "text-chart-4" : getDetailedPositionColor(role);
          const face = faceUrls?.[player.rosterId];
          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2 -translate-y-[35%] flex flex-col items-center gap-0.5 pointer-events-none"
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
            </div>
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
