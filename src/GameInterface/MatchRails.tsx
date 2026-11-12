import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GamePlayer } from "@/GameEngine/types";
import { gamePlayerNaturalRole } from "@/GameInterface/positionHelpers";
import { energyTextClass } from "@/GameInterface/TeamPanel";
import { FEED_KIND_MARK, type MatchFeedItem } from "@/GameInterface/MatchSummaryPanel";
import { shirtName } from "@/Domain/shirtName";

/**
 * The live match's side rails (10.9): with the team list and the summary floating over the pitch, a thin rail at each
 * edge stays in view (position and fitness on the left, the last events on the right). Pointing at a rail opens the
 * whole panel over the pitch; a click keeps it open.
 */
export const RAIL_EVENTS = 8;

function Rail({ side, title, hint, onOpen, onPin, children }: {
  side: "left" | "right"; title: string; hint: string; onOpen: () => void; onPin: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      onMouseEnter={onOpen}
      onClick={onPin}
      className={`absolute top-1/2 -translate-y-1/2 z-20 ${side === "left" ? "left-2" : "right-2"} phone:hidden flex flex-col items-stretch rounded-lg border border-border bg-background/80 backdrop-blur-sm px-2 pb-2 pt-1.5 cursor-pointer text-left hover:border-primary/50`}
    >
      <span className="block text-center font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground pb-1.5 mb-1 border-b border-border">
        {title}
      </span>
      {children}
    </button>
  );
}

/** Left rail: position and fitness of every player of the shown team on the pitch. */
export function LineupRail({ players, ballHolderId, onOpen, onPin }: {
  players: GamePlayer[]; ballHolderId: number; onOpen: () => void; onPin: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Rail side="left" title={t("match.phone.team")} hint={t("match.rails.openTeam")} onOpen={onOpen} onPin={onPin}>
      {players.map((p) => {
        const role = gamePlayerNaturalRole(p);
        const energy = Math.max(0, Math.min(100, p.energy));
        return (
          <span
            key={p.id}
            className={`flex items-center justify-between gap-3 h-7 px-1.5 rounded ${p.id === ballHolderId ? "bg-primary/15" : ""}`}
          >
            <span className="font-display font-bold uppercase text-[13px] text-muted-foreground">
              {t(`roles.detailedAbbr.${role}`, { defaultValue: role })}
            </span>
            <span className={`font-display font-bold text-base tabular-nums ${energyTextClass(energy)}`}>{Math.round(energy)}</span>
          </span>
        );
      })}
    </Rail>
  );
}

/** Right rail: minute and kind of the last events, newest first. */
export function SummaryRail({ feed, onOpen, onPin }: { feed: MatchFeedItem[]; onOpen: () => void; onPin: () => void }) {
  const { t } = useTranslation();
  const last = feed.slice(-RAIL_EVENTS).reverse();
  return (
    <Rail side="right" title={t("match.phone.summary")} hint={t("match.rails.openSummary")} onOpen={onOpen} onPin={onPin}>
      {last.length === 0 && <span className="h-7 px-1.5 flex items-center text-sm text-muted-foreground">{t("match.rails.noEvents")}</span>}
      {last.map((e, i) => {
        const card = e.kind === "yellow" || e.kind === "red" || e.kind === "managerYellow" || e.kind === "managerRed";
        return (
          <span
            key={`${feed.length - i}`}
            className="flex items-center gap-2.5 h-7 px-1.5"
            title={t(`match.summary.kind.${e.kind}`, { player: e.player ? shirtName(e.player) : "", playerIn: e.playerIn ? shirtName(e.playerIn) : "", what: e.what ?? "" })}
          >
            <span className={`shrink-0 ${card ? "w-2.5 h-3.5 rounded-[2px]" : "w-2.5 h-2.5 rounded-full"} ${FEED_KIND_MARK[e.kind]}`} aria-hidden />
            <span className="font-display font-bold text-base tabular-nums text-foreground">{e.minute}'</span>
          </span>
        );
      })}
    </Rail>
  );
}
