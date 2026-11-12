import type { LiveFlash } from "@/GameInterface/World/useLiveRivals";
import { rivalNextOpponent } from "@/GameInterface/World/rivalNext";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { LiveMoments } from "@/GameInterface/World/LiveMoments";
import { WatchButton } from "@/GameInterface/Watch/WatchButton";
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
export function LiveRivalsStrip({ saveId, live, highlight, viewers = [], excludeClubIds = [], footer = false }: {
  /** In the game frame's footer (8.8.10): one line, and each friend's moments open above the bar. */
  footer?: boolean;
  saveId: string;
  live: LiveScoreView[];
  highlight: Record<string, LiveFlash>;
  /** Who is watching this broadcast now (multiplayer part 8). */
  viewers?: string[];
  /** Clubs of the match being played here: a friend in it is not listed as "next match". */
  excludeClubIds?: string[];
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  // In the footer the bar clips what overflows: the moments open fixed, just above it, at the friend's line.
  const [openLeft, setOpenLeft] = useState(0);
  const [rows, setRows] = useState<RivalRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Footer (8.9.3): how many friends fit on the line; the rest open from "+N" (left of the list, px), never a scrollbar.
  const [shown, setShown] = useState(Number.POSITIVE_INFINITY);
  const [moreLeft, setMoreLeft] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!footer || !ul) return;
    const measure = () => {
      const items = [...ul.querySelectorAll<HTMLElement>("li[data-friend]")];
      const cut = items.find((li) => li.offsetLeft + li.offsetWidth > ul.clientWidth);
      const n = cut ? Number(cut.dataset.friend) : items.length;
      setShown((v) => (v === n ? v : n));
    };
    measure();
    // The strip is drawn into the frame's footer from the match iframe: observe with the footer's own window.
    const RO = (ul.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver ?? ResizeObserver;
    const ro = new RO(measure);
    ro.observe(ul);
    return () => ro.disconnect();
  });
  // Friends who are not playing right now still show their next match (report): reloaded every minute.
  useEffect(() => {
    let cancelled = false;
    const load = () => void rivalsApi.rivals(saveId).then((r) => { if (cancelled) return; setLoaded(true); if (r.ok) setRows(r.data.rows); });
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [saveId]);
  const liveSeats = new Set(live.map((l) => l.seatId));
  const idle = rows.filter((r) => !r.me && !liveSeats.has(r.seatId) && !excludeClubIds.includes(r.clubId));
  // Kept while loading: the strip showing up later would push the pitch down.
  if (loaded && live.length === 0 && idle.length === 0 && viewers.length === 0) return null;
  const liveBody = (l: LiveScoreView) => {
    const lit = highlight[l.seatId];
    const sides = homeAwayOf(l);
    return (<>
              <button
                type="button"
                onClick={(e) => { setOpenLeft(e.currentTarget.getBoundingClientRect().left); setOpen(open === l.seatId ? null : l.seatId); }}
                aria-expanded={open === l.seatId}
                className={`flex items-center gap-1.5 min-h-8 px-2 rounded border-0 cursor-pointer text-sm tabular-nums transition-colors ${lit === "managerRed" ? "bg-destructive/15 text-destructive" : lit ? "bg-primary/15 text-primary" : "bg-transparent text-foreground hover:bg-secondary/40"}`}
              >
                <span className="font-semibold">{l.nickname}</span>
                <span aria-hidden="true">·</span>
                <ClubLogo title={sides.homeName} logoUrl={squadLogoUrl(sides.homeId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                <span title={`${sides.homeName} ${sides.home}–${sides.away} ${sides.awayName}`}>{sides.home}–{sides.away}</span>
                <ClubLogo title={sides.awayName} logoUrl={squadLogoUrl(sides.awayId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                {sides.aggregate && <span className="text-muted-foreground">({t("rivals.aggregateShort", { home: sides.aggregate.home, away: sides.aggregate.away })})</span>}
                <span className="text-muted-foreground">· {l.status === "live" ? t("rivals.liveMinute", { minute: l.minute }) : t(`rivals.${l.status}Status`)}</span>
                {lit && <span className="font-display font-bold uppercase tracking-[0.08em]">· {lit === "managerRed" ? t("rivals.managerSentOff") : l.lastGoal?.scorer ? t("rivals.scorer", { name: l.lastGoal.scorer }) : t("rivals.goalShort")}</span>}
              </button>
              {open === l.seatId && (
                <div
                  className={`${footer ? "fixed bottom-14" : "absolute left-0 top-full mt-1"} z-[60] w-[320px] rounded-md border border-border bg-card shadow-lg p-3 flex flex-col gap-3 whitespace-normal`}
                  style={footer ? { left: Math.max(8, Math.min(openLeft, window.innerWidth - 328)) } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    aria-label={t("common.close")}
                    title={t("common.close")}
                    className="absolute top-1 right-1 w-8 h-8 flex items-center justify-center rounded border-0 bg-transparent text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Icon name="close" size={16} />
                  </button>
                  <LiveMoments live={l} />
                  <div className="flex"><WatchButton live={l} saveId={saveId} /></div>
                  <div className="border-t border-border pt-2">
                    <TauntActions saveId={saveId} target={{ live: l.seatId }} groups={liveGroups(l)} />
                  </div>
                </div>
              )}
</>);
  };
  const idleBody = (r: RivalRow) => {
    const n = r.next;
          const homeId = n ? (n.home ? r.clubId : n.opponentId) : null;
          const awayId = n ? (n.home ? n.opponentId : r.clubId) : null;
    return (<>
              <span className="font-semibold text-foreground">{r.nickname ?? r.managerName}</span>
              <span aria-hidden="true">·</span>
              {n?.national ? (
                // A game of his national team: names, no club crests (tester report, 8.8.7)
                <span>{t("rivals.nextShort")} {rivalNextOpponent(n, i18n.language, t)} · {formatGameDate(n.date, i18n.language, "dayMonth")}</span>
              ) : n && homeId && awayId ? (
                <>
                  <span>{t("rivals.nextShort")}</span>
                  <ClubLogo title={n.home ? r.clubName ?? undefined : n.opponentName} logoUrl={squadLogoUrl(homeId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                  <span title={n.home ? `${r.clubName} × ${n.opponentName}` : `${n.opponentName} × ${r.clubName}`}>×</span>
                  <ClubLogo title={n.home ? n.opponentName : r.clubName ?? undefined} logoUrl={squadLogoUrl(awayId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                  <span>· {formatGameDate(n.date, i18n.language, "dayMonth")}</span>
                </>
              ) : (
                <>
                  <ClubLogo title={r.clubName ?? undefined} logoUrl={squadLogoUrl(r.clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                  <span>{t("rivals.noNext")}</span>
                </>
              )}
</>);
  };
  const IDLE_LI = "flex items-center gap-1.5 min-h-8 px-2 text-sm tabular-nums text-muted-foreground";
  const items: { key: string; className: string; body: ReactNode }[] = [
    ...live.map((l) => ({ key: l.seatId, className: "relative", body: liveBody(l) })),
    ...idle.map((r) => ({ key: r.seatId, className: IDLE_LI, body: idleBody(r) })),
  ];
  const hiddenCount = footer && shown < items.length ? items.length - shown : 0;
  // In the footer each friend is set apart like everything else on the bar (8.8.27).
  const sep = (i: number) => (footer ? <li aria-hidden="true" className={`w-px h-5 bg-border shrink-0 ${i >= shown ? "invisible" : ""}`} /> : null);
  return (
    <div className={footer ? "h-full w-full min-w-0 flex items-center" : "shrink-0 border-b border-border bg-card/60 px-4 py-1.5"} aria-label={t("rivals.stripLabel")} role="region">
      {/* The space on the right is always kept: someone joining or leaving never moves the strip or the pitch below (tester report). */}
      <div className={footer ? "w-full min-w-0 flex items-center gap-4" : "relative max-w-7xl mx-auto"}>
      {viewers.length > 0 && !footer && (
        <div role="status" title={viewers.join(", ")} className="absolute right-0 top-0 h-8 w-60 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Icon name="eye" size={16} className="text-primary shrink-0" />
          <span className="truncate">{t("watch.viewers", { count: viewers.length, names: viewers.join(", ") })}</span>
        </div>
      )}
      <ul ref={listRef} className={footer ? "relative min-w-0 flex-1 overflow-hidden m-0 p-0 list-none flex flex-nowrap items-center gap-x-4 whitespace-nowrap" : "m-0 p-0 pr-64 list-none flex flex-wrap items-center gap-x-4 gap-y-1"}>
        <li className={`flex items-center gap-1.5 ${live.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
          {live.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden="true" />}
          <Icon name="radio" size={16} />
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">{t(live.length > 0 ? "rivals.liveBadge" : "rivals.friendsBadge")}</span>
        </li>
        {items.map((it, i) => (
          <Fragment key={it.key}>
            {sep(i)}
            <li data-friend={i} className={`${it.className} ${footer && i >= shown ? "invisible" : ""}`}>{it.body}</li>
          </Fragment>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={moreLeft !== null}
          title={t("rivals.moreFriends", { count: hiddenCount })}
          onClick={(e) => setMoreLeft(moreLeft === null ? e.currentTarget.getBoundingClientRect().left : null)}
          className="shrink-0 h-8 px-2 rounded-md border border-border bg-card font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground tabular-nums cursor-pointer hover:border-primary"
        >
          +{hiddenCount}
        </button>
      )}
      {hiddenCount > 0 && moreLeft !== null && (
        <ul
          className="fixed bottom-14 z-[60] m-0 p-2 list-none rounded-md border border-border bg-card shadow-lg flex flex-col gap-1 whitespace-nowrap"
          style={{ left: Math.max(8, Math.min(moreLeft - 200, window.innerWidth - 420)) }}
        >
          {items.slice(shown).map((it) => <li key={it.key} className={it.className}>{it.body}</li>)}
        </ul>
      )}
      {/* Who watches this match: an eye and the count, the names on hover (tester report, 8.9.3). */}
      {footer && viewers.length > 0 && (
        <span
          role="status"
          title={t("watch.viewers", { count: viewers.length, names: viewers.join(", ") })}
          aria-label={t("watch.viewers", { count: viewers.length, names: viewers.join(", ") })}
          className="shrink-0 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums"
        >
          <Icon name="eye" size={16} className="text-primary shrink-0" />
          {viewers.length}
        </span>
      )}
      </div>
    </div>
  );
}
