import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { gameArtUrl } from "@/Domain/art/paintedFaces";
import { formatFee } from "@/Domain/money";
import { competitionName } from "@/Domain/world/labels";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { PlayerFace } from "@/GameInterface/Components/PlayerFace";
import { Icon, type IconName } from "@/GameInterface/Icons";
import type { LeagueData } from "@/types/playerTypes";
import type { SeasonDeal, SeasonHighlight, SeasonRun, SeasonSummary } from "@/types/seasonSummaryTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** The painted banner of the season: a title or a promotion, a missed objective or a relegation, anything else. */
export function seasonBannerFile(s: Pick<SeasonSummary, "titles" | "move" | "objective">): string {
  if (s.titles.length > 0 || s.move === "promoted") return "season/banner-title.webp";
  if (s.move === "relegated" || (s.objective && !s.objective.met)) return "season/banner-bad.webp";
  return "season/banner-good.webp";
}

/** The painted trophy of a title ("league:<slug>", "cup:<slug>", "continental:<slug>"). */
export function seasonTrophyFile(title: string): string {
  const kind = title.split(":")[0];
  return `season/trophy-${kind === "cup" ? "cup" : kind === "continental" ? "continental" : "league"}.webp`;
}

function Row({ label, value, tone = "" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums text-right ${tone}`}>{value}</span>
    </div>
  );
}

function Panel({ icon, tone, title, children }: { icon: IconName; tone: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={16} className={tone} />
        <span className="font-display font-black uppercase text-base leading-none">{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function ResultBar({ table }: { table: NonNullable<SeasonSummary["table"]> }) {
  const { t } = useTranslation();
  const total = Math.max(1, table.played);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 overflow-hidden rounded bg-border">
        <span className="bg-star-green" style={{ width: `${(table.won / total) * 100}%` }} />
        <span className="bg-muted-foreground/60" style={{ width: `${(table.drawn / total) * 100}%` }} />
        <span className="bg-destructive" style={{ width: `${(table.lost / total) * 100}%` }} />
      </div>
      <div className="flex justify-between gap-2 text-sm tabular-nums font-semibold">
        <span className="text-star-green">{t("seasonSummary.wins", { count: table.won })}</span>
        <span className="text-muted-foreground">{t("seasonSummary.draws", { count: table.drawn })}</span>
        <span className="text-destructive">{t("seasonSummary.losses", { count: table.lost })}</span>
      </div>
    </div>
  );
}

function Trophy({ title, leagues }: { title: string; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  const name = competitionName(title.slice(title.indexOf(":") + 1), leagues, i18n.language);
  return (
    <figure className="relative m-0 flex w-36 flex-col items-center gap-1 text-center">
      <span aria-hidden className="absolute left-1/2 top-16 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-star-gold/25 blur-2xl" />
      <img src={gameArtUrl(seasonTrophyFile(title))} alt="" className="relative h-36 w-36 object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.6)]" />
      <figcaption className="relative flex flex-col leading-tight">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-star-gold">{t("seasonSummary.champion")}</span>
        <span className="text-sm font-semibold">{name}</span>
      </figcaption>
    </figure>
  );
}

export function SeasonSummaryView({
  summary, leagues, movedTo, formerClub, otherMoves, onDismiss,
}: {
  summary: SeasonSummary;
  leagues: LeagueData[];
  /** League the club plays next season, when it was promoted or relegated. */
  movedTo: string | null;
  /** Set when the manager has moved since: the report is about that club. */
  formerClub: string | null;
  /** Clubs that changed division in the country. */
  otherMoves: number;
  onDismiss: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const num = (n: number) => n.toLocaleString(lang);
  const nameOf = (slug: string) => competitionName(slug, leagues, lang);
  const { table, money, market } = summary;
  const run = (r: SeasonRun) => (
    <Row key={r.competition} label={nameOf(r.competition)} value={t(`seasonSummary.run.${r.stage}`)} tone={r.stage === "champion" ? "text-star-gold" : ""} />
  );
  const deal = (d: SeasonDeal | undefined) => (d ? `${d.name} · ${formatFee(d.fee)}` : "–");
  const highlightValue = (h: SeasonHighlight) =>
    h.kind === "rating"
      ? h.value.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : t(`seasonSummary.highlightValue.${h.kind}`, { count: h.value });
  const verdict = summary.objective
    ? t(summary.objective.met ? "seasonSummary.objectiveMet" : "seasonSummary.objectiveMissed", { target: summary.objective.target })
    : null;

  return (
    <div className="flex flex-col">
      <div className="relative h-60 phone:h-44">
        <img src={gameArtUrl(seasonBannerFile(summary))} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/75 to-card/5" />
        <div className="absolute inset-x-6 bottom-4 flex items-end justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <ClubLogo logoUrl={squadLogoUrl(summary.clubId)} primaryColor={summary.clubColors?.[0]} secondaryColor={summary.clubColors?.[1]} className="w-20 h-20 shrink-0" />
            <div className="flex flex-col gap-2 min-w-0">
              <h2 className="font-display font-black uppercase text-3xl leading-none m-0">
                {t("seasonSummary.titleMain", { season: summary.season })} <span className="text-primary">{t("seasonSummary.titleAccent")}</span>
              </h2>
              <span className="text-sm text-muted-foreground">
                {[formerClub ? t("seasonNotice.formerClub", { club: formerClub }) : summary.clubName, nameOf(summary.league), verdict].filter(Boolean).join(" · ")}
              </span>
              {summary.move && movedTo && (
                <span className={`flex items-center gap-1.5 text-sm font-bold ${summary.move === "promoted" ? "text-star-green" : "text-destructive"}`}>
                  <Icon name={summary.move === "promoted" ? "trend-up" : "trend-down"} size={16} />
                  {t(summary.move === "promoted" ? "seasonSummary.promoted" : "seasonSummary.relegated", { league: nameOf(movedTo) })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-end gap-6 shrink-0">
            {summary.titles.length > 0 && (
              <div className="flex items-end gap-2 phone:hidden">
                {summary.titles.map((title) => <Trophy key={title} title={title} leagues={leagues} />)}
              </div>
            )}
            {table?.position != null && (
              <div className="flex items-end gap-2 text-right">
                <span className="font-display font-black text-7xl leading-none text-primary tabular-nums">
                  {t("seasonSummary.position", { count: table.position, ordinal: true })}
                </span>
                <span className="pb-1.5 text-sm text-muted-foreground tabular-nums">
                  {table.teams > 0 && <>{t("seasonSummary.ofTeams", { teams: table.teams })}<br /></>}
                  {t("seasonSummary.points", { count: table.points })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 phone:p-3 flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel icon="trophy" tone="text-chart-4" title={t("seasonSummary.campaign")}>
            {table && <ResultBar table={table} />}
            <div className="mt-2">
              {table && <Row label={t("seasonSummary.goals")} value={`${table.gf} / ${table.ga}`} />}
              {table && table.played > 0 && (
                <Row label={t("seasonSummary.pointsShare")} value={`${Math.round((table.points / (table.played * 3)) * 100)}%`} />
              )}
              {summary.cup && run(summary.cup)}
              {summary.continental && run(summary.continental)}
              {summary.crowd && <Row label={t("seasonSummary.crowd")} value={num(summary.crowd.average)} />}
              {summary.crowd && <Row label={t("seasonSummary.bestCrowd")} value={num(summary.crowd.best)} />}
            </div>
          </Panel>
          <Panel icon="wallet" tone="text-star-green" title={t("seasonSummary.money")}>
            <Row label={t("seasonSummary.income")} value={formatFee(money.income)} tone="text-star-green" />
            <Row label={t("seasonSummary.expenses")} value={formatFee(money.expenses)} tone="text-destructive" />
            <Row label={t("seasonSummary.prizes")} value={formatFee(money.prizes)} />
            <Row label={t("seasonSummary.gate")} value={formatFee(money.gate)} />
            <Row label={t("seasonSummary.wages")} value={formatFee(money.wages)} />
            <Row
              label={t("seasonSummary.net")}
              value={`${money.net > 0 ? "+" : ""}${formatFee(money.net)}`}
              tone={money.net >= 0 ? "text-star-green" : "text-destructive"}
            />
          </Panel>
          <Panel icon="transfers" tone="text-chart-2" title={t("seasonSummary.market")}>
            <Row label={t("seasonSummary.signings")} value={t("seasonSummary.players", { count: market.signings })} />
            <Row label={t("seasonSummary.spent")} value={formatFee(market.spent)} tone={market.spent > 0 ? "text-destructive" : ""} />
            <Row label={t("seasonSummary.sales")} value={t("seasonSummary.players", { count: market.sales })} />
            <Row label={t("seasonSummary.received")} value={formatFee(market.received)} tone={market.received > 0 ? "text-star-green" : ""} />
            <Row label={t("seasonSummary.biggestBuy")} value={deal(market.biggestBuy)} />
            <Row label={t("seasonSummary.biggestSale")} value={deal(market.biggestSale)} />
          </Panel>
        </div>

        {summary.highlights.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.highlights.map((h) => (
              <div key={h.kind} className="flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-2.5 min-w-0">
                <PlayerFace playerId={h.playerId} nationality={h.nationality} clubColors={summary.clubColors} size={40} fallback={h.name.slice(0, 1)} />
                <div className="flex flex-col min-w-0">
                  <span className={LABEL}>{t(`seasonSummary.highlight.${h.kind}`)}</span>
                  <span className="font-semibold truncate">{h.name}</span>
                  <span className="text-sm text-primary font-bold tabular-nums">{highlightValue(h)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {otherMoves > 0 ? t("seasonNotice.moves", { count: otherMoves }) : ""}
          </span>
          <button type="button" onClick={onDismiss} className="h-10 px-5 rounded bg-primary text-primary-foreground text-sm font-semibold cursor-pointer border-0">
            {t("seasonSummary.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
