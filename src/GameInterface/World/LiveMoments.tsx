import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Icon } from "@/GameInterface/Icons";
import { homeAwayOf } from "@/Domain/rivals/homeAway";
import type { LiveMoment, LiveScoreView } from "@/types/rivalsTypes";

/** A friend's live game in the popup of the live strip: the score and the latest moments, newest first. */
export function LiveMoments({ live }: { live: LiveScoreView }) {
  const { t } = useTranslation();
  const teamOf = (side: LiveMoment["side"]) => (side === "against" ? live.opponentName : live.clubName);
  const home = live.home
    ? { id: live.clubId, name: live.clubName, goals: live.score.for }
    : { id: live.opponentId, name: live.opponentName, goals: live.score.against };
  const away = live.home
    ? { id: live.opponentId, name: live.opponentName, goals: live.score.against }
    : { id: live.clubId, name: live.clubName, goals: live.score.for };
  const aggregate = homeAwayOf(live).aggregate;
  const moments = [...(live.moments ?? [])].reverse();
  const line = (m: LiveMoment) => {
    if (m.kind === "half") return t("rivals.moments.half");
    if (m.kind === "end") return t("rivals.moments.end");
    const team = teamOf(m.side);
    const text = t(`rivals.moments.${m.kind}`, { team });
    if (m.kind === "sub") {
      return m.player || m.playerIn ? `${text} · ${t("rivals.moments.subLine", { out: m.player ?? "?", in: m.playerIn ?? "?" })}` : text;
    }
    return m.player ? `${text} · ${m.player}` : text;
  };
  /** The same moment without the team name: the column already says whose it is. */
  const shortLine = (m: LiveMoment) => {
    const text = t(`rivals.moments.short.${m.kind}`);
    if (m.kind === "sub") {
      return m.player || m.playerIn ? `${text} · ${t("rivals.moments.subLine", { out: m.player ?? "?", in: m.playerIn ?? "?" })}` : text;
    }
    return m.player ? `${text} · ${m.player}` : text;
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
        <ClubLogo logoUrl={squadLogoUrl(home.id)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
        <span className="truncate flex-1">{home.name}</span>
        <span className="font-display font-bold text-base">{home.goals}–{away.goals}</span>
        <span className="truncate flex-1 text-right">{away.name}</span>
        <ClubLogo logoUrl={squadLogoUrl(away.id)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
      </div>
      {aggregate && (
        <p className="m-0 -mt-1 text-sm text-center text-muted-foreground tabular-nums">
          {t("rivals.aggregateLine", { home: aggregate.home, away: aggregate.away })}
        </p>
      )}
      <div className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("rivals.moments.title")}</div>
      {moments.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{t("rivals.moments.none")}</p>
      ) : (
        // A timeline (tester report): each team's moments under its own name, the minute in the middle, newest first.
        <ul className="m-0 p-0 list-none flex flex-col gap-1 max-h-48 overflow-y-auto">
          {moments.map((m, i) => {
            const key = `${m.minute}-${m.kind}-${i}`;
            if (!m.side) {
              return (
                <li key={key} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span className="tabular-nums">{m.minute}'</span>
                  <span>{line(m)}</span>
                </li>
              );
            }
            const isHome = (m.side === "for") === live.home;
            const body = (
              <span className={`min-w-0 flex items-start gap-2 ${isHome ? "" : "flex-row-reverse text-right"}`}>
                <MomentMark kind={m.kind} />
                <span className="min-w-0 break-words">{shortLine(m)}</span>
              </span>
            );
            return (
              <li key={key} className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-sm">
                <span className="min-w-0 flex justify-end">{isHome ? body : null}</span>
                <span className="w-10 text-center tabular-nums text-muted-foreground">{m.minute}'</span>
                <span className="min-w-0 flex justify-start">{isHome ? null : body}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Goal ball, yellow / red card, substitution arrows; a dot for the rest. */
function MomentMark({ kind }: { kind: LiveMoment["kind"] }) {
  if (kind === "yellow" || kind === "red") {
    return <span className={`w-2.5 h-3.5 mt-0.5 shrink-0 rounded-[2px] ${kind === "red" ? "bg-destructive" : "bg-chart-4"}`} aria-hidden="true" />;
  }
  if (kind === "goal") return <span className="shrink-0 mt-0.5 text-primary" aria-hidden="true"><Icon name="ball" size={16} /></span>;
  if (kind === "sub") return <span className="shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true"><Icon name="arrow-right-left" size={16} /></span>;
  return <span className={`w-2 h-2 mt-1.5 shrink-0 rounded-full ${kind === "disallowed" ? "bg-chart-4" : "bg-border"}`} aria-hidden="true" />;
}
