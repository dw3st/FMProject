import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import type { PlayerSituation } from "@/Domain/negotiation/situation";

/** "Titular · Não está à venda · Não disponível para empréstimo": how much he matters and whether he can leave. */
export function PlayerSituationLine({ saveId, playerId, squadId, listing }: {
  saveId: string;
  playerId: string;
  squadId?: string;
  /** On a bid for the manager's own player: stands out whether he had listed him, for sale or for loan (8.8.25). */
  listing?: "transfer" | "loan";
}) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<PlayerSituation | null>(null);
  useEffect(() => {
    let live = true;
    setS(null);
    fetch(`/api/saves/${saveId}/players/${encodeURIComponent(playerId)}/situation${squadId ? `?from=${encodeURIComponent(squadId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PlayerSituation | null) => { if (live) setS(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [saveId, playerId, squadId]);
  if (!s) return null;
  const parts = [
    t(`negotiation.situation.role.${s.role}`),
    ...(listing === "transfer" ? [] : [t(s.forSale ? "negotiation.situation.forSale" : "negotiation.situation.notForSale")]),
    ...(listing === "loan" ? [] : [s.onLoan ? t("negotiation.situation.onLoan") : t(s.loanable ? "negotiation.situation.loanable" : "negotiation.situation.notLoanable")]),
    ...(s.requested ? [t("negotiation.situation.requested")] : []),
  ];
  const line = <p className="text-sm text-muted-foreground m-0">{t("negotiation.situation.label")}: {parts.join(" · ")}</p>;
  if (!listing) return line;
  const listed = listing === "transfer" ? s.forSale : s.loanable;
  const thin = s.thinAfter
    ? <p className="text-sm text-chart-4 m-0 w-full">{t(`negotiation.situation.thinAfter.${s.thinAfter.line}`, { count: s.thinAfter.left, min: s.thinAfter.min })}</p>
    : null;
  // What the club paid for him and what he is worth today, to judge the bid (tester report, 10.7).
  const paidOn = s.paid ? new Date(`${s.paid.on}T12:00:00`).toLocaleDateString(i18n.language, { month: "short", year: "numeric" }) : "";
  const paidKey = !s.paid ? null
    : s.paid.kind === "academy" || s.paid.kind === "free" || s.paid.kind === "pre_contract" ? s.paid.kind
    : s.paid.fee > 0 ? s.paid.kind : "noFee";
  const money = [
    ...(s.paid && paidKey ? [t(`negotiation.situation.paid.${paidKey}`, { fee: formatFee(s.paid.fee), date: paidOn })] : []),
    ...(s.value !== undefined ? [t("negotiation.situation.value", { value: formatFee(s.value) })] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`rounded border px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${listed ? "border-primary/50 bg-primary/10 text-primary" : "border-chart-4/50 bg-chart-4/10 text-chart-4"}`}>
        {t(`negotiation.situation.${listing === "transfer" ? "sale" : "loan"}${listed ? "Listed" : "NotListed"}`)}
      </span>
      {line}
      {money.length > 0 && <p className="text-sm text-foreground m-0 w-full tabular-nums">{money.join(" · ")}</p>}
      {thin}
    </div>
  );
}
