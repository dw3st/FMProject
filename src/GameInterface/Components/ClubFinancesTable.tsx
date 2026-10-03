import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import type { ClubFinanceRow } from "@/Domain/aiFinance/financeRows";
import type { HiringState } from "@/Domain/aiFinance/aiClubFinance";
import type { FinancialTier } from "@/types/playerTypes";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";

const TIER_BADGE: Record<FinancialTier, string> = {
  LOW: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
  MEDIUM: "bg-chart-3/15 text-chart-3 border-chart-3/40",
  HIGH: "bg-chart-2/15 text-chart-2 border-chart-2/40",
  ELITE: "bg-chart-4/15 text-chart-4 border-chart-4/40",
};

const HIRING_BADGE: Record<HiringState, string> = {
  open: "bg-chart-2/15 text-chart-2 border-chart-2/40",
  tight: "bg-chart-4/15 text-chart-4 border-chart-4/40",
  frozen: "bg-destructive/15 text-destructive border-destructive/40",
};

const WAGE_BAR: Record<HiringState, string> = {
  open: "bg-chart-2",
  tight: "bg-chart-4",
  frozen: "bg-destructive",
};

/** €12.3M / €450k / €900 */
export function formatEuros(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `€${Math.round(n)}`;
}

const GRID = "grid grid-cols-[minmax(0,1fr)_80px_104px_100px_170px_80px_150px] gap-3 items-center";

/**
 * League-wide view of the simplified AI club finances (tier, popularity, weekly budget, wage bill
 * vs wage cap, hiring state, seasonal transfer budget). Dumb: rows come from the ai-finances
 * endpoint. The human club's row only shows popularity and wage bill.
 */
export function ClubFinancesTable({
  rows,
  onClickSquad,
}: {
  rows: ClubFinanceRow[];
  onClickSquad: (row: ClubFinanceRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`${TABLE_STYLE.shell} overflow-x-auto`}>
      <div className="min-w-[900px]">
        <div className={`${GRID} px-4 py-3 ${TABLE_STYLE.head}`}>
          <div>{t("leagues.club")}</div>
          <div className="text-center">{t("leagues.finances.tier")}</div>
          <div className="text-center">{t("leagues.finances.popularity")}</div>
          <div className="text-right">{t("leagues.finances.weeklyBudget")}</div>
          <div>{t("leagues.finances.wages")}</div>
          <div className="text-center">{t("leagues.finances.hiring")}</div>
          <div className="text-right">{t("leagues.finances.transferBudget")}</div>
        </div>

        <div className={TABLE_STYLE.body}>
          {rows.map((row) => {
            const wagePct = row.maxWageBudget ? Math.min(100, (row.wageBill / row.maxWageBudget) * 100) : 0;
            return (
              <div
                key={row.squadId}
                onClick={() => onClickSquad(row)}
                className={`${GRID} px-4 py-2.5 ${TABLE_STYLE.row} ${TABLE_STYLE.rowClickable} ${row.isPlayerClub ? TABLE_STYLE.rowHighlight : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ClubLogo
                    logoUrl={squadLogoUrl(row.squadId)}
                    primaryColor={row.colors[0]}
                    secondaryColor={row.colors[1]}
                    className={TABLE_STYLE.crest}
                    imgClassName="w-full h-full object-contain"
                  />
                  <span className={`${row.isPlayerClub ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name} truncate`}>{row.name}</span>
                </div>

                <div className="flex justify-center">
                  {row.tier ? (
                    <span className={`px-2 py-0.5 rounded border text-sm ${TIER_BADGE[row.tier]}`}>
                      {t(`leagues.finances.tiers.${row.tier}`)}
                    </span>
                  ) : (
                    <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-primary font-display">{t("leagues.finances.yourClub")}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-16 h-1.5 rounded-full bg-border overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${row.popularity}%` }} />
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground w-6 text-right">{Math.round(row.popularity)}</span>
                </div>

                <div className="text-right text-sm tabular-nums text-muted-foreground">
                  {row.weeklyBudget != null ? `${formatEuros(row.weeklyBudget)}${t("leagues.finances.perWeek")}` : "—"}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-sm tabular-nums">
                    <span className="text-foreground">{formatEuros(row.wageBill)}</span>
                    <span className="text-muted-foreground">
                      {row.maxWageBudget != null ? `/ ${formatEuros(row.maxWageBudget)}` : ""}
                    </span>
                  </div>
                  {row.maxWageBudget != null && row.hiring && (
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div className={`h-full ${WAGE_BAR[row.hiring]}`} style={{ width: `${wagePct}%` }} />
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  {row.hiring ? (
                    <span
                      title={t(`leagues.finances.hiringHint.${row.hiring}`)}
                      className={`px-2 py-0.5 rounded border text-sm ${HIRING_BADGE[row.hiring]}`}
                    >
                      {t(`leagues.finances.hiringState.${row.hiring}`)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                <div className="text-right text-sm tabular-nums">
                  {row.transferBudget != null && row.seasonalTransferBudget != null ? (
                    <>
                      <span className="text-foreground font-semibold">{formatEuros(row.transferBudget)}</span>
                      <span className="text-muted-foreground text-sm"> / {formatEuros(row.seasonalTransferBudget)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
