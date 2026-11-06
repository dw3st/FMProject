import { useTranslation } from "react-i18next";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import { ATTRIBUTE_GROUPS } from "@/Domain/scout/scoutFilterState";
import { attrDisplay } from "@/Domain/attributes";
import { seenAttributeRange, rangeMid } from "@/Domain/scouting/seen";
import { PlayerFace } from "@/GameInterface/Components/PlayerFace";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { attributeBarClass, attributeTextClass } from "@/GameInterface/scoreColors";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";

export const HOVER_CARD_WIDTH = 360;

/**
 * Floating card of a scout row (tester report, option A of the mock of 2026-11-06): face, position, age, club, overall
 * and the attributes in bars, grouped like the filters. Only what the scout sees: a blurred attribute shows the middle
 * of its range in the bar and the range as text, hidden attributes show "?". Never interactive (pointer-events none).
 */
export function ScoutHoverCard({ player, x, y }: { player: DisplayPlayer; x: number; y: number }) {
  const { t } = useTranslation();
  const isGk = player.natural === "GK" || player.pos === "GK";
  const groups = ATTRIBUTE_GROUPS.filter((g) => (isGk ? g.id !== "attack" : g.id !== "goalkeeper"));
  if (isGk) groups.sort((a, b) => (a.id === "goalkeeper" ? -1 : b.id === "goalkeeper" ? 1 : 0));
  return (
    <div
      role="tooltip"
      style={{ left: x, top: y, width: HOVER_CARD_WIDTH }}
      className="fixed z-50 pointer-events-none rounded-md border border-border bg-card shadow-2xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <PlayerFace playerId={player.id} nationality={player.ownNationality} size={48} fallback={player.name.slice(0, 1)} />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-display font-black uppercase text-xl leading-none truncate">{player.name}</span>
          <span className="text-sm text-muted-foreground truncate">
            <span className={`font-bold ${positionLabelColor(player.natural, player.pos)}`}>{positionLabel(t, player.natural, player.pos)}</span>
            {" · "}{t("scout.hover.age", { age: player.age })}{player.club ? ` · ${player.club}` : ""}
          </span>
        </div>
        <div className="ml-auto shrink-0"><AvgBadge value={player.avg} range={player.avgRange} /></div>
      </div>
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-1">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
            {t(`scout.attributeFilters.groups.${g.id}`)}
          </span>
          <div className="flex flex-col gap-0.5">
            {g.attributes.map((id) => {
              const raw = player.stats[id] ?? 0;
              const range = player.hiddenAttrs ? null : seenAttributeRange(raw, player.statNoise);
              const shown = attrDisplay(range ? rangeMid(range) : raw);
              const text = player.hiddenAttrs ? "?" : range ? `${attrDisplay(range[0])}–${attrDisplay(range[1])}` : String(shown);
              return (
                <div key={id} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                  <span className="text-muted-foreground truncate">{t(`attributeNames.${id}`)}</span>
                  <span className="h-1.5 rounded bg-border overflow-hidden" aria-hidden>
                    {!player.hiddenAttrs && <span className={`block h-full rounded ${attributeBarClass(shown)}`} style={{ width: `${Math.min(100, shown)}%` }} />}
                  </span>
                  <span className={`font-bold tabular-nums text-right ${player.hiddenAttrs ? "text-muted-foreground" : attributeTextClass(shown)}`}>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {(player.knowledge !== undefined || player.grade) && (
        <span className="text-sm text-muted-foreground tabular-nums">
          {player.knowledge !== undefined && t("scout.hover.knowledge", { value: Math.round(player.knowledge) })}
          {player.knowledge !== undefined && player.grade ? " · " : ""}
          {player.grade && t("scout.hover.grade", { grade: player.grade })}
        </span>
      )}
    </div>
  );
}
