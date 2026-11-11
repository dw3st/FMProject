import { useTranslation } from "react-i18next";
import { formatEuros } from "@/Domain/money";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * A player on loan at the manager's club (9.8, tester report): his contract with his own club, what the loan costs and
 * what can still be tried (buy him from his club, or a pre-contract near the end of the contract).
 */
export function LoanedInCard({ player, canPreContract }: { player: RosterPlayer; canPreContract: boolean }) {
  const { t, i18n } = useTranslation();
  const loan = player.loan;
  if (!loan) return null;
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
    </section>
  );
}
