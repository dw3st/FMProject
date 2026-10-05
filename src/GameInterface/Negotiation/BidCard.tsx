import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { formatFee } from "@/Domain/money";
import type { MarketBid } from "@/types/transferMarketTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const SELL_ON_KEYS = ["0", "10", "20", "30"] as const;

/**
 * An AI club's bid for one of the human's players (`.claude/rules/game/negotiation.md`), answered
 * from the inbox: accept, reject or (transfer bids) counter once with a fee and a sell-on clause.
 * `bid` is the live bid from `GET /negotiation` (null once it is closed).
 */
export function BidCard({
  saveId,
  bid,
  onAnswered,
}: {
  saveId: string;
  bid: MarketBid | null;
  onAnswered?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [current, setCurrent] = useState<MarketBid | null>(bid);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const [fee, setFee] = useState(bid?.fee ?? 0);
  const [sellOn, setSellOn] = useState<(typeof SELL_ON_KEYS)[number]>("0");
  useEffect(() => { setCurrent(bid); setFee(bid?.fee ?? 0); }, [bid]);

  if (!current) {
    return <p className="text-sm text-muted-foreground m-0">{status ?? t("negotiation.bid.closed")}</p>;
  }
  const b = current;
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });

  async function answer(action: "accept" | "reject" | "counter") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/bids/${encodeURIComponent(b.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "counter" ? { action, fee, sellOnPct: Number(sellOn) } : { action }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: string; bid?: MarketBid };
      if (!res.ok) {
        setError(body.error === "noRounds" ? t("negotiation.bid.walkedAway") : body.error === "offerClosed" ? t("negotiation.bid.closed") : t("negotiation.errors.generic"));
        if (body.error === "offerClosed" || body.error === "noRounds") setCurrent(null);
        return;
      }
      if (body.status === "countered" && body.bid) {
        setCurrent(body.bid);
        setFee(body.bid.fee);
        setCountering(false);
        setStatus(null);
        return;
      }
      setStatus(t(`negotiation.bid.done.${body.status ?? "rejected"}`));
      setCurrent(null);
      onAnswered?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 m-0">
        {b.kind === "transfer" ? (
          <>
            <div>
              <dt className={LABEL}>{t("transfers.fee")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{formatFee(b.fee)}</dd>
            </div>
            <div>
              <dt className={LABEL}>{t("negotiation.sellOn")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{b.sellOnPct ? `${b.sellOnPct}%` : "—"}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt className={LABEL}>{t("negotiation.wageShare")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{Math.round((b.wageShare ?? 1) * 100)}%</dd>
            </div>
            <div>
              <dt className={LABEL}>{t("negotiation.returns")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{b.until ? fmtDate(b.until) : "—"}</dd>
            </div>
          </>
        )}
        <div>
          <dt className={LABEL}>{t("negotiation.bid.validUntil")}</dt>
          <dd className="m-0 text-sm text-foreground tabular-nums">{fmtDate(b.expires)}</dd>
        </div>
      </dl>
      {b.countered && <p className="text-sm text-muted-foreground m-0">{t("negotiation.bid.finalOffer")}</p>}

      {countering && b.kind === "transfer" && (
        <div className="space-y-3">
          <div>
            <p className={`${LABEL} m-0 mb-2`}>{t("negotiation.bid.yourPrice")}</p>
            <div className="flex items-center gap-3">
              <input
                type="range" min={b.fee} max={Math.max(b.fee * 2, b.fee + 1_000_000)} step={100_000} value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
                className="flex-1 accent-primary"
                aria-label={t("negotiation.bid.yourPrice")}
              />
              <span className="text-xl font-black font-display text-primary w-24 text-right tabular-nums">{formatFee(fee)}</span>
            </div>
          </div>
          <div>
            <p className={`${LABEL} m-0 mb-2`}>{t("negotiation.bid.askSellOn")}</p>
            <OptionChips
              aria-label={t("negotiation.bid.askSellOn")}
              options={SELL_ON_KEYS.map((k) => ({ key: k, label: `${k}%` }))}
              value={sellOn}
              onChange={setSellOn}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {countering ? (
          <>
            <Button disabled={busy} onClick={() => void answer("counter")}>{t("negotiation.bid.sendCounter")}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setCountering(false)}>{t("common.cancel")}</Button>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={() => void answer("accept")}>{t("negotiation.bid.accept")}</Button>
            {b.kind === "transfer" && !b.countered && (
              <Button variant="secondary" disabled={busy} onClick={() => setCountering(true)}>{t("negotiation.bid.counter")}</Button>
            )}
            <Button variant="danger" disabled={busy} onClick={() => void answer("reject")}>{t("negotiation.bid.reject")}</Button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive m-0">{error}</p>}
    </div>
  );
}
