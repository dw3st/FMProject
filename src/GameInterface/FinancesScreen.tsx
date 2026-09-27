import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { LeagueData } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { competitionName } from "@/Domain/world/labels";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { weeklyOperationalCost } from "@/Domain/advanceDay/financial";
import { gateRevenue, type GateKind } from "@/Domain/finance/gate";
import type { LedgerEntry, LedgerKind } from "@/Domain/finance/ledger";

// ── API shape (GET /api/saves/:saveId/ledger?season=) ───────────────────────

interface LedgerApiResponse {
  season: number;
  seasons: number[];
  entries: LedgerEntry[];
  totals: Record<LedgerKind, number>;
  weekly: { weekStart: string; net: number }[];
  balance: number;
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
  return `${sign}€${abs}`;
}

function formatWeekLabel(weekStart: string) {
  const [, m, d] = weekStart.split("-");
  return `${d}/${m}`;
}

// ── Per-kind display metadata ────────────────────────────────────────────────

const INCOME_KINDS: LedgerKind[] = ["broadcasting", "commercial", "gate", "prize", "transfer_in"];
const EXPENSE_KINDS: LedgerKind[] = ["wages", "operational", "transfer_out"];
const ALL_KINDS: LedgerKind[] = [...INCOME_KINDS, ...EXPENSE_KINDS];

const KIND_META: Record<LedgerKind, { icon: IconName; labelKey: string }> = {
  broadcasting: { icon: "broadcast", labelKey: "financesScreen.broadcasting" },
  commercial: { icon: "handshake", labelKey: "financesScreen.commercial" },
  gate: { icon: "building", labelKey: "financesScreen.gate" },
  prize: { icon: "trophy", labelKey: "financesScreen.prize" },
  transfer_in: { icon: "arrow-down-left", labelKey: "financesScreen.transfersIn" },
  wages: { icon: "staff", labelKey: "financesScreen.playerSalaries" },
  operational: { icon: "building", labelKey: "financesScreen.operational" },
  transfer_out: { icon: "arrow-up-right", labelKey: "financesScreen.transfersOut" },
};

function fixtureGateKind(competitionSlug: string): GateKind {
  return isContinentalSlug(competitionSlug) ? "continental" : isCupSlug(competitionSlug) ? "cup" : "league";
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function FinancesScreen() {
  const { t, i18n } = useTranslation();
  const { session, squad, loading: saveLoading, fixtures } = useGameSave();

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [ledger, setLedger] = useState<LedgerApiResponse | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [kindFilter, setKindFilter] = useState<LedgerKind | "all">("all");

  useEffect(() => {
    if (!saveLoading && !session) window.location.href = "/new-game";
  }, [saveLoading, session]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  useEffect(() => {
    if (!session?.saveId) return;
    const url = selectedSeason != null
      ? `/api/saves/${session.saveId}/ledger?season=${selectedSeason}`
      : `/api/saves/${session.saveId}/ledger`;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<LedgerApiResponse>) : null))
      .then((d) => { if (!cancelled) setLedger(d); })
      .catch(() => { if (!cancelled) setLedger(null); });
    return () => { cancelled = true; };
  }, [session?.saveId, selectedSeason, session?.currentDate]);

  // Weekly wage bill + operational cost via the exact same pure formulas the server uses.
  const weeklyProjection = useMemo(() => {
    if (!squad) return null;
    return {
      wages: squadWeeklyWages(squad.players, wageFactorOf(squad)),
      operational: weeklyOperationalCost(squad),
      commercial: Math.round((squad.finances?.commercial ?? 0) / 52),
    };
  }, [squad]);

  // Upcoming home fixtures (any competition) with a projected gate via the same gateRevenue used
  // server-side — see design spec §2 "Bilheteria".
  const gateProjections = useMemo(() => {
    if (!squad || !session) return [];
    const capacity = squad.venue?.capacity ?? 0;
    const today = session.currentDate ?? "";
    return fixtures
      .filter((f) => f.home === squad.id && !f.played && f.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((f: Fixture) => {
        const kind = fixtureGateKind(f.competition);
        return { fixture: f, kind, projected: gateRevenue(capacity, kind, f.neutral) };
      });
  }, [fixtures, squad, session]);

  const projectedRemainingGate = useMemo(
    () => gateProjections.reduce((sum, g) => sum + g.projected, 0),
    [gateProjections],
  );

  const filteredEntries = useMemo(() => {
    const entries = ledger?.entries ?? [];
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return kindFilter === "all" ? sorted : sorted.filter((e) => e.kind === kindFilter);
  }, [ledger, kindFilter]);

  if (saveLoading || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("financesScreen.loading")}</p>
      </div>
    );
  }

  const totals = ledger?.totals;
  const balance = ledger?.balance ?? squad?.finances?.budget ?? 0;
  const seasonIncome = totals
    ? INCOME_KINDS.reduce((sum, k) => sum + totals[k], 0)
    : 0;
  const seasonExpenses = totals
    ? Math.abs(EXPENSE_KINDS.reduce((sum, k) => sum + totals[k], 0))
    : 0;
  const seasonPrizes = totals?.prize ?? 0;

  const weeklyChart = (ledger?.weekly ?? []).slice(-12);
  const maxWeeklyAbs = Math.max(...weeklyChart.map((w) => Math.abs(w.net)), 1);

  const maxIncomeBar = totals ? Math.max(...INCOME_KINDS.map((k) => totals[k]), 1) : 1;
  const maxExpenseBar = totals ? Math.max(...EXPENSE_KINDS.map((k) => Math.abs(totals[k])), 1) : 1;

  return (
    <main className="flex-1 p-4 lg:p-6 overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeadline
          backHref="/dashboard"
          trailing={
            ledger && ledger.seasons.length > 1 ? (
              <select
                className="bg-white/[0.03] border border-white/10 rounded-lg text-xs text-foreground px-2 py-1.5"
                value={ledger.season}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
              >
                {ledger.seasons.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : undefined
          }
        >
          {t("common.club")} <span className="text-primary">{t("common.finances")}</span>
        </PageHeadline>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OverviewCard
            icon="wallet"
            iconBg="bg-primary/20"
            iconColor="text-primary"
            label={t("financesScreen.budget")}
            value={formatCurrency(balance)}
            valueColor={balance >= 0 ? "text-primary" : "text-red-400"}
          />
          <OverviewCard
            icon="trend-up"
            iconBg="bg-emerald-500/20"
            iconColor="text-emerald-400"
            label={t("financesScreen.seasonIncome")}
            value={formatCurrency(seasonIncome)}
            valueColor="text-emerald-400"
          />
          <OverviewCard
            icon="trend-down"
            iconBg="bg-red-500/20"
            iconColor="text-red-400"
            label={t("financesScreen.seasonExpenses")}
            value={formatCurrency(seasonExpenses)}
            valueColor="text-red-400"
          />
          <OverviewCard
            icon="trophy"
            iconBg="bg-yellow-500/20"
            iconColor="text-yellow-400"
            label={t("financesScreen.seasonPrizes")}
            value={formatCurrency(seasonPrizes)}
            valueColor="text-yellow-400"
          />
        </div>

        {balance < 0 && (
          <div className="card-arcade rounded-xl p-4 border border-red-500/50 bg-red-500/10 flex items-start gap-3">
            <Icon name="alert" size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground m-0">{t("finances.warnings.negativeBudgetTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5 m-0">{t("finances.warnings.negativeBudget")}</p>
            </div>
          </div>
        )}

        {/* Weekly net chart (real ledger data) */}
        <div className="card-arcade rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold font-display uppercase tracking-wider text-primary">
              {t("financesScreen.weeklyNet")}
            </h3>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40 px-2 py-1 rounded">
              {t("financesScreen.last12Weeks")}
            </span>
          </div>
          {weeklyChart.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("financesScreen.noEntries")}</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {weeklyChart.map((w) => {
                const h = (Math.abs(w.net) / maxWeeklyAbs) * 100;
                return (
                  <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="relative w-full flex-1 flex items-end justify-center group">
                      <div
                        className={`w-full rounded-t ${w.net >= 0 ? "bg-emerald-500/50" : "bg-red-500/50"}`}
                        style={{ height: `${h}%` }}
                      />
                      <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <div className="bg-card border border-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                          <span className={w.net >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {w.net >= 0 ? "+" : ""}{formatCurrency(w.net)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{formatWeekLabel(w.weekStart)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Income / expenses breakdown by kind */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <KindBreakdown
            titleKey="financesScreen.revenueBreakdown"
            titleColor="text-emerald-400"
            kinds={INCOME_KINDS}
            totals={totals}
            maxBar={maxIncomeBar}
            barColor="bg-emerald-500"
            total={seasonIncome}
            totalColor="text-emerald-400"
          />
          <KindBreakdown
            titleKey="financesScreen.expenses"
            titleColor="text-red-400"
            kinds={EXPENSE_KINDS}
            totals={totals}
            maxBar={maxExpenseBar}
            barColor="bg-red-500"
            total={seasonExpenses}
            totalColor="text-red-400"
            absolute
          />
        </div>

        {/* Projections: weekly cost bill + upcoming gate revenue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-arcade rounded-xl p-4">
            <h3 className="text-sm font-bold font-display uppercase tracking-wider text-primary mb-4">
              {t("financesScreen.weeklyProjection")}
            </h3>
            {weeklyProjection ? (
              <div className="space-y-2">
                <ProjectionRow icon="handshake" label={t("financesScreen.commercial")} value={weeklyProjection.commercial} positive />
                <ProjectionRow icon="staff" label={t("financesScreen.playerSalaries")} value={-weeklyProjection.wages} />
                <ProjectionRow icon="building" label={t("financesScreen.operational")} value={-weeklyProjection.operational} />
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("financesScreen.weeklyProfitLoss")}</span>
                  {(() => {
                    const net = weeklyProjection.commercial - weeklyProjection.wages - weeklyProjection.operational;
                    return (
                      <span className={`text-lg font-black font-display ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {net >= 0 ? "+" : ""}{formatCurrency(net)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("financesScreen.loading")}</p>
            )}
          </div>

          <div className="card-arcade rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-primary flex items-center gap-2">
                <Icon name="building" size={16} />
                {t("financesScreen.gateProjection")}
              </h3>
              {squad?.venue && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Icon name="map-pin" size={12} />
                  {squad.venue.city}
                </span>
              )}
            </div>
            {gateProjections.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("financesScreen.noUpcomingHomeGames")}</p>
            ) : (
              <>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {gateProjections.slice(0, 6).map((g) => (
                    <div key={g.fixture.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="text-foreground m-0 truncate">
                          {competitionName(g.fixture.competition, leagues, i18n.language)}
                        </p>
                        <p className="text-[10px] text-muted-foreground m-0">{g.fixture.date}</p>
                      </div>
                      <span className="text-emerald-400 font-semibold shrink-0 ml-2">{formatCurrency(g.projected)}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {t("financesScreen.homeGames", { count: gateProjections.length })}
                  </span>
                  <span className="text-sm font-bold text-emerald-400">{formatCurrency(projectedRemainingGate)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Ledger list */}
        <div className="card-arcade rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold font-display uppercase tracking-wider text-primary">
              {t("financesScreen.ledgerTitle")}
            </h3>
            <select
              className="bg-white/[0.03] border border-white/10 rounded-lg text-xs text-foreground px-2 py-1.5"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as LedgerKind | "all")}
            >
              <option value="all">{t("financesScreen.allKinds")}</option>
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>{t(KIND_META[k].labelKey)}</option>
              ))}
            </select>
          </div>

          {filteredEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("financesScreen.noEntries")}</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-auto">
              {filteredEntries.map((entry, i) => {
                const meta = KIND_META[entry.kind];
                return (
                  <div
                    key={`${entry.date}-${entry.kind}-${i}`}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03]"
                  >
                    <div className="w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                      <Icon name={meta.icon} size={14} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground m-0 truncate">{entry.label}</p>
                      <p className="text-[10px] text-muted-foreground m-0">
                        {entry.date} · {t(meta.labelKey)}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${entry.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {entry.amount >= 0 ? "+" : ""}{formatCurrency(entry.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function OverviewCard({
  icon, iconBg, iconColor, label, value, valueColor,
}: {
  icon: IconName; iconBg: string; iconColor: string;
  label: string; value: string; valueColor: string;
}) {
  return (
    <div className="card-arcade rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon name={icon} size={16} className={iconColor} />
        </div>
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className={`text-2xl font-black font-display ${valueColor} m-0`}>{value}</p>
    </div>
  );
}

function KindBreakdown({
  titleKey, titleColor, kinds, totals, maxBar, barColor, total, totalColor, absolute,
}: {
  titleKey: string;
  titleColor: string;
  kinds: LedgerKind[];
  totals: Record<LedgerKind, number> | undefined;
  maxBar: number;
  barColor: string;
  total: number;
  totalColor: string;
  absolute?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-sm font-bold font-display uppercase tracking-wider ${titleColor}`}>{t(titleKey)}</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40 px-2 py-1 rounded">
          {t("financesScreen.seasonBasis")}
        </span>
      </div>
      <div className="space-y-4">
        {kinds.map((k) => {
          const meta = KIND_META[k];
          const raw = totals?.[k] ?? 0;
          const value = absolute ? Math.abs(raw) : raw;
          const pct = (value / maxBar) * 100;
          return (
            <div key={k}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-muted/40 flex items-center justify-center">
                    <Icon name={meta.icon} size={12} className="text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">{t(meta.labelKey)}</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(value)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("financesScreen.seasonTotal")}</span>
        <span className={`text-lg font-black font-display ${totalColor}`}>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function ProjectionRow({ icon, label, value, positive }: { icon: IconName; label: string; value: number; positive?: boolean }) {
  const color = positive ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-foreground";
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon name={icon} size={12} />
        {label}
      </div>
      <span className={`font-semibold ${color}`}>{value >= 0 ? "+" : ""}{formatCurrency(value)}/wk</span>
    </div>
  );
}
