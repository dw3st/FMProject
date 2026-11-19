import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BET_MARKETS, betStats, oddsBandOf, type BetLine, type BetMarket } from "@/Domain/bets/betStats";
import { BETS } from "@/Domain/bets/betsConfig";
import { formatFee } from "@/Domain/money";
import { BetProfitChart } from "@/GameInterface/Achievements/BetProfitChart";
import { pickLabel } from "@/GameInterface/Achievements/betText";
import { LoadMoreButton, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import type { Bet } from "@/types/betTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const KPI = "font-display font-bold tabular-nums text-2xl m-0 mt-1";
const PAGE = 30;

/** A price as the lists show it: "2,66" in Portuguese, "2.66" in English. */
export const oddsText = (o: number, lang: string) => o.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const signedMoney = (v: number) => (v > 0 ? `+${formatFee(v)}` : v === 0 ? "€0" : formatFee(v));
/** Green and red of the tester's spreadsheet: the wallet's green (`star-green`) and the theme's destructive. */
export const toneOf = (v: number) => (v > 0 ? "text-star-green" : v < 0 ? "text-destructive" : "text-muted-foreground");

type StatusFilter = "all" | "won" | "lost" | "refunded";

function Kpi({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="card-arcade rounded-md px-4 py-3 min-w-0">
      <p className={LABEL}>{label}</p>
      <p className={`${KPI} truncate ${className}`}>{value}</p>
    </div>
  );
}

/** The settled bets as the tester's spreadsheet: totals, the profit line, by odds and by market, then the list. */
export function BetDashboard({ settled, gameText }: { settled: Bet[]; gameText: (b: Bet) => string }) {
  const { t, i18n } = useTranslation();
  const stats = useMemo(() => betStats(settled), [settled]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [market, setMarket] = useState<BetMarket | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const pct = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 1 }).format(v));
  const { totals } = stats;

  const list = settled.filter((b) => (status === "all" || b.status === status) && (market === "all" || b.pick.market === market));

  if (settled.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("bets.stats.empty")}</p>;

  const lineCells = (l: BetLine) => (
    <>
      <StatsCell align="center" className="tabular-nums text-muted-foreground">{l.bets}</StatsCell>
      <StatsCell align="center" className="tabular-nums font-semibold text-star-green">{l.greens}</StatsCell>
      <StatsCell align="center" className="tabular-nums font-semibold text-destructive">{l.reds}</StatsCell>
      <StatsCell align="right" className="tabular-nums text-muted-foreground">{l.staked > 0 ? formatFee(l.staked) : "—"}</StatsCell>
      <StatsCell align="right" className={`tabular-nums font-display font-bold ${toneOf(l.profit)}`}>{l.bets > 0 ? signedMoney(l.profit) : "—"}</StatsCell>
      <StatsCell align="right" className={`tabular-nums ${l.roi === null ? "text-muted-foreground" : toneOf(l.roi)}`}>{pct(l.roi)}</StatsCell>
    </>
  );
  const head = (first: string) => (
    <>
      <StatsHead>{first}</StatsHead>
      <StatsHead align="center">{t("bets.stats.bets")}</StatsHead>
      <StatsHead align="center">{t("bets.stats.greens")}</StatsHead>
      <StatsHead align="center">{t("bets.stats.reds")}</StatsHead>
      <StatsHead align="right">{t("bets.stats.staked")}</StatsHead>
      <StatsHead align="right">{t("bets.stats.profit")}</StatsHead>
      <StatsHead align="right">{t("bets.stats.roi")}</StatsHead>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label={t("bets.stats.staked")} value={formatFee(totals.staked)} />
        <Kpi label={t("bets.stats.returned")} value={formatFee(totals.returned)} />
        <Kpi label={t("bets.stats.profit")} value={signedMoney(totals.profit)} className={toneOf(totals.profit)} />
        <Kpi label={t("bets.stats.roi")} value={pct(totals.roi)} className={totals.roi === null ? "" : toneOf(totals.roi)} />
        <Kpi label={t("bets.stats.hitRate")} value={pct(totals.hitRate)} />
        <div className="card-arcade rounded-md px-4 py-3 min-w-0">
          <p className={LABEL}>{t("bets.stats.greensReds")}</p>
          <p className={`${KPI}`}>
            <span className="text-star-green">{totals.greens}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="text-destructive">{totals.reds}</span>
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle>{t("bets.stats.chart")}</SectionTitle>
        <div className="card-arcade rounded-md px-3 py-3">
          {stats.series.length > 0 ? <BetProfitChart series={stats.series} /> : <p className="text-sm text-muted-foreground m-0">{t("bets.stats.chartEmpty")}</p>}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <section className="flex flex-col gap-2 min-w-0">
          <SectionTitle>{t("bets.stats.byOdds")}</SectionTitle>
          <StatsTable head={head(t("bets.stats.band"))}>
            {stats.bands.map((b) => (
              <StatsRow key={b.band}>
                <StatsCell className="font-semibold tabular-nums whitespace-nowrap">{t(`bets.stats.bands.${b.band}`)}</StatsCell>
                {lineCells(b)}
              </StatsRow>
            ))}
          </StatsTable>
        </section>
        <section className="flex flex-col gap-2 min-w-0">
          <SectionTitle>{t("bets.stats.byMarket")}</SectionTitle>
          <StatsTable head={head(t("bets.stats.market"))}>
            {stats.markets.map((m) => (
              <StatsRow key={m.market}>
                <StatsCell className="font-semibold whitespace-nowrap">{t(`bets.market.${m.market}`)}</StatsCell>
                {lineCells(m)}
              </StatsRow>
            ))}
          </StatsTable>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t("bets.history")}</SectionTitle>
        <div className="flex flex-wrap gap-3">
          <OptionChips<StatusFilter>
            aria-label={t("bets.stats.statusFilter")}
            value={status}
            onChange={(v) => { setStatus(v); setShown(PAGE); }}
            options={[
              { key: "all", label: t("bets.stats.all") },
              { key: "won", label: t("bets.stats.green") },
              { key: "lost", label: t("bets.stats.red") },
              { key: "refunded", label: t("bets.stats.refunded") },
            ]}
          />
          <OptionChips<BetMarket | "all">
            aria-label={t("bets.stats.marketFilter")}
            value={market}
            onChange={(v) => { setMarket(v); setShown(PAGE); }}
            options={[{ key: "all", label: t("bets.stats.allMarkets") }, ...BET_MARKETS.map((m) => ({ key: m, label: t(`bets.market.${m}`) }))]}
          />
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("bets.stats.noneFiltered")}</p>
        ) : (
          <div className={TABLE_STYLE.shell}>
            <div className={TABLE_STYLE.body}>
              {list.slice(0, shown).map((b) => {
                const net = (b.payout ?? 0) - b.stake;
                const badge = b.status === "won" ? "bg-star-green/15 text-star-green" : b.status === "lost" ? "bg-destructive/15 text-destructive" : "bg-secondary/40 text-muted-foreground";
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`shrink-0 w-[76px] text-center rounded px-2 py-0.5 text-sm font-display font-bold uppercase tracking-[0.08em] ${badge}`}>
                      {b.status === "won" ? t("bets.stats.green") : b.status === "lost" ? t("bets.stats.red") : t("bets.stats.refundedOne")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold m-0 truncate">{pickLabel(t, b.pick, b.homeName, b.awayName)}</p>
                      <p className="text-sm text-muted-foreground m-0 truncate">{gameText(b)}</p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <p className="font-semibold m-0">{formatFee(b.stake)} · {oddsText(b.odds, i18n.language)}</p>
                      <p className="text-sm text-muted-foreground m-0">{t(`bets.stats.bands.${oddsBandOf(b.odds)}`)}</p>
                    </div>
                    <p className={`m-0 w-24 shrink-0 text-right font-display font-bold tabular-nums ${b.status === "refunded" ? "text-muted-foreground" : toneOf(net)}`}>
                      {b.status === "refunded" ? "€0" : signedMoney(net)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {list.length > shown && (
          <LoadMoreButton onClick={() => setShown((s) => s + PAGE)} loading={false} failed={false} label={t("bets.stats.loadMore", { count: list.length - shown })} loadingLabel="" failedLabel="" />
        )}
        {settled.length >= BETS.MAX_SETTLED && <p className="text-sm text-muted-foreground m-0">{t("bets.stats.capNote", { count: BETS.MAX_SETTLED })}</p>}
      </section>
    </div>
  );
}
