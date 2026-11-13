import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { LeagueData } from "@/types/playerTypes";
import { competitionName } from "@/Domain/world/labels";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { weeklyOperationalCost } from "@/Domain/advanceDay/financial";
import { squadStaffWages } from "@/Domain/staff/staff";
import type { LedgerEntry, LedgerKind } from "@/Domain/finance/ledger";
import { describeLedgerEntry } from "@/Domain/finance/ledgerText";
import { averageGate, buildStatement, journalRows, lastWeekScouting, monthsOf, resolveMonth } from "@/Domain/finance/statement";
import { BankLoanCard } from "@/GameInterface/Finances/BankLoanCard";
import { BalanceStrip, JournalCard, PeriodControl, StatementCard, WeekCard, type StatementMode } from "@/GameInterface/Finances/FinanceStatement";
import { navigate } from "@/GameInterface/router/navigation";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { SponsorsPanel } from "@/GameInterface/Sponsors/SponsorsPanel";
import { weeklyCommercialIncome } from "@/Domain/sponsors/sponsors";

type FinancesTab = "accounts" | "sponsors";

// ── API shape (GET /api/saves/:saveId/ledger?season=) ───────────────────────

interface LedgerApiResponse {
  season: number;
  seasons: number[];
  entries: LedgerEntry[];
  /** The balance the season began with. */
  opening: number;
  balance: number;
}

const KIND_LABEL: Record<LedgerKind, string> = {
  broadcasting: "financesScreen.broadcasting",
  commercial: "financesScreen.commercial",
  gate: "financesScreen.gate",
  prize: "financesScreen.prize",
  transfer_in: "financesScreen.transfersIn",
  board_funding: "financesScreen.boardFunding",
  wages: "financesScreen.playerSalaries",
  staff: "financesScreen.staffSalaries",
  manager: "financesScreen.kinds.manager",
  operational: "financesScreen.operational",
  transfer_out: "financesScreen.transfersOut",
  facilities: "financesScreen.facilities",
  facilities_upkeep: "financesScreen.facilitiesUpkeep",
  scouting: "financesScreen.scouting",
  loan_payment: "financesScreen.kinds.loan_payment",
  // `club_change` (the manager changed club) is a balance transfer, not income or expense; so is the money of a loan.
  club_change: "financesScreen.clubChange",
  loan_in: "financesScreen.kinds.loan_in",
};
const ALL_KINDS = Object.keys(KIND_LABEL) as LedgerKind[];

// ── Screen ───────────────────────────────────────────────────────────────────

export function FinancesScreen() {
  const { t, i18n } = useTranslation();
  const { session, squad, save, loading: saveLoading, refresh } = useGameSave();

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [ledger, setLedger] = useState<LedgerApiResponse | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [mode, setMode] = useState<StatementMode>("season");
  /** A month of the season, or "first" / "last" while the arrows cross into another season. */
  const [monthPick, setMonthPick] = useState("last");
  const [kindFilter, setKindFilter] = useState<LedgerKind | "all">("all");
  const [ledgerVersion, setLedgerVersion] = useState(0);
  // `?tab=sponsors` opens the sponsors (inbox and dashboard links).
  const [tab, setTab] = useState<FinancesTab>(() =>
    new URLSearchParams(window.location.search).get("tab") === "sponsors" ? "sponsors" : "accounts");
  // The facilities moved to the Club screen (#120): old `/finances?tab=facilities` links go there.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "facilities") navigate("/club", { replace: true });
  }, []);

  // Translated text of a ledger line from its kind + ref; the stored English label is only a fallback.
  const ledgerText = (entry: LedgerEntry): string => {
    const d = describeLedgerEntry(entry);
    if (!d) return entry.label;
    return t(`financesScreen.ledgerText.${d.key}`, {
      competition: d.competition ? competitionName(d.competition, leagues, i18n.language) : "",
      stage: d.stage ? t(`${d.stageScope === "continental" ? "continental" : "cups"}.stage.${d.stage}`) : "",
      position: d.position,
      club: d.club ?? "",
      player: d.player ?? "",
      facility: d.facility ? t(`facilities.kind.${d.facility}`) : "",
      item: d.item ? t(`facilities.item.${d.item}`) : "",
    });
  };

  useEffect(() => {
    if (!saveLoading && !session) navigate("/new-game");
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
  }, [session?.saveId, selectedSeason, session?.currentDate, ledgerVersion]);

  const entries = useMemo(() => ledger?.entries ?? [], [ledger]);
  const seasons = useMemo(() => [...(ledger?.seasons ?? [])].sort((a, b) => a - b), [ledger]);
  const seasonIndex = ledger ? seasons.indexOf(ledger.season) : -1;
  const months = useMemo(() => monthsOf(entries), [entries]);
  const month = mode === "month" ? resolveMonth(months, monthPick) : null;
  const monthIndex = month ? months.indexOf(month) : -1;

  const statement = useMemo(() => buildStatement(entries, ledger?.opening ?? 0, month), [entries, ledger?.opening, month]);
  const rows = useMemo(() => {
    const all = journalRows(statement.entries, statement.closing);
    return kindFilter === "all" ? all : all.filter((r) => r.entry.kind === kindFilter);
  }, [statement, kindFilter]);

  // The weekly lines via the exact same pure formulas the server uses.
  const weekLines = useMemo(() => {
    if (!squad) return [];
    const manager = save?.managerContract?.squadId === squad.id ? save.managerContract.wage : 0;
    const loan = squad.bankLoan ? Math.min(squad.bankLoan.weekly, squad.bankLoan.remaining) : 0;
    const scouting = ledger && ledger.season === seasons[seasons.length - 1] ? lastWeekScouting(entries) : 0;
    const label = (account: string) => t(`financesScreen.statement.accounts.${account}`);
    return [
      // The sponsors' contracts once the club has them, else the old weekly commercial income.
      { label: label("commercial"), value: weeklyCommercialIncome(squad) },
      { label: label("wages"), value: -squadWeeklyWages(squad.players, wageFactorOf(squad)) },
      { label: label("staff"), value: -squadStaffWages(squad.staff) },
      ...(manager > 0 ? [{ label: label("manager"), value: -manager }] : []),
      { label: label("operational"), value: -weeklyOperationalCost(squad) },
      ...(scouting !== 0 ? [{ label: label("scouting"), value: scouting }] : []),
      ...(loan > 0 ? [{ label: label("loan_payment"), value: -loan }] : []),
    ];
  }, [squad, save?.managerContract, ledger, seasons, entries, t]);

  if (saveLoading || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("financesScreen.loading")}</p>
      </div>
    );
  }

  const balance = ledger?.balance ?? squad?.finances?.budget ?? 0;

  const step = (dir: -1 | 1) => {
    if (month) {
      const neighbour = months[monthIndex + dir];
      if (neighbour) { setMonthPick(neighbour); return; }
    }
    const season = seasons[seasonIndex + dir];
    if (season === undefined) return;
    setSelectedSeason(season);
    setMonthPick(dir < 0 ? "last" : "first");
  };
  const canStep = (dir: -1 | 1) => (month && months[monthIndex + dir] !== undefined) || seasons[seasonIndex + dir] !== undefined;

  const periodLabel = month
    ? new Date(`${month}-15T12:00:00Z`).toLocaleDateString(i18n.language, { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "")
    : String(ledger?.season ?? "–");
  const shortDate = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;

  return (
    <ScreenContainer>
        <ScreenTitle
          accent={t("screenTitles.finances.accent")}
          trailing={ledger && tab === "accounts" ? (
            <PeriodControl
              mode={mode}
              onMode={(m) => { setMode(m); setMonthPick("last"); }}
              label={periodLabel}
              canPrev={Boolean(canStep(-1))}
              canNext={Boolean(canStep(1))}
              onStep={step}
            />
          ) : undefined}
        >
          {t("screenTitles.finances.main")}
        </ScreenTitle>

        <SegmentedTabs
          aria-label={t("sponsors.tabsLabel")}
          tabs={[
            { key: "accounts", label: t("sponsors.tabAccounts") },
            { key: "sponsors", label: t("sponsors.tab") },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "sponsors" && (
          <SponsorsPanel saveId={session.saveId} onChanged={() => { void refresh({ background: true }); }} />
        )}

        {tab === "accounts" && balance < 0 && (
          <div className="card-arcade rounded-md p-4 border border-destructive/50 bg-destructive/10 flex items-start gap-3">
            <Icon name="alert" size={20} className="text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground m-0">{t("finances.warnings.negativeBudgetTitle")}</p>
              <p className="text-sm text-muted-foreground mt-0.5 m-0">{t("finances.warnings.negativeBudget")}</p>
            </div>
          </div>
        )}

        {tab !== "accounts" ? null : ledger ? (
          <>
            <BalanceStrip statement={statement} />
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-4">
              <StatementCard statement={statement} month={month !== null} />
              <JournalCard
                rows={rows}
                describe={ledgerText}
                dateOf={shortDate}
                filter={
                  <select
                    aria-label={t("financesScreen.allKinds")}
                    className="bg-foreground/5 border border-border rounded-lg text-sm text-foreground px-2 py-1.5"
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as LedgerKind | "all")}
                  >
                    <option value="all">{t("financesScreen.allKinds")}</option>
                    {ALL_KINDS.map((k) => (
                      <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
                    ))}
                  </select>
                }
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground m-0">{t("financesScreen.noEntries")}</p>
        )}

        {tab === "accounts" && <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-4 items-start">
          {squad && <WeekCard lines={weekLines} avgGate={averageGate(entries)} />}
          {squad && (
            <BankLoanCard
              saveId={session.saveId}
              squad={squad}
              {...(save?.board ? { board: save.board.board } : {})}
              onTaken={() => { void refresh({ background: true }); setLedgerVersion((v) => v + 1); }}
            />
          )}
        </div>}
    </ScreenContainer>
  );
}
