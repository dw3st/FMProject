import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { formatEuros } from "@/Domain/money";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * A player on loan at the manager's club (9.8, tester report): his contract with his own club, what the loan costs and
 * what can still be tried (buy him from his club, or a pre-contract near the end of the contract).
 */
export function LoanedInCard({ player, canPreContract, saveId, onReturned }: {
  player: RosterPlayer;
  canPreContract: boolean;
  /** With both, the "send back" button (12.39): the loan ends today and he goes back to his club. */
  saveId?: string;
  onReturned?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loan = player.loan;
  if (!loan) return null;

  const sendBack = async () => {
    if (!saveId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/saves/${encodeURIComponent(saveId)}/loans/${encodeURIComponent(player.id)}/return`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setAsking(false);
      if (!res.ok) {
        const known = ["windowClosed", "seatLoan", "notLoanedIn", "lobby"];
        setError(t(`loanedIn.returnErrors.${known.includes(body.error ?? "") ? body.error : "generic"}`));
        return;
      }
      onReturned?.();
    } finally {
      setBusy(false);
    }
  };
  const day = (d: string) => formatGameDate(d, i18n.language);
  const wage = player.contract?.wage ?? 0;
  return (
    <section className="rounded-md border border-border p-4 flex flex-col gap-2">
      <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("loanedIn.title")}</p>
      <p className="text-sm m-0">{t("loanedIn.loan", { club: loan.fromClubName, date: day(loan.until) })}</p>
      {player.contract && (
        <p className="text-sm m-0 tabular-nums">
          {t("loanedIn.contract", { club: loan.fromClubName, date: day(player.contract.until), wage: formatEuros(wage) })}
          {" · "}
          {t("loanedIn.share", { pct: Math.round(loan.wageShare * 100), wage: formatEuros(Math.round(wage * loan.wageShare)) })}
        </p>
      )}
      <p className="text-sm text-muted-foreground m-0">
        {canPreContract ? t("loanedIn.optionsPre", { club: loan.fromClubName }) : t("loanedIn.options", { club: loan.fromClubName })}
      </p>
      {saveId && onReturned && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { setError(null); setAsking(true); }}
            disabled={busy}
            className="flex items-center px-4 h-10 rounded border border-border bg-transparent text-sm font-semibold text-foreground cursor-pointer hover:border-primary disabled:opacity-50"
          >
            {t("loanedIn.returnButton", { club: loan.fromClubName })}
          </button>
          {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
        </div>
      )}
      <ConfirmDialog
        open={asking}
        title={t("loanedIn.returnTitle", { name: player.name })}
        body={t("loanedIn.returnBody", { name: player.name, club: loan.fromClubName })}
        confirmLabel={t("loanedIn.returnConfirm")}
        onConfirm={() => void sendBack()}
        onClose={() => setAsking(false)}
        busy={busy}
      />
    </section>
  );
}
