import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { LeagueData } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { competitionName } from "@/Domain/world/labels";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { weeklyOperationalCost } from "@/Domain/advanceDay/financial";
import { squadStaffWages } from "@/Domain/staff/staff";
import { gateRevenue, type GateKind } from "@/Domain/finance/gate";
import type { LedgerEntry, LedgerKind } from "@/Domain/finance/ledger";
import { describeLedgerEntry } from "@/Domain/finance/ledgerText";
import { stadiumFillRate } from "@/Domain/boardFans/boardFans";

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
const EXPENSE_KINDS: LedgerKind[] = ["wages", "staff", "operational", "transfer_out"];
const ALL_KINDS: LedgerKind[] = [...INCOME_KINDS, ...EXPENSE_KINDS];

const KIND_META: Record<LedgerKind, { icon: IconName; labelKey: string }> = {
  broadcasting: { icon: "broadcast", labelKey: "financesScreen.broadcasting" },
  commercial: { icon: "handshake", labelKey: "financesScreen.commercial" },
  gate: { icon: "building", labelKey: "financesScreen.gate" },
  prize: { icon: "trophy", labelKey: "financesScreen.prize" },
  transfer_in: { icon: "arrow-down-left", labelKey: "financesScreen.transfersIn" },
  wages: { icon: "staff", labelKey: "financesScreen.playerSalaries" },
  staff: { icon: "staff", labelKey: "financesScreen.staffSalaries" },
  operational: { icon: "building", labelKey: "financesScreen.operational" },
  transfer_out: { icon: "arrow-up-right", labelKey: "financesScreen.transfersOut" },
};

function fixtureGateKind(competitionSlug: string): GateKind {
  return isContinentalSlug(competitionSlug) ? "continental" : isCupSlug(competitionSlug) ? "cup" : "league";
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function FinancesScreen() {
  const { t, i18n } = useTranslation();
  const { session, squad, save, loading: saveLoading, fixtures } = useGameSave();
  // Stadium fill from the fans (`.claude/rules/game/board-fans.md`), the same rate the server uses.
  const fans = save?.board?.fans;
  const fillRate = fans === undefined ? undefined : stadiumFillRate(fans);

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [ledger, setLedger] = useState<LedgerApiResponse | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [kindFilter, setKindFilter] = useState<LedgerKind | "all">("all");

  // Translated text of a ledger line from its kind + ref; the stored English label is only a fallback.
  const ledgerText = (entry: LedgerEntry): string => {
    const d = describeLedgerEntry(entry);
    if (!d) return entry.label;
    return t(`financesScreen.ledgerText.${d.key}`, {
      competition: d.competition ? competitionName(d.competition, leagues, i18n.language) : "",
      stage: d.stage ? t(`${d.stageScope === "continental" ? "continental" : "cups"}.stage.${d.stage}`) : "",
      position: d.position,
      club: d.club ?? "",
    });
  };

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
      staff: squadStaffWages(squad.staff, wageFactorOf(squad)),
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
        return { fixture: f, kind, projected: gateRevenue(capacity, kind, f.neutral, fillRate) };
      });
  }, [fixtures, squad, session, fillRate]);

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
    <ScreenContainer>
        <PageHeadline
          backHref="/dashboard"
          trailing={
            ledger && ledger.seasons.length > 1 ? (
              <select
                className="bg-foreground/5 border border-border rounded-lg text-sm text-foreground px-2 py-1.5"
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
            valueColor={balance >= 0 ? "text-primary" : "text-destructive"}
          />
          <OverviewCard
            icon="trend-up"
            iconBg="bg-chart-2/20"
            iconColor="text-chart-2"
            label={t("financesScreen.seasonIncome")}
            value={formatCurrency(seasonIncome)}
            valueColor="text-chart-2"
          />
          <OverviewCard
            icon="trend-down"
            iconBg="bg-destructive/20"
            iconColor="text-destructive"
            label={t("financesScreen.seasonExpenses")}
            value={formatCurrency(seasonExpenses)}
            valueColor="text-destructive"
          />
          <OverviewCard
            icon="trophy"
            iconBg="bg-chart-4/20"
            iconColor="text-chart-4"
            label={t("financesScreen.seasonPrizes")}
            value={formatCurrency(seasonPrizes)}
            valueColor="text-chart-4"
          />
        </div>

        {balance < 0 && (
          <div className="card-arcade rounded-md p-4 border border-destructive/50 bg-destructive/10 flex items-start gap-3">
            <Icon name="alert" size={20} className="text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground m-0">{t("finances.warnings.negativeBudgetTitle")}</p>
              <p className="text-sm text-muted-foreground mt-0.5 m-0">{t("finances.warnings.negativeBudget")}</p>
            </div>
          </div>
        )}

        {/* Weekly net chart (real ledger data) */}
        <div className="card-arcade rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-black uppercase text-xl leading-none m-0">
              {t("financesScreen.weeklyNet")}
            </h3>
            <span className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] bg-muted/40 px-2 py-1 rounded font-display font-bold">
              {t("financesScreen.last12Weeks")}
            </span>
          </div>
          {weeklyChart.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("financesScreen.noEntries")}</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {weeklyChart.map((w) => {
                const h = (Math.abs(w.net) / maxWeeklyAbs) * 100;
                return (
                  <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="relative w-full flex-1 flex items-end justify-center group">
                      <div
                        className={`w-full rounded-t ${w.net >= 0 ? "bg-chart-2/50" : "bg-destructive/50"}`}
                        style={{ height: `${h}%` }}
                      />
                      <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <div className="bg-card border border-border rounded-lg px-2 py-1 text-sm tabular-nums whitespace-nowrap">
                          <span className={w.net >= 0 ? "text-chart-2" : "text-destructive"}>
                            {w.net >= 0 ? "+" : ""}{formatCurrency(w.net)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatWeekLabel(w.weekStart)}</span>
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
            titleColor="text-chart-2"
            kinds={INCOME_KINDS}
            totals={totals}
            maxBar={maxIncomeBar}
            barColor="bg-chart-2"
            total={seasonIncome}
            totalColor="text-chart-2"
          />
          <KindBreakdown
            titleKey="financesScreen.expenses"
            titleColor="text-destructive"
            kinds={EXPENSE_KINDS}
            totals={totals}
            maxBar={maxExpenseBar}
            barColor="bg-destructive"
            total={seasonExpenses}
            totalColor="text-destructive"
            absolute
          />
        </div>

        {/* Projections: weekly cost bill + upcoming gate revenue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-arcade rounded-md p-4">
            <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-4">
              {t("financesScreen.weeklyProjection")}
            </h3>
            {weeklyProjection ? (
              <div className="space-y-2">
                <ProjectionRow icon="handshake" label={t("financesScreen.commercial")} value={weeklyProjection.commercial} positive />
                <ProjectionRow icon="staff" label={t("financesScreen.playerSalaries")} value={-weeklyProjection.wages} />
                <ProjectionRow icon="staff" label={t("financesScreen.staffSalaries")} value={-weeklyProjection.staff} />
                <ProjectionRow icon="building" label={t("financesScreen.operational")} value={-weeklyProjection.operational} />
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] font-display font-bold">{t("financesScreen.weeklyProfitLoss")}</span>
                  {(() => {
                    const net = weeklyProjection.commercial - weeklyProjection.wages - weeklyProjection.staff - weeklyProjection.operational;
                    return (
                      <span className={`tabular-nums text-lg font-black font-display ${net >= 0 ? "text-chart-2" : "text-destructive"}`}>
                        {net >= 0 ? "+" : ""}{formatCurrency(net)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("financesScreen.loading")}</p>
            )}
          </div>

          <div className="card-arcade rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-black uppercase text-xl leading-none m-0 flex items-center gap-2">
                <Icon name="building" size={16} />
                {t("financesScreen.gateProjection")}
              </h3>
              {squad?.venue && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Icon name="map-pin" size={12} />
                  {squad.venue.city}
                </span>
              )}
            </div>
            {gateProjections.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("financesScreen.noUpcomingHomeGames")}</p>
            ) : (
              <>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {gateProjections.slice(0, 6).map((g) => (
                    <div key={g.fixture.id} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="text-foreground m-0 truncate">
                          {competitionName(g.fixture.competition, leagues, i18n.language)}
                        </p>
                        <p className="text-sm text-muted-foreground m-0">{g.fixture.date}</p>
                      </div>
                      <span className="text-chart-2 font-semibold shrink-0 ml-2 tabular-nums">{formatCurrency(g.projected)}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] font-display font-bold">
                    {t("financesScreen.homeGames", { count: gateProjections.length })}
                  </span>
                  <span className="text-sm font-bold text-chart-2 tabular-nums">{formatCurrency(projectedRemainingGate)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Ledger list */}
        <div className="card-arcade rounded-md p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="font-display font-black uppercase text-xl leading-none m-0">
              {t("financesScreen.ledgerTitle")}
            </h3>
            <select
              className="bg-foreground/5 border border-border rounded-lg text-sm text-foreground px-2 py-1.5"
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
            <p className="text-sm text-muted-foreground">{t("financesScreen.noEntries")}</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-auto">
              {filteredEntries.map((entry, i) => {
                const meta = KIND_META[entry.kind];
                return (
                  <div
                    key={`${entry.date}-${entry.kind}-${i}`}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-foreground/5"
                  >
                    <div className="w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                      <Icon name={meta.icon} size={14} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground m-0 truncate">{ledgerText(entry)}</p>
                      <p className="text-sm text-muted-foreground m-0">
                        {entry.date} · {t(meta.labelKey)}
                      </p>
                    </div>
                    <span className={`tabular-nums text-sm font-semibold shrink-0 ${entry.amount >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      {entry.amount >= 0 ? "+" : ""}{formatCurrency(entry.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </ScreenContainer>
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
    <div className="card-arcade rounded-md p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon name={icon} size={16} className={iconColor} />
        </div>
        <span className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] font-bold font-display">{label}</span>
      </div>
      <p className={`text-2xl font-black font-display tabular-nums ${valueColor} m-0`}>{value}</p>
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
    <div className="card-arcade rounded-md p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-[13px] font-bold font-display uppercase tracking-[0.08em] ${titleColor}`}>{t(titleKey)}</h3>
        <span className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] bg-muted/40 px-2 py-1 rounded font-display font-bold">
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
                  <span className="text-sm text-muted-foreground">{t(meta.labelKey)}</span>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(value)}</span>
              </div>
              <div className="h-1.5 bg-border rounded overflow-hidden w-full min-w-16">
                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] font-display font-bold">{t("financesScreen.seasonTotal")}</span>
        <span className={`tabular-nums text-lg font-black font-display ${totalColor}`}>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function ProjectionRow({ icon, label, value, positive }: { icon: IconName; label: string; value: number; positive?: boolean }) {
  const { t } = useTranslation();
  const color = positive ? "text-chart-2" : value < 0 ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon name={icon} size={12} />
        {label}
      </div>
      <span className={`tabular-nums font-semibold ${color}`}>{value >= 0 ? "+" : ""}{formatCurrency(value)}{t("financesScreen.weekly")}</span>
    </div>
  );
}
