import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import type { ClubFinanceRow } from "@/Domain/aiFinance/financeRows";
import type { HiringState } from "@/Domain/aiFinance/aiClubFinance";
import type { FinancialTier } from "@/types/playerTypes";

const TIER_BADGE: Record<FinancialTier, string> = {
  LOW: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
  MEDIUM: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  HIGH: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  ELITE: "bg-amber-500/15 text-amber-300 border-amber-500/40",
};

const HIRING_BADGE: Record<HiringState, string> = {
  open: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  tight: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  frozen: "bg-red-500/15 text-red-300 border-red-500/40",
};

const WAGE_BAR: Record<HiringState, string> = {
  open: "bg-emerald-500",
  tight: "bg-amber-500",
  frozen: "bg-red-500",
};

/** €12.3M / €450k / €900 */
export function formatEuros(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `€${Math.round(n)}`;
}

const GRID = "grid grid-cols-[minmax(0,1fr)_80px_90px_100px_170px_80px_150px] gap-3 items-center";

/**
 * League-wide view of the simplified AI club finances (tier, popularity, weekly budget, wage bill
 * vs wage cap, hiring state, seasonal transfer budget). Dumb: rows come from the ai-finances
 * endpoint. The human club's row only shows popularity and wage bill.
 */
export function ClubFinancesTable({
  rows,
  leagueSlug,
  catalog,
  onClickSquad,
}: {
  rows: ClubFinanceRow[];
  leagueSlug: string;
  /** squadId → catalog (origin) league — crest files are filed by origin league. */
  catalog: Map<string, string>;
  onClickSquad: (row: ClubFinanceRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-xl overflow-x-auto border-glow">
      <div className="min-w-[900px]">
        <div className={`${GRID} px-4 py-3 bg-secondary/30 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground`}>
          <div>{t("leagues.club")}</div>
          <div className="text-center">{t("leagues.finances.tier")}</div>
          <div className="text-center">{t("leagues.finances.popularity")}</div>
          <div className="text-right">{t("leagues.finances.weeklyBudget")}</div>
          <div>{t("leagues.finances.wages")}</div>
          <div className="text-center">{t("leagues.finances.hiring")}</div>
          <div className="text-right">{t("leagues.finances.transferBudget")}</div>
        </div>

        <div className="divide-y divide-border/50">
          {rows.map((row) => {
            const wagePct = row.maxWageBudget ? Math.min(100, (row.wageBill / row.maxWageBudget) * 100) : 0;
            return (
              <div
                key={row.squadId}
                onClick={() => onClickSquad(row)}
                className={`${GRID} px-4 py-2.5 hover:bg-secondary/30 transition-colors cursor-pointer ${row.isPlayerClub ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ClubLogo
                    logoUrl={squadLogoUrl(row.squadId, catalog.get(row.squadId) ?? leagueSlug, row.slug)}
                    primaryColor={row.colors[0]}
                    secondaryColor={row.colors[1]}
                    className="w-6 h-6 rounded shrink-0"
                    imgClassName="w-full h-full object-contain"
                  />
                  <span className="font-semibold text-foreground truncate">{row.name}</span>
                </div>

                <div className="flex justify-center">
                  {row.tier ? (
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${TIER_BADGE[row.tier]}`}>
                      {t(`leagues.finances.tiers.${row.tier}`)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{t("leagues.finances.yourClub")}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${row.popularity}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-6 text-right">{Math.round(row.popularity)}</span>
                </div>

                <div className="text-right text-sm tabular-nums text-muted-foreground">
                  {row.weeklyBudget != null ? `${formatEuros(row.weeklyBudget)}${t("leagues.finances.perWeek")}` : "—"}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs tabular-nums">
                    <span className="text-foreground">{formatEuros(row.wageBill)}</span>
                    <span className="text-muted-foreground">
                      {row.maxWageBudget != null ? `/ ${formatEuros(row.maxWageBudget)}` : ""}
                    </span>
                  </div>
                  {row.maxWageBudget != null && row.hiring && (
                    <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                      <div className={`h-full ${WAGE_BAR[row.hiring]}`} style={{ width: `${wagePct}%` }} />
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  {row.hiring ? (
                    <span
                      title={t(`leagues.finances.hiringHint.${row.hiring}`)}
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${HIRING_BADGE[row.hiring]}`}
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
                      <span className="text-muted-foreground text-xs"> / {formatEuros(row.seasonalTransferBudget)}</span>
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
