import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { LiveMoments } from "@/GameInterface/World/LiveMoments";
import { liveGroups } from "@/Domain/rivals/taunts";
import { homeAwayOf } from "@/Domain/rivals/homeAway";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { LiveScoreView, RivalRow } from "@/types/rivalsTypes";

/**
 * The league's friends above the pitch of the user's own live match: playing now, "Fabio · [home] 1–0 [away] · 67'" (home /
 * away order); not playing, their next match "Fabio · next [home] × [away] · 3 Jan". A friend's goal lights his
 * line for a few seconds with the scorer; a click opens the banter actions without pausing the match.
 */
export function LiveRivalsStrip({ saveId, live, highlight, excludeClubIds = [] }: {
  saveId: string;
  live: LiveScoreView[];
  highlight: Record<string, true>;
  /** Clubs of the match being played here: a friend in it is not listed as "next match". */
  excludeClubIds?: string[];
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<RivalRow[]>([]);
  // Friends who are not playing right now still show their next match (report): reloaded every minute.
  useEffect(() => {
    let cancelled = false;
    const load = () => void rivalsApi.rivals(saveId).then((r) => { if (!cancelled && r.ok) setRows(r.data.rows); });
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [saveId]);
  const liveSeats = new Set(live.map((l) => l.seatId));
  const idle = rows.filter((r) => !r.me && !liveSeats.has(r.seatId) && !excludeClubIds.includes(r.clubId));
  if (live.length === 0 && idle.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-border bg-card/60 px-4 py-1.5" aria-label={t("rivals.stripLabel")} role="region">
      <ul className="m-0 p-0 list-none max-w-7xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className={`flex items-center gap-1.5 ${live.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
          {live.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden="true" />}
          <Icon name="radio" size={16} />
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">{t(live.length > 0 ? "rivals.liveBadge" : "rivals.friendsBadge")}</span>
        </li>
        {live.map((l) => {
          const lit = !!highlight[l.seatId];
          const sides = homeAwayOf(l);
          return (
            <li key={l.seatId} className="relative">
              <button
                type="button"
                onClick={() => setOpen(open === l.seatId ? null : l.seatId)}
                aria-expanded={open === l.seatId}
                className={`flex items-center gap-1.5 min-h-8 px-2 rounded border-0 cursor-pointer text-sm tabular-nums transition-colors ${lit ? "bg-primary/15 text-primary" : "bg-transparent text-foreground hover:bg-secondary/40"}`}
              >
                <span className="font-semibold">{l.nickname}</span>
                <span aria-hidden="true">·</span>
                <ClubLogo logoUrl={squadLogoUrl(sides.homeId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                <span title={`${sides.homeName} ${sides.home}–${sides.away} ${sides.awayName}`}>{sides.home}–{sides.away}</span>
                <ClubLogo logoUrl={squadLogoUrl(sides.awayId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                <span className="text-muted-foreground">· {l.status === "live" ? t("rivals.liveMinute", { minute: l.minute }) : t(`rivals.${l.status}Status`)}</span>
                {lit && <span className="font-display font-bold uppercase tracking-[0.08em]">· {l.lastGoal?.scorer ? t("rivals.scorer", { name: l.lastGoal.scorer }) : t("rivals.goalShort")}</span>}
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
        {idle.map((r) => {
          const n = r.next;
          const homeId = n ? (n.home ? r.clubId : n.opponentId) : null;
          const awayId = n ? (n.home ? n.opponentId : r.clubId) : null;
          return (
            <li key={r.seatId} className="flex items-center gap-1.5 min-h-8 px-2 text-sm tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{r.nickname ?? r.managerName}</span>
              <span aria-hidden="true">·</span>
              {n && homeId && awayId ? (
                <>
                  <span>{t("rivals.nextShort")}</span>
                  <ClubLogo logoUrl={squadLogoUrl(homeId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                  <span title={n.home ? `${r.clubName} × ${n.opponentName}` : `${n.opponentName} × ${r.clubName}`}>×</span>
                  <ClubLogo logoUrl={squadLogoUrl(awayId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                  <span>· {formatGameDate(n.date, i18n.language, "dayMonth")}</span>
                </>
              ) : (
                <>
                  <ClubLogo logoUrl={squadLogoUrl(r.clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                  <span>{t("rivals.noNext")}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
