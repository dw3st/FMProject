import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
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
  const moments = [...(live.moments ?? [])].reverse();
  const line = (m: LiveMoment) => {
    if (m.kind === "half") return t("rivals.moments.half");
    if (m.kind === "end") return t("rivals.moments.end");
    const team = teamOf(m.side);
    const text = t(`rivals.moments.${m.kind}`, { team });
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
      <div className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("rivals.moments.title")}</div>
      {moments.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{t("rivals.moments.none")}</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1 max-h-48 overflow-y-auto">
          {moments.map((m, i) => (
            <li key={`${m.minute}-${m.kind}-${i}`} className="flex items-start gap-2 text-sm">
              <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{m.minute}'</span>
              <span className={`w-2 h-2 mt-1.5 shrink-0 rounded-full ${m.kind === "goal" ? "bg-primary" : m.kind === "red" ? "bg-destructive" : "bg-border"}`} aria-hidden="true" />
              <span className="min-w-0 break-words">{line(m)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
