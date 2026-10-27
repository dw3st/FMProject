import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { LiveMoments } from "@/GameInterface/World/LiveMoments";
import { liveGroups } from "@/Domain/rivals/taunts";
import type { LiveScoreView } from "@/types/rivalsTypes";

/**
 * Friends playing now, above the pitch of the user's own live match: "Fabio · 1–0 · 67'". A friend's goal lights his
 * line for a few seconds with the scorer; a click opens the banter actions without pausing the match.
 */
export function LiveRivalsStrip({ saveId, live, highlight }: {
  saveId: string;
  live: LiveScoreView[];
  highlight: Record<string, true>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  if (live.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-border bg-card/60 px-4 py-1.5" aria-label={t("rivals.stripLabel")} role="region">
      <ul className="m-0 p-0 list-none max-w-7xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="flex items-center gap-1.5 text-destructive">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden="true" />
          <Icon name="radio" size={16} />
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">{t("rivals.liveBadge")}</span>
        </li>
        {live.map((l) => {
          const lit = !!highlight[l.seatId];
          return (
            <li key={l.seatId} className="relative">
              <button
                type="button"
                onClick={() => setOpen(open === l.seatId ? null : l.seatId)}
                aria-expanded={open === l.seatId}
                className={`flex items-center gap-1.5 min-h-8 px-2 rounded border-0 cursor-pointer text-sm tabular-nums transition-colors ${lit ? "bg-primary/15 text-primary" : "bg-transparent text-foreground hover:bg-secondary/40"}`}
              >
                <ClubLogo logoUrl={squadLogoUrl(l.clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                <span className="font-semibold">{l.nickname}</span>
                <span>· {l.score.for}–{l.score.against}</span>
                <span className="text-muted-foreground">· {l.status === "live" ? t("rivals.liveMinute", { minute: l.minute }) : t(`rivals.${l.status}Status`)}</span>
                {lit && l.lastGoal?.scorer && <span>· {t("rivals.scorer", { name: l.lastGoal.scorer })}</span>}
              </button>
              {open === l.seatId && (
                <div className="absolute left-0 top-full mt-1 z-[60] w-[320px] rounded-md border border-border bg-card shadow-lg p-3 flex flex-col gap-3">
                  <LiveMoments live={l} />
                  <div className="border-t border-border pt-2">
                    <TauntActions saveId={saveId} target={{ live: l.seatId }} groups={liveGroups(l)} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
