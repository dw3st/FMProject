import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BANK_LOAN, bankLoanAmounts, bankLoanLimit, bankLoanQuote } from "@/Domain/finance/bankLoan";
import { formatEuros } from "@/Domain/money";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import type { Squad } from "@/types/playerTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

function Figure({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={`${LABEL} m-0`}>{label}</p>
      <p className={`font-display font-bold tabular-nums text-lg m-0 ${tone}`}>{value}</p>
    </div>
  );
}

/** Finances: the club's bank loan (`.claude/rules/game/finances.md` → "Empréstimo do banco"). */
export function BankLoanCard({ saveId, squad, board, onTaken }: { saveId: string; squad: Squad; board?: number; onTaken: () => void }) {
  const { t } = useTranslation();
  const amounts = bankLoanAmounts(bankLoanLimit(squad));
  const [amount, setAmount] = useState<number | null>(null);
  const [seasons, setSeasons] = useState<number>(BANK_LOAN.TERMS[0]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loan = squad.bankLoan;
  if (loan) {
    const weeks = Math.ceil(loan.remaining / loan.weekly);
    return (
      <div className="card-arcade rounded-md p-4">
        <SectionTitle className="mb-4">{t("financesScreen.bankLoan.title")}</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Figure label={t("financesScreen.bankLoan.borrowed")} value={formatEuros(loan.principal)} />
          <Figure label={t("financesScreen.bankLoan.remaining")} value={formatEuros(loan.remaining)} tone="text-destructive" />
          <Figure label={t("financesScreen.bankLoan.weekly")} value={formatEuros(loan.weekly)} />
          <Figure label={t("financesScreen.bankLoan.weeksLeft")} value={String(weeks)} />
        </div>
      </div>
    );
  }

  const blocked = board !== undefined && board < BANK_LOAN.MIN_BOARD;
  const chosen = amount !== null && amounts.includes(amount) ? amount : amounts[0] ?? null;
  const quote = chosen === null ? null : bankLoanQuote(chosen, seasons);

  async function take() {
    if (chosen === null) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/bank-loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: chosen, seasons }),
      });
      if (res.ok) {
        setConfirming(false);
        onTaken();
        return;
      }
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(t(`financesScreen.bankLoan.errors.${code}`, { defaultValue: t("financesScreen.bankLoan.errors.generic") }));
    } catch {
      setError(t("financesScreen.bankLoan.errors.generic"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card-arcade rounded-md p-4">
      <SectionTitle className="mb-1">{t("financesScreen.bankLoan.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0 mb-4">{t("financesScreen.bankLoan.intro", { share: Math.round(BANK_LOAN.REVENUE_SHARE * 100), rate: Math.round(BANK_LOAN.ANNUAL_RATE * 100) })}</p>

      {blocked ? (
        <p className="text-sm text-muted-foreground m-0">{t("financesScreen.bankLoan.boardLow", { min: BANK_LOAN.MIN_BOARD })}</p>
      ) : chosen === null || !quote ? (
        <p className="text-sm text-muted-foreground m-0">{t("financesScreen.bankLoan.noCredit")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className={`${LABEL} m-0 mb-2`}>{t("financesScreen.bankLoan.amount")}</p>
              <OptionChips
                aria-label={t("financesScreen.bankLoan.amount")}
                options={amounts.map((a) => ({ key: String(a), label: formatEuros(a) }))}
                value={String(chosen)}
                onChange={(k) => { setAmount(Number(k)); setConfirming(false); }}
              />
            </div>
            <div>
              <p className={`${LABEL} m-0 mb-2`}>{t("financesScreen.bankLoan.term")}</p>
              <OptionChips
                aria-label={t("financesScreen.bankLoan.term")}
                options={BANK_LOAN.TERMS.map((s) => ({ key: String(s), label: t("financesScreen.bankLoan.seasons", { count: s }) }))}
                value={String(seasons)}
                onChange={(k) => { setSeasons(Number(k)); setConfirming(false); }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Figure label={t("financesScreen.bankLoan.receive")} value={formatEuros(chosen)} tone="text-chart-2" />
            <Figure label={t("financesScreen.bankLoan.interest")} value={formatEuros(quote.interest)} />
            <Figure label={t("financesScreen.bankLoan.total")} value={formatEuros(quote.total)} />
            <Figure label={t("financesScreen.bankLoan.weekly")} value={formatEuros(quote.weekly)} tone="text-destructive" />
          </div>

          {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}

          {confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-foreground tabular-nums m-0">
                {t("financesScreen.bankLoan.confirmText", { amount: formatEuros(chosen), weekly: formatEuros(quote.weekly), weeks: quote.weeks })}
              </p>
              <Button onClick={() => void take()} disabled={sending}>{t("financesScreen.bankLoan.confirm")}</Button>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={sending}>{t("financesScreen.bankLoan.cancel")}</Button>
            </div>
          ) : (
            <div><Button onClick={() => setConfirming(true)}>{t("financesScreen.bankLoan.take")}</Button></div>
          )}
        </div>
      )}
    </div>
  );
}
