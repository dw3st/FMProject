import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import type { CategoryLine, SimpleBreakdown, TopLines } from "@/Domain/finance/overview";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";

/**
 * The plain tabs of the Finances screen (user request): the summary dashboard, the money by plain category and the
 * sponsorship income. The full accounting stays in `FinanceStatement`.
 */

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const money = (v: number) => (v === 0 ? "€0" : formatFee(v));
const tone = (v: number) => (v < 0 ? "text-destructive" : "text-foreground");

function Kpi({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="flex flex-col gap-1 min-w-0 px-4 py-3 rounded-md border border-border bg-secondary/30">
      <span className={LABEL}>{label}</span>
      <span className={`font-display font-bold text-2xl leading-none tabular-nums whitespace-nowrap ${signed ? tone(value) : "text-foreground"}`}>
        {signed && value > 0 ? "+" : ""}{money(value)}
      </span>
    </div>
  );
}

/** One line with its share of the side's total as a bar. */
function ShareRow({ label, amount, share, negative }: { label: string; amount: number; share: number; negative?: boolean }) {
  const { i18n } = useTranslation();
  const pct = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 0 }).format(share);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_96px] sm:grid-cols-[minmax(0,1fr)_minmax(64px,160px)_48px_96px] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm tabular-nums">
      <span className="truncate text-foreground">{label}</span>
      <span className="text-right font-semibold order-2 sm:order-4">{negative ? `−${money(amount)}` : money(amount)}</span>
      <span className="col-span-2 sm:col-span-1 order-3 sm:order-2 h-1.5 rounded bg-border overflow-hidden" role="presentation">
        <span className={`block h-full ${negative ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }} />
      </span>
      <span className="hidden sm:block order-3 text-right text-muted-foreground">{pct}</span>
    </div>
  );
}

function SideCard({ title, total, lines, negative }: {
  title: string;
  total: number;
  lines: { key: string; label: string; amount: number; share: number }[];
  negative?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className={`${TABLE_STYLE.shell} min-w-0`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <SectionTitle>{title}</SectionTitle>
        <span className={`font-display font-bold text-xl tabular-nums ${negative ? "text-destructive" : "text-foreground"}`}>{negative ? `−${money(total)}` : money(total)}</span>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0 p-4">{t("financesScreen.overview.nothing")}</p>
      ) : (
        <div className={TABLE_STYLE.body}>
          {lines.map((l) => <ShareRow key={l.key} label={l.label} amount={l.amount} share={l.share} negative={negative} />)}
        </div>
      )}
    </section>
  );
}

/** The balance at the end of each month of the season, as columns around zero. */
function BalanceChart({ months }: { months: { month: string; balance: number }[] }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...months.map((m) => Math.abs(m.balance)));
  const hasNegative = months.some((m) => m.balance < 0);
  const area = 140;
  const label = (month: string) =>
    new Date(`${month}-15T12:00:00Z`).toLocaleDateString(i18n.language, { month: "short", timeZone: "UTC" }).replace(".", "");
  return (
    <section className={`${TABLE_STYLE.shell} min-w-0`}>
      <SectionTitle className="px-4 py-3 border-b border-border">{t("financesScreen.overview.balanceByMonth")}</SectionTitle>
      {months.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0 p-4">{t("financesScreen.noEntries")}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-stretch gap-2 px-4 pt-4 pb-3 min-w-max sm:min-w-0">
            {months.map((m, i) => {
              const h = Math.max(2, Math.round((Math.abs(m.balance) / max) * area));
              const last = i === months.length - 1;
              const color = m.balance < 0 ? "bg-destructive" : last ? "bg-primary" : "bg-primary/45";
              return (
                <div key={m.month} className="flex-1 min-w-14 flex flex-col items-center gap-1.5" title={`${label(m.month)}: ${money(m.balance)}`}>
                  <span className={`text-sm tabular-nums whitespace-nowrap ${m.balance < 0 ? "text-destructive" : last ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{money(m.balance)}</span>
                  <div className="w-full flex flex-col" style={{ height: hasNegative ? area * 2 : area }}>
                    <div className="flex-1 flex items-end justify-center border-b border-border">
                      {m.balance >= 0 && <div className={`w-full max-w-10 rounded-t ${color}`} style={{ height: h }} />}
                    </div>
                    {hasNegative && (
                      <div className="flex-1 flex items-start justify-center">
                        {m.balance < 0 && <div className={`w-full max-w-10 rounded-b ${color}`} style={{ height: h }} />}
                      </div>
                    )}
                  </div>
                  <span className={LABEL}>{label(m.month)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Summary tab: the figures that matter, the balance month by month and the biggest lines. */
export function FinanceSummary({ balance, breakdown, weekly, months, top }: {
  balance: number;
  breakdown: SimpleBreakdown;
  /** What a normal week leaves today (the weekly lines). */
  weekly: number;
  months: { month: string; balance: number }[];
  top: TopLines;
}) {
  const { t } = useTranslation();
  const account = (a: string) => t(`financesScreen.statement.accounts.${a}`);
  const topCard = (title: string, rows: { account: string; amount: number }[], total: number, negative?: boolean) => (
    <SideCard
      title={title}
      total={rows.reduce((s, r) => s + r.amount, 0)}
      negative={negative}
      lines={rows.map((r) => ({ key: r.account, label: account(r.account), amount: r.amount, share: total > 0 ? r.amount / total : 0 }))}
    />
  );
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label={t("financesScreen.overview.balance")} value={balance} signed />
        <Kpi label={t("financesScreen.overview.revenue")} value={breakdown.totalRevenue} />
        <Kpi label={t("financesScreen.overview.expenses")} value={breakdown.totalExpenses} />
        <Kpi label={t("financesScreen.overview.result")} value={breakdown.result} signed />
        <Kpi label={t("financesScreen.overview.weekly")} value={weekly} signed />
      </div>
      <BalanceChart months={months} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topCard(t("financesScreen.overview.topRevenue"), top.revenue, breakdown.totalRevenue)}
        {topCard(t("financesScreen.overview.topExpenses"), top.expenses, breakdown.totalExpenses, true)}
      </div>
    </>
  );
}

/** Simple tab: what came in and what went out, by plain category, for the season or the month. */
export function FinanceSimple({ breakdown }: { breakdown: SimpleBreakdown }) {
  const { t } = useTranslation();
  const lines = <C extends string>(side: "revenue" | "expense", list: CategoryLine<C>[]) =>
    list.map((l) => ({ key: l.category, label: t(`financesScreen.overview.categories.${side}.${l.category}`), amount: l.amount, share: l.share }));
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <SideCard title={t("financesScreen.overview.in")} total={breakdown.totalRevenue} lines={lines("revenue", breakdown.revenue)} />
        <SideCard title={t("financesScreen.overview.out")} total={breakdown.totalExpenses} lines={lines("expense", breakdown.expenses)} negative />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-md border border-border bg-secondary/30">
        <span className="font-display font-bold uppercase text-xl leading-none">{t("financesScreen.overview.result")}</span>
        <span className={`font-display font-bold text-2xl leading-none tabular-nums ${tone(breakdown.result)}`}>
          {breakdown.result > 0 ? "+" : ""}{money(breakdown.result)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("financesScreen.overview.simpleNote")}</p>
    </>
  );
}

/** The sponsorship money on top of the sponsors' panel: what the deals pay a week and a year, what came in. */
export function SponsorIncomeStrip({ weeklyNow, season }: { weeklyNow: number; season: { weekly: number; bonus: number; total: number } }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t("financesScreen.overview.sponsorYear")} value={weeklyNow * 52} />
        <Kpi label={t("financesScreen.overview.sponsorWeek")} value={weeklyNow} />
        <Kpi label={t("financesScreen.overview.sponsorSeason")} value={season.total} />
        <Kpi label={t("financesScreen.overview.sponsorBonus")} value={season.bonus} />
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("financesScreen.overview.sponsorNote")}</p>
    </>
  );
}
