import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerSituation } from "@/Domain/negotiation/situation";

/** "Titular · Não está à venda · Não disponível para empréstimo": how much he matters and whether he can leave. */
export function PlayerSituationLine({ saveId, playerId, squadId }: { saveId: string; playerId: string; squadId?: string }) {
  const { t } = useTranslation();
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
    t(s.forSale ? "negotiation.situation.forSale" : "negotiation.situation.notForSale"),
    s.onLoan ? t("negotiation.situation.onLoan") : t(s.loanable ? "negotiation.situation.loanable" : "negotiation.situation.notLoanable"),
    ...(s.requested ? [t("negotiation.situation.requested")] : []),
  ];
  return <p className="text-sm text-muted-foreground m-0">{t("negotiation.situation.label")}: {parts.join(" · ")}</p>;
}
