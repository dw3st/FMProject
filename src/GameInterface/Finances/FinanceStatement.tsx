import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { formatAccounting } from "@/Domain/money";
import type { JournalRow, Statement } from "@/Domain/finance/statement";
import type { LedgerEntry } from "@/Domain/finance/ledger";

export type StatementMode = "season" | "month";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const TABLE = "w-full border-collapse font-display text-base tabular-nums";
const HEAD_CELL = `${TABLE_STYLE.head} sticky top-0 bg-card px-3 py-2 text-right whitespace-nowrap first:pl-4 first:text-left last:pr-4`;
const CELL = "px-3 py-1 text-right whitespace-nowrap font-bold first:pl-4 first:text-left last:pr-4";

/** Season or month, and the arrows that walk through them. */
export function PeriodControl({ mode, onMode, label, canPrev, canNext, onStep }: {
  mode: StatementMode;
  onMode: (mode: StatementMode) => void;
  label: string;
  canPrev: boolean;
  canNext: boolean;
  onStep: (dir: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const arrow = "w-10 h-10 inline-flex items-center justify-center bg-transparent border-0 text-foreground cursor-pointer disabled:text-border disabled:cursor-default";
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <SegmentedTabs<StatementMode>
        compact
        aria-label={t("financesScreen.statement.periodKind")}
        tabs={[{ key: "season", label: t("financesScreen.statement.season") }, { key: "month", label: t("financesScreen.statement.month") }]}
        active={mode}
        onChange={onMode}
      />
      <div className="flex items-center rounded-lg border border-border bg-card">
        <button type="button" className={arrow} disabled={!canPrev} onClick={() => onStep(-1)} aria-label={t("financesScreen.statement.prev")} title={t("financesScreen.statement.prev")}>
          <Icon name="chevron-left" size={18} />
        </button>
        <span className="min-w-28 text-center font-display font-bold uppercase text-lg leading-none tabular-nums">{label}</span>
        <button type="button" className={arrow} disabled={!canNext} onClick={() => onStep(1)} aria-label={t("financesScreen.statement.next")} title={t("financesScreen.statement.next")}>
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
    </div>
  );
}

/** The four figures on top: the balance the period began with, what came in, what went out, the balance it ended with. */
export function BalanceStrip({ statement }: { statement: Statement }) {
  const { t, i18n } = useTranslation();
  const items: [string, number][] = [
    [t("financesScreen.statement.opening"), statement.opening],
    [t("financesScreen.statement.inflow"), statement.inflow],
    [t("financesScreen.statement.outflow"), statement.outflow],
    [t("financesScreen.statement.closing"), statement.closing],
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-3 rounded-md border border-border bg-secondary/30">
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 min-w-0">
          <span className={LABEL}>{label}</span>
          <span className={`font-display font-bold text-2xl leading-none tabular-nums whitespace-nowrap ${value < 0 ? "text-destructive" : "text-foreground"}`}>
            € {formatAccounting(value, i18n.language)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Amount({ value, className = "" }: { value: number; className?: string }) {
  const { i18n } = useTranslation();
  return <td className={`${CELL} ${value < 0 ? "text-destructive" : ""} ${className}`}>{formatAccounting(value, i18n.language)}</td>;
}

function TotalRow({ label, value, share }: { label: string; value: number; share?: string }) {
  return (
    <tr className="bg-secondary/40 border-y border-border">
      <td className={`${CELL} py-2 text-xl leading-tight`}>{label}</td>
      <Amount value={value} className="py-2 text-xl leading-tight" />
      <td className={`${CELL} py-2 text-xl leading-tight`}>{share}</td>
    </tr>
  );
}

/** The result of the period, account by account, with each one's weight on the revenue. */
export function StatementCard({ statement, month }: { statement: Statement; month: boolean }) {
  const { t, i18n } = useTranslation();
  const share = (value: number) => statement.revenue === 0
    ? "–"
    : new Intl.NumberFormat(i18n.language, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value) / statement.revenue);
  const rest = `${CELL} text-muted-foreground font-semibold`;
  return (
    <section className={`${TABLE_STYLE.shell} min-w-0`}>
      <SectionTitle className="px-4 py-3 border-b border-border">{t("financesScreen.statement.title")}</SectionTitle>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={HEAD_CELL}>{t("financesScreen.statement.account")}</th>
              <th className={HEAD_CELL}>{t(month ? "financesScreen.statement.month" : "financesScreen.statement.season")}</th>
              <th className={HEAD_CELL}>{t("financesScreen.statement.pctRevenue")}</th>
            </tr>
          </thead>
          <tbody>
            {statement.groups.map((group) => (
              <Fragment key={group.id}>
                {group.id === "market" && <TotalRow label={t("financesScreen.statement.operating")} value={statement.operating} share={share(statement.operating)} />}
                {group.accounts.length > 0 && (
                  <>
                    <tr><td colSpan={3} className={`${LABEL} pl-4 pt-3 pb-1`}>{t(`financesScreen.statement.groups.${group.id}`)}</td></tr>
                    {group.accounts.map(({ account, amount }) => (
                      <tr key={account} className={TABLE_STYLE.row}>
                        <td className={`${CELL} pl-7! text-left font-semibold text-foreground/90`}>{t(`financesScreen.statement.accounts.${account}`)}</td>
                        <Amount value={amount} />
                        <td className={rest}>{share(amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border">
                      <td className={CELL}>{t(`financesScreen.statement.totals.${group.id}`)}</td>
                      <Amount value={group.total} />
                      <td className={rest}>{share(group.total)}</td>
                    </tr>
                  </>
                )}
              </Fragment>
            ))}
            <TotalRow label={t("financesScreen.statement.result")} value={statement.net} share={share(statement.net)} />
            <TotalRow label={t("financesScreen.statement.closing")} value={statement.closing} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Every entry of the period with debit, credit and the running balance. The height follows the statement beside it. */
export function JournalCard({ rows, describe, dateOf, filter }: {
  rows: JournalRow[];
  describe: (entry: LedgerEntry) => string;
  dateOf: (date: string) => string;
  filter: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const money = (n: number) => n.toLocaleString(i18n.language);
  return (
    <section className={`${TABLE_STYLE.shell} min-w-0 flex flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 min-h-12 border-b border-border">
        <SectionTitle>{t("financesScreen.ledgerTitle")}</SectionTitle>
        {filter}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0 p-4">{t("financesScreen.noEntries")}</p>
      ) : (
        <div className="relative flex-1 min-h-80">
          <div className="max-h-[480px] overflow-auto lg:absolute lg:inset-0 lg:max-h-none">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={HEAD_CELL}>{t("financesScreen.statement.date")}</th>
                  <th className={`${HEAD_CELL} text-left!`}>{t("financesScreen.statement.description")}</th>
                  <th className={HEAD_CELL}>{t("financesScreen.statement.debit")}</th>
                  <th className={HEAD_CELL}>{t("financesScreen.statement.credit")}</th>
                  <th className={HEAD_CELL}>{t("financesScreen.statement.balance")}</th>
                </tr>
              </thead>
              <tbody className={TABLE_STYLE.body}>
                {rows.map(({ entry, balance }, i) => (
                  <tr key={`${entry.date}-${entry.kind}-${i}`} className={TABLE_STYLE.row}>
                    <td className={`${CELL} text-left text-muted-foreground font-semibold`}>{dateOf(entry.date)}</td>
                    <td className={`${CELL} text-left! font-semibold whitespace-normal`}>{describe(entry)}</td>
                    <td className={`${CELL} text-destructive`}>{entry.amount < 0 ? money(-entry.amount) : ""}</td>
                    <td className={CELL}>{entry.amount > 0 ? money(entry.amount) : ""}</td>
                    <Amount value={balance} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/** What a normal week costs: the weekly lines at today's values, and what a home game brings in. */
export function WeekCard({ lines, avgGate }: { lines: { label: string; value: number }[]; avgGate: number | null }) {
  const { t } = useTranslation();
  const result = lines.reduce((s, l) => s + l.value, 0);
  return (
    <section className={`${TABLE_STYLE.shell} min-w-0`}>
      <SectionTitle className="px-4 py-3 border-b border-border">{t("financesScreen.statement.weekTitle")}</SectionTitle>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={HEAD_CELL}>{t("financesScreen.statement.account")}</th>
              <th className={HEAD_CELL}>{t("financesScreen.statement.perWeek")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label} className={TABLE_STYLE.row}>
                <td className={`${CELL} pl-7! text-left font-semibold text-foreground/90`}>{l.label}</td>
                <Amount value={l.value} />
              </tr>
            ))}
            <tr className="bg-secondary/40 border-y border-border">
              <td className={`${CELL} py-2 text-xl leading-tight`}>{t("financesScreen.statement.weekResult")}</td>
              <Amount value={result} className="py-2 text-xl leading-tight" />
            </tr>
            {avgGate !== null && (
              <tr>
                <td className={`${CELL} pl-7! text-left font-semibold text-foreground/90`}>{t("financesScreen.statement.avgGate")}</td>
                <Amount value={avgGate} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
