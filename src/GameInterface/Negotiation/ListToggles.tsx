import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";

/**
 * "List for sale" / "Offer on loan" switches of one of the human's players
 * (`.claude/rules/game/negotiation.md`): AI clubs then send bids to the inbox.
 */
export function ListToggles({ saveId, playerId }: { saveId: string; playerId: string }) {
  const { t } = useTranslation();
  const [forSale, setForSale] = useState<boolean | null>(null);
  const [forLoan, setForLoan] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`/api/saves/${saveId}/sell-list`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/saves/${saveId}/loan-list`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([sell, loan]: [{ playerId: string }[], string[]]) => {
      if (!alive) return;
      setForSale(sell.some((c) => c.playerId === playerId));
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
      const body = (await res.json()) as { playerSellList?: { playerId: string }[]; playerLoanList?: string[] };
      if (body.playerSellList) setForSale(body.playerSellList.some((c) => c.playerId === playerId));
      if (body.playerLoanList) setForLoan(body.playerLoanList.includes(playerId));
    } finally {
      setBusy(false);
    }
  }

  if (forSale === null || forLoan === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => void toggle("sell-list")}>
        {forSale ? t("negotiation.lists.unlistSale") : t("negotiation.lists.listSale")}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => void toggle("loan-list")}>
        {forLoan ? t("negotiation.lists.unlistLoan") : t("negotiation.lists.listLoan")}
      </Button>
      {error && <span className="text-sm text-destructive">{t("negotiation.errors.generic")}</span>}
    </div>
  );
}
