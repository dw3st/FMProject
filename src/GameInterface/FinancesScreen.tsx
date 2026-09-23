import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Wallet, TrendingUp, TrendingDown, Users as UsersIcon,
  Tv, Handshake, Building2,
  AlertTriangle, CreditCard, MapPin, Users, Expand,
  ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { GameSession } from "@/GameInterface/gameSession";
import type { Squad, RosterPlayer, LeagueData } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { TransferRecord } from "@/types/transferTypes";
import { Player } from "@/Domain/Player";
import { computeStandings } from "@/Domain/season";

// ── Salary estimation ────────────────────────────────────────────────────────

function estimateWeeklyWage(p: RosterPlayer): number {
  const rating = Player.overallAvg(p);
  return Math.round(Math.pow(rating, 2.2) * 50);
}

function calcWeeklyPlayerSalary(players: RosterPlayer[]): number {
  return players.reduce((sum, p) => sum + estimateWeeklyWage(p), 0);
}

// ── Attendance formula ───────────────────────────────────────────────────────

const TICKET_PRICE = 25;

/** Form score: W=1, D=0.5, L=0, over last 5 games → 0..1 */
function formScore(form: ("W" | "D" | "L")[]): number {
  if (!form.length) return 0.5;
  const pts = form.reduce((s, r) => s + (r === "W" ? 1 : r === "D" ? 0.5 : 0), 0);
  return pts / 5;
}

/** Position score: 1st=1.0, last=0.0 */
function positionScore(pos: number, total: number): number {
  if (total <= 1) return 1;
  return 1 - (pos - 1) / (total - 1);
}

/**
 * Followers score using log10 scale:
 * 1K → 0, 100M → 1  (maps [3, 8] on log10 → [0, 1])
 */
function followersScore(followers: number): number {
  const log = Math.log10(Math.max(followers, 1_000));
  return Math.min(Math.max((log - 3) / (8 - 3), 0), 1);
}

interface AttendanceEstimate {
  homeCount: number;
  awayCount: number;
  total: number;
  fillPct: number;
  homeFillPct: number;
  formFactor: number;
  positionFactor: number;
  followersFactor: number;
}

/**
 * Home fans: weighted combination of form, position, followers → up to 75% of capacity.
 * Away fans: up to 20% of capacity scaled by away followers (avg league followers used when no specific opponent).
 */
function computeAttendance(
  form: ("W" | "D" | "L")[],
  position: number,
  totalTeams: number,
  homeFollowers: number,
  capacity: number,
  awayFollowers: number,
): AttendanceEstimate {
  const HOME_MIN = 0.20;
  const HOME_MAX = 0.75;

  const ff = formScore(form);
  const pf = positionScore(position, totalTeams);
  const folf = followersScore(homeFollowers);

  const combined = ff * 0.35 + pf * 0.35 + folf * 0.30;
  const homePct = HOME_MIN + combined * (HOME_MAX - HOME_MIN);
  const awayPct = followersScore(awayFollowers) * 0.20;

  const homeCount = Math.round(capacity * homePct);
  const awayCount = Math.round(capacity * awayPct);
  const total = Math.min(homeCount + awayCount, capacity);

  return {
    homeCount,
    awayCount,
    total,
    fillPct: total / capacity,
    homeFillPct: homePct,
    formFactor: ff,
    positionFactor: pf,
    followersFactor: folf,
  };
}

// ── Data shape ───────────────────────────────────────────────────────────────

interface FinanceData {
  budget: number;
  followers: number;
  broadcasting: number;
  weeklyCommercial: number;
  annualCommercial: number;
  weeklyPlayerSalary: number;
  weeklyOperational: number;
  annualPlayerSalary: number;
  annualOperational: number;
  weeklyPL: number;
  profitHistory: { week: string; revenue: number; expenses: number; profit: number }[];
}

function buildFinanceData(session: GameSession, squad: Squad | null): FinanceData {
  const fin = squad?.finances;
  const players = squad?.players ?? [];
  const weeklyPlayerSalary = calcWeeklyPlayerSalary(players);
  const weeklyCommercial = Math.round((fin?.commercial ?? 0) / 52);
  const weeklyOperational = Math.round(weeklyPlayerSalary * 0.1);
  const weeklyPL = weeklyCommercial - weeklyPlayerSalary - weeklyOperational;

  const history: FinanceData["profitHistory"] = [];
  for (let i = 1; i <= 8; i++) {
    const revJitter = 1 + Math.sin(i * 1.3) * 0.08;
    const expJitter = 1 + Math.cos(i * 0.9) * 0.06;
    history.push({
      week: `W${i}`,
      revenue: Math.round(weeklyCommercial * revJitter),
      expenses: Math.round((weeklyPlayerSalary + weeklyOperational) * expJitter),
      profit: Math.round(weeklyPL),
    });
  }

  return {
    budget: fin?.budget ?? session.budget ?? 0,
    followers: fin?.followers ?? 0,
    broadcasting: fin?.broadcasting ?? 0,
    weeklyCommercial,
    annualCommercial: weeklyCommercial * 52,
    weeklyPlayerSalary,
    weeklyOperational,
    annualPlayerSalary: weeklyPlayerSalary * 52,
    annualOperational: weeklyOperational * 52,
    weeklyPL,
    profitHistory: history,
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value}`;
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function FinancesScreen() {
  const { t } = useTranslation();
  const { session, squad, loading: saveLoading, refresh, fixtures } = useGameSave();

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [transferIn, setTransferIn] = useState(0);
  const [transferOut, setTransferOut] = useState(0);

  useEffect(() => {
    if (!saveLoading && !session) window.location.href = "/new-game";
  }, [saveLoading, session]);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((d: LeagueData[]) => setLeagues(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!session?.saveId) return;
    fetch(`/api/saves/${session.saveId}/transfers`)
      .then((r) => r.json())
      .then((d: { club: TransferRecord[] }) => {
        const accepted = d.club.filter((t) => t.status === "accepted");
        setTransferIn(accepted.filter((t) => t.direction === "out").reduce((s, t) => s + t.fee, 0));
        setTransferOut(accepted.filter((t) => t.direction === "in").reduce((s, t) => s + t.fee, 0));
      })
      .catch(() => {});
  }, [session?.saveId]);

  const data = useMemo(
    () => (session ? buildFinanceData(session, squad) : null),
    [session, squad],
  );

  // ── Standings + attendance ──────────────────────────────────────────────

  const attendance = useMemo((): AttendanceEstimate | null => {
    if (!session || !squad) return null;
    const capacity = squad.venue?.capacity ?? 0;
    if (!capacity) return null;

    const leagueEntry = leagues.find((l) => l.slug === session.leagueSlug);
    if (!leagueEntry) return null;

    const standings = computeStandings(leagueEntry.standings, fixtures, session.leagueSlug);
    const myRow = standings.find((r) => r.squadId === squad.id);
    if (!myRow) return null;

    const position = standings.indexOf(myRow) + 1;
    const totalTeams = standings.length;
    const form = myRow.form;
    const homeFollowers = squad.finances?.followers ?? 0;

    // Average away followers across the league as a proxy for a typical opponent
    const leagueAvgFollowers = standings.length > 1
      ? Math.round(standings.reduce((s) => s + homeFollowers, 0) / standings.length)
      : homeFollowers * 0.5;

    return computeAttendance(form, position, totalTeams, homeFollowers, capacity, leagueAvgFollowers);
  }, [session, squad, leagues, fixtures]);

  // Count home games this season (must be before early return — hooks rule)
  const homeGames = useMemo(
    () => fixtures.filter((f) => f.home === squad?.id).length || 19,
    [fixtures, squad?.id],
  );

  if (saveLoading || !session || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("financesScreen.loading")}</p>
      </div>
    );
  }

  const weeklyPL = data.weeklyPL;
  const wageRatio = data.annualCommercial > 0 ? (data.annualPlayerSalary / data.annualCommercial) * 100 : 0;
  const warnings = generateWarnings({ budget: data.budget, weeklyProfitLoss: weeklyPL, wageRatio });

  const annualStadiumRevenue = attendance ? attendance.total * TICKET_PRICE * homeGames : 0;
  const annualSeasonRevenue = data.broadcasting + data.annualCommercial + annualStadiumRevenue + transferIn;
  const annualSeasonExpenses = data.annualPlayerSalary + data.annualOperational + transferOut;

  return (
    <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <PageHeadline backHref="/dashboard">
            {t("common.club")} <span className="text-primary">{t("common.finances")}</span>
          </PageHeadline>

          {/* Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <OverviewCard
              icon={Wallet}
              iconBg="bg-primary/20"
              iconColor="text-primary"
              label={t("financesScreen.budget")}
              value={formatCurrency(data.budget)}
              valueColor={data.budget >= 0 ? "text-primary" : "text-red-400"}
            />
            <OverviewCard
              icon={weeklyPL >= 0 ? TrendingUp : TrendingDown}
              iconBg={weeklyPL >= 0 ? "bg-emerald-500/20" : "bg-red-500/20"}
              iconColor={weeklyPL >= 0 ? "text-emerald-400" : "text-red-400"}
              label={t("financesScreen.weeklyProfitLoss")}
              value={`${weeklyPL >= 0 ? "+" : ""}${formatCurrency(weeklyPL)}`}
              valueColor={weeklyPL >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <OverviewCard
              icon={Tv}
              iconBg="bg-blue-500/20"
              iconColor="text-blue-400"
              label={t("financesScreen.seasonRevenue")}
              value={formatCurrency(annualSeasonRevenue)}
              valueColor="text-blue-400"
            />
            <div className="card-arcade rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <UsersIcon className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t("financesScreen.followers")}</span>
              </div>
              <p className="text-2xl font-black font-display text-foreground m-0">{formatNumber(data.followers)}</p>
            </div>
          </div>

          {/* Revenue / Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueBreakdown
              broadcasting={data.broadcasting}
              annualCommercial={data.annualCommercial}
              annualStadium={annualStadiumRevenue}
              homeGames={homeGames}
              weeklyCommercial={data.weeklyCommercial}
              transferIn={transferIn}
              seasonTotal={annualSeasonRevenue}
            />
            <ExpensesBreakdown
              weeklyPlayerSalary={data.weeklyPlayerSalary}
              weeklyOperational={data.weeklyOperational}
              annualPlayerSalary={data.annualPlayerSalary}
              annualOperational={data.annualOperational}
              transferOut={transferOut}
              seasonTotal={annualSeasonExpenses}
            />
          </div>

          {/* Chart / Venue */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ProfitChart data={data.profitHistory} />
            </div>
            <VenueCard venue={squad?.venue} attendance={attendance} />
          </div>

          {warnings.length > 0 && <FinanceWarnings warnings={warnings} />}
        </div>
    </main>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function OverviewCard({
  icon: Icon, iconBg, iconColor, label, value, valueColor,
}: {
  icon: typeof Wallet; iconBg: string; iconColor: string;
  label: string; value: string; valueColor: string;
}) {
  return (
    <div className="card-arcade rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className={`text-2xl font-black font-display ${valueColor} m-0`}>{value}</p>
    </div>
  );
}

function RevenueBreakdown({
  broadcasting, annualCommercial, annualStadium, homeGames, weeklyCommercial, transferIn, seasonTotal,
}: {
  broadcasting: number;
  annualCommercial: number;
  annualStadium: number;
  homeGames: number;
  weeklyCommercial: number;
  transferIn: number;
  seasonTotal: number;
}) {
  const { t } = useTranslation();
  // All bars on the same annual scale
  const maxBar = Math.max(broadcasting, annualCommercial, annualStadium, transferIn, 1);
  const items = [
    {
      label: t("financesScreen.broadcasting"),
      sub: t("financesScreen.seasonPayment"),
      annual: broadcasting,
      icon: Tv,
      iconBg: "bg-blue-500/20",
      iconColor: "text-blue-400",
      barColor: "bg-blue-500",
    },
    {
      label: t("financesScreen.commercial"),
      sub: `${formatCurrency(weeklyCommercial)}/wk × 52`,
      annual: annualCommercial,
      icon: Handshake,
      iconBg: "bg-purple-500/20",
      iconColor: "text-purple-400",
      barColor: "bg-purple-500",
    },
    {
      label: t("financesScreen.stadium"),
      sub: t("financesScreen.homeGames", { count: homeGames }),
      annual: annualStadium,
      icon: Building2,
      iconBg: "bg-emerald-500/20",
      iconColor: "text-emerald-400",
      barColor: "bg-emerald-500",
    },
    {
      label: t("financesScreen.transfersIn"),
      sub: transferIn > 0 ? t("financesScreen.playerSales") : t("financesScreen.noSales"),
      annual: transferIn,
      icon: ArrowDownLeft,
      iconBg: "bg-teal-500/20",
      iconColor: "text-teal-400",
      barColor: "bg-teal-500",
    },
  ];

  return (
    <div className="card-arcade rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold font-display uppercase tracking-wider text-primary">{t("financesScreen.revenueBreakdown")}</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40 px-2 py-1 rounded">{t("financesScreen.annualBasis")}</span>
      </div>
      <div className="space-y-4">
        {items.map((item) => {
          const Icon = item.icon;
          const pct = (item.annual / maxBar) * 100;
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded ${item.iconBg} flex items-center justify-center`}>
                    <Icon className={`w-3 h-3 ${item.iconColor}`} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-1.5">{item.sub}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(item.annual)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${item.barColor} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("financesScreen.seasonTotal")}</span>
        <span className="text-lg font-black font-display text-emerald-400">{formatCurrency(seasonTotal)}</span>
      </div>
    </div>
  );
}

function ExpensesBreakdown({
  weeklyPlayerSalary, weeklyOperational, annualPlayerSalary, annualOperational, transferOut, seasonTotal,
}: {
  weeklyPlayerSalary: number;
  weeklyOperational: number;
  annualPlayerSalary: number;
  annualOperational: number;
  transferOut: number;
  seasonTotal: number;
}) {
  const { t } = useTranslation();
  const weeklyTotal = weeklyPlayerSalary + weeklyOperational;
  // All bars on annual scale
  const maxBar = Math.max(annualPlayerSalary, annualOperational, transferOut, 1);
  const items = [
    {
      label: t("financesScreen.playerSalaries"),
      sub: t("financesScreen.weekly", { value: formatCurrency(weeklyPlayerSalary) }),
      annual: annualPlayerSalary,
      icon: Users,
      color: "bg-red-500",
    },
    {
      label: t("financesScreen.operational"),
      sub: t("financesScreen.weekly", { value: formatCurrency(weeklyOperational) }),
      annual: annualOperational,
      icon: Building2,
      color: "bg-orange-500",
    },
    {
      label: t("financesScreen.transfersOut"),
      sub: transferOut > 0 ? t("financesScreen.playerPurchases") : t("financesScreen.noPurchases"),
      annual: transferOut,
      icon: ArrowUpRight,
      color: "bg-amber-500",
    },
  ];

  return (
    <div className="card-arcade rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold font-display uppercase tracking-wider text-red-400">{t("financesScreen.expenses")}</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40 px-2 py-1 rounded">{t("financesScreen.annualBasis")}</span>
      </div>
      <div className="space-y-4">
        {items.map((item) => {
          const Icon = item.icon;
          const pct = (item.annual / maxBar) * 100;
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded ${item.color}/20 flex items-center justify-center`}>
                    <Icon className={`w-3 h-3 ${item.color.replace("bg-", "text-")}`} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-1.5">{item.sub}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(item.annual)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("financesScreen.seasonTotal")}</span>
          <span className="text-lg font-black font-display text-red-400">{formatCurrency(seasonTotal)}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">{t("financesScreen.weeklyOutgoing")}</span>
          <span className="text-xs font-semibold text-muted-foreground">{formatCurrency(weeklyTotal)}/wk</span>
        </div>
      </div>
    </div>
  );
}

function ProfitChart({ data }: { data: { week: string; revenue: number; expenses: number; profit: number }[] }) {
  const { t } = useTranslation();
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="card-arcade rounded-xl p-4 h-full">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-primary mb-4">
        {t("financesScreen.estWeeklyRevenue")}
      </h3>
      <div className="flex items-end gap-2 h-48">
        {data.map((d) => {
          const revH = (d.revenue / maxRevenue) * 100;
          const profH = (Math.abs(d.profit) / maxRevenue) * 100;
          return (
            <div key={d.week} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-0.5 flex-1">
                <div className="relative flex-1 flex items-end justify-center group">
                  <div className="w-full bg-emerald-500/30 rounded-t" style={{ height: `${revH}%` }} />
                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="bg-card border border-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                      <span className="text-emerald-400">{t("financesScreen.revenue")}: {formatCurrency(d.revenue)}</span>
                    </div>
                  </div>
                </div>
                <div className="relative flex-1 flex items-end justify-center group">
                  <div
                    className={`w-full rounded-t ${d.profit >= 0 ? "bg-blue-500/40" : "bg-red-500/40"}`}
                    style={{ height: `${profH}%` }}
                  />
                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="bg-card border border-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                      <span className={d.profit >= 0 ? "text-blue-400" : "text-red-400"}>
                        P/L: {d.profit >= 0 ? "+" : ""}{formatCurrency(d.profit)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">{d.week}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-6 mt-3 pt-2 border-t border-border/30">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500/30" />
          <span className="text-[10px] text-muted-foreground">{t("financesScreen.revenue")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-500/40" />
          <span className="text-[10px] text-muted-foreground">{t("financesScreen.profit")}</span>
        </div>
      </div>
    </div>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function VenueCard({
  venue, attendance,
}: {
  venue?: { name: string; city: string; capacity: number; surface?: string };
  attendance: AttendanceEstimate | null;
}) {
  const { t } = useTranslation();
  if (!venue) {
    return (
      <div className="card-arcade rounded-xl p-4 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">{t("financesScreen.noStadiumData")}</p>
      </div>
    );
  }

  const fillPct = attendance ? Math.round(attendance.fillPct * 100) : null;
  const fillColor = fillPct == null ? "text-muted-foreground"
    : fillPct >= 70 ? "text-emerald-400"
    : fillPct >= 45 ? "text-yellow-400"
    : "text-red-400";
  const barColor = fillPct == null ? "bg-muted"
    : fillPct >= 70 ? "bg-emerald-500"
    : fillPct >= 45 ? "bg-yellow-500"
    : "bg-red-500";

  const matchRevenue = attendance
    ? formatCurrency(attendance.total * TICKET_PRICE)
    : "—";

  return (
    <div className="card-arcade rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold font-display uppercase tracking-wider text-primary flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          {t("financesScreen.stadiumHeader")}
        </h3>
        <div className="group relative">
          <button
            disabled
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-[10px] text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Expand className="w-3 h-3" />
            {t("financesScreen.expand")}
          </button>
          <div className="absolute right-0 top-7 w-28 px-2 py-1.5 bg-card border border-border rounded-lg text-[10px] text-muted-foreground opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
            {t("financesScreen.comingSoon")}
          </div>
        </div>
      </div>

      {/* Name + city */}
      <p className="text-base font-bold text-foreground leading-tight mb-0.5">{venue.name}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <MapPin className="w-3 h-3 shrink-0" />
        <span>{venue.city}</span>
      </div>

      {/* Capacity + surface */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="p-2.5 bg-muted/40 rounded-lg">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t("financesScreen.capacity")}</p>
          <p className="text-base font-black font-display text-foreground">{venue.capacity.toLocaleString()}</p>
        </div>
        <div className="p-2.5 bg-muted/40 rounded-lg">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t("financesScreen.ticket")}</p>
          <p className="text-base font-black font-display text-foreground">€{TICKET_PRICE}</p>
        </div>
      </div>

      {/* Attendance estimate */}
      {attendance ? (
        <div className="pt-3 border-t border-border space-y-3">
          {/* Fill bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">{t("financesScreen.estAttendanceNextGame")}</span>
              <span className={`text-sm font-black font-display ${fillColor}`}>
                {formatNumber(attendance.total)} <span className="text-[10px] font-normal">({fillPct}%)</span>
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full`} style={{ width: `${fillPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{t("financesScreen.homeAway", { home: formatNumber(attendance.homeCount), away: formatNumber(attendance.awayCount) })}</span>
            </div>
          </div>

          {/* Factor bars */}
          <div className="space-y-1.5">
            <FactorBar label={t("financesScreen.formLastFive")} value={attendance.formFactor} />
            <FactorBar label={t("financesScreen.leaguePosition")} value={attendance.positionFactor} />
            <FactorBar label={t("financesScreen.fanBase")} value={attendance.followersFactor} />
          </div>

          {/* Match revenue estimate */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("financesScreen.matchRevenueEst")}</span>
            <span className="text-xs font-bold text-emerald-400">{matchRevenue}</span>
          </div>
        </div>
      ) : (
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground">{t("financesScreen.playMatchesToSeeAttendance")}</p>
        </div>
      )}
    </div>
  );
}

// ── Warnings ─────────────────────────────────────────────────────────────────

interface Warning {
  id: string;
  type: "danger" | "warning" | "info";
  titleKey: string;
  messageKey: string;
  /** Interpolation values for the message key. */
  vars?: Record<string, string | number>;
  icon: typeof AlertTriangle;
}

function generateWarnings(d: {
  budget: number;
  weeklyProfitLoss: number;
  wageRatio: number;
}): Warning[] {
  const out: Warning[] = [];

  if (d.budget < 0) {
    out.push({
      id: "negative-budget",
      type: "danger",
      titleKey: "finances.warnings.negativeBudgetTitle",
      messageKey: "finances.warnings.negativeBudget",
      icon: CreditCard,
    });
  }

  if (d.weeklyProfitLoss < -500_000) {
    out.push({
      id: "heavy-losses",
      type: "danger",
      titleKey: "finances.warnings.heavyLossesTitle",
      messageKey: "finances.warnings.heavyLosses",
      icon: TrendingDown,
    });
  } else if (d.weeklyProfitLoss < 0) {
    out.push({
      id: "weekly-loss",
      type: "warning",
      titleKey: "finances.warnings.weeklyLossTitle",
      messageKey: "finances.warnings.weeklyLoss",
      icon: TrendingDown,
    });
  }

  if (d.wageRatio > 80) {
    out.push({
      id: "high-wages",
      type: "warning",
      titleKey: "finances.warnings.highWagesTitle",
      messageKey: "finances.warnings.highWages",
      vars: { ratio: d.wageRatio.toFixed(0) },
      icon: UsersIcon,
    });
  }

  return out;
}

function FinanceWarnings({ warnings }: { warnings: Warning[] }) {
  const { t } = useTranslation();
  const styles: Record<Warning["type"], { border: string; icon: string }> = {
    danger: { border: "border-red-500/50 bg-red-500/10", icon: "text-red-400" },
    warning: { border: "border-yellow-500/50 bg-yellow-500/10", icon: "text-yellow-400" },
    info: { border: "border-blue-500/50 bg-blue-500/10", icon: "text-blue-400" },
  };
  return (
    <div className="card-arcade rounded-xl p-4">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-yellow-400 flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4" />
        {t("finances.alerts")}
      </h3>
      <div className="space-y-2">
        {warnings.map((w) => {
          const Icon = w.icon;
          const s = styles[w.type];
          return (
            <div key={w.id} className={`flex items-start gap-3 p-3 rounded-lg border ${s.border}`}>
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.icon}`} />
              <div>
                <p className="text-sm font-semibold text-foreground m-0">{t(w.titleKey)}</p>
                <p className="text-xs text-muted-foreground mt-0.5 m-0">{t(w.messageKey, w.vars ?? {})}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
