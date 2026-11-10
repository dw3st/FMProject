import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/GameInterface/ui/Button";
import { navigate } from "@/GameInterface/router/navigation";
import { competitionName } from "@/Domain/world/labels";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import type { RivalComp, RivalRow } from "@/types/rivalsTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

const formatDay = (date: string, lang: string) => new Date(`${date}T12:00:00`).toLocaleDateString(lang, { day: "numeric", month: "short" });

/** "2º de 20 · 61 pts", "Oitavas de final · venceu a ida 2–1", "Eliminado · Quartas de final" (8.9.9). */
export function rivalCompText(c: RivalComp, t: TFunction, lang: string): string {
  if (c.kind === "league") return t("rivals.comps.league", { position: c.position, size: c.size, points: c.points });
  if (c.stage === "group") return t("rivals.comps.group", { group: c.group, position: c.position });
  if (c.state === "champion") return t("rivals.comps.champion");
  const stage = t(c.kind === "cup" ? `cups.stage.${c.stage}` : `continental.stage.${c.stage}`);
  if (c.state === "out") return t("rivals.comps.out", { stage });
  if (c.firstLeg) {
    const key = c.firstLeg.for > c.firstLeg.against ? "won" : c.firstLeg.for < c.firstLeg.against ? "lost" : "drew";
    return t(`rivals.comps.firstLeg.${key}`, { stage, for: c.firstLeg.for, against: c.firstLeg.against });
  }
  return c.nextDate ? t("rivals.comps.next", { stage, date: formatDay(c.nextDate, lang) }) : stage;
}

const tone = (c: RivalComp) =>
  c.state === "champion" || (c.firstLeg && c.firstLeg.for > c.firstLeg.against) ? "text-primary"
    : c.state === "out" ? "text-muted-foreground" : "text-foreground";

/** The competition his next game is in (else his league): where the bet button opens the Bets tab. */
export function betCompetitionOf(row: RivalRow): string | null {
  return row.next && !row.next.national ? row.next.competition : row.leagueSlug || null;
}

export function openFriendBets(slug: string): void {
  navigate(`/achievements?tab=bets&competition=${encodeURIComponent(slug)}`);
}

/** One block per competition of a friend's club, and the button that opens the Bets tab on his games (8.9.9, option A). */
export function RivalCompetitions({ row, bet = true }: { row: RivalRow; bet?: boolean }) {
  const { t, i18n } = useTranslation();
  const leagues = useLeagueCatalog();
  const comps = row.comps ?? [];
  const betSlug = betCompetitionOf(row);
  if (comps.length === 0 && !betSlug) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {comps.map((c) => (
        <div key={c.slug} className="rounded-md border border-border bg-card px-3 py-1.5 min-w-0">
          <span className={`block ${LABEL}`}>{competitionName(c.slug, leagues, i18n.language)}</span>
          <span className={`block text-sm font-semibold tabular-nums ${tone(c)}`}>{rivalCompText(c, t, i18n.language)}</span>
        </div>
      ))}
      {bet && betSlug && (
        <Button className="h-9" onClick={() => openFriendBets(betSlug)}>{t("rivals.comps.bet")}</Button>
      )}
    </div>
  );
}
