import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { formatFee } from "@/Domain/money";
import type { LoanRenewalOffer } from "@/types/transferMarketTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/**
 * An offer to renew a loan for one more season (12.29, `.claude/rules/game/negotiation.md`), answered from the inbox.
 * `offer` is the live offer from `GET /negotiation` (null once closed).
 */
export function LoanRenewalCard({ saveId, offer, onAnswered }: {
  saveId: string; offer: LoanRenewalOffer | null; onAnswered?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [current, setCurrent] = useState<LoanRenewalOffer | null>(offer);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setCurrent(offer); }, [offer]);

  if (!current) return <p className="text-sm text-muted-foreground m-0">{status ?? t("negotiation.loanRenewal.closed")}</p>;
  const o = current;
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });

  async function answer(action: "accept" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/loan-renewals/${encodeURIComponent(o.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        setError(body.error === "noMoney" ? t("negotiation.loanRenewal.noMoney")
          : body.error === "offerClosed" ? t("negotiation.loanRenewal.closed") : t("negotiation.errors.generic"));
        if (body.error === "offerClosed") setCurrent(null);
        return;
      }
      setStatus(t(body.status === "renewed" ? "negotiation.loanRenewal.renewed" : "negotiation.loanRenewal.rejected"));
      setCurrent(null);
      onAnswered?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 tabular-nums">
        <div>
          <div className={LABEL}>{t("negotiation.loanRenewal.until")}</div>
          <div className="text-sm font-semibold">{fmtDate(o.until)}</div>
        </div>
        <div>
          <div className={LABEL}>{t(o.direction === "in" ? "negotiation.overview.youPay" : "negotiation.overview.theyPay")}</div>
          <div className="text-sm font-semibold">{Math.round(o.wageShare * 100)}%
            {o.wage ? ` · ${t("negotiation.loanRenewal.perWeek", { amount: formatFee(Math.round(o.wage * o.wageShare)) })}` : ""}
          </div>
        </div>
        {o.fee > 0 && (
          <div>
            <div className={LABEL}>{t("negotiation.loanRenewal.fee")}</div>
            <div className="text-sm font-semibold">{formatFee(o.fee)}</div>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("negotiation.loanRenewal.deadline", { date: fmtDate(o.expires) })}</p>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => void answer("accept")}>{t("negotiation.loanRenewal.accept")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void answer("reject")}>{t("negotiation.loanRenewal.reject")}</Button>
      </div>
      {error && <p className="text-sm text-destructive m-0">{error}</p>}
    </div>
  );
}
