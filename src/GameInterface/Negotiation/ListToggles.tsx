import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { AskingPriceModal } from "@/GameInterface/Negotiation/AskingPriceModal";
import { formatFee } from "@/Domain/money";
import type { SellCandidate } from "@/types/transferMarketTypes";

/**
 * "List for sale" / "Offer on loan" switches of one of the human's players
 * (`.claude/rules/game/negotiation.md`): AI clubs then send bids to the inbox. Listing for sale asks
 * for an asking price (#88), editable while he is listed.
 */
export function ListToggles({ saveId, playerId, playerName, value }: { saveId: string; playerId: string; playerName: string; value: number }) {
  const { t } = useTranslation();
  const [sale, setSale] = useState<SellCandidate | null | undefined>(undefined);
  const [forLoan, setForLoan] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [pricing, setPricing] = useState(false);

  const pick = (list: SellCandidate[]) => list.find((c) => c.playerId === playerId) ?? null;

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`/api/saves/${saveId}/sell-list`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/saves/${saveId}/loan-list`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([sell, loan]: [SellCandidate[], string[]]) => {
      if (!alive) return;
      setSale(pick(sell));
      setForLoan(loan.includes(playerId));
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [saveId, playerId]);

  async function toggle(list: "sell-list" | "loan-list") {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/saves/${saveId}/${list}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) { setError(true); return; }
      const body = (await res.json()) as { playerSellList?: SellCandidate[]; playerLoanList?: string[] };
      if (body.playerSellList) setSale(pick(body.playerSellList));
      if (body.playerLoanList) setForLoan(body.playerLoanList.includes(playerId));
    } finally {
      setBusy(false);
    }
  }

  if (sale === undefined || forLoan === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sale ? (
        <>
          <Button variant="secondary" disabled={busy} onClick={() => setPricing(true)} className="tabular-nums">
            {sale.askingPrice !== undefined
              ? t("negotiation.asking.priceButton", { price: formatFee(sale.askingPrice) })
              : t("negotiation.asking.atValueButton", { price: formatFee(value) })}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void toggle("sell-list")}>
            {t("negotiation.lists.unlistSale")}
          </Button>
        </>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => setPricing(true)}>
          {t("negotiation.lists.listSale")}
        </Button>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => void toggle("loan-list")}>
        {forLoan ? t("negotiation.lists.unlistLoan") : t("negotiation.lists.listLoan")}
      </Button>
      {error && <span className="text-sm text-destructive">{t("negotiation.errors.generic")}</span>}
      {pricing && (
        <AskingPriceModal
          saveId={saveId}
          playerId={playerId}
          playerName={playerName}
          value={value}
          {...(sale?.askingPrice !== undefined ? { current: sale.askingPrice } : {})}
          listed={!!sale}
          onClose={() => setPricing(false)}
          onSaved={(list) => setSale(pick(list))}
        />
      )}
    </div>
  );
}
