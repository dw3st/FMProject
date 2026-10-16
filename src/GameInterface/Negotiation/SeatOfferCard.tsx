import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { formatFee } from "@/Domain/money";
import { notifySeatOffersChanged, seatOfferApi } from "@/GameInterface/Negotiation/seatOfferApi";
import { seatOfferErrorText } from "@/GameInterface/Negotiation/seatOfferErrors";
import type { SeatOfferView } from "@/types/seatOfferTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const SELL_ON_KEYS = ["0", "10", "20", "30"] as const;
const SHARE_KEYS = ["0", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100"] as const;
/** Counter-offers allowed in one negotiation (`SEAT_OFFERS.MAX_COUNTERS`). */
const MAX_COUNTERS = 3;

/**
 * An offer between two human managers (multiplayer part 4): the terms, whose turn it is and the last move.
 * On the seat's turn: accept, counter (fee and sell-on clause, or wage share and fee on a loan) or reject;
 * the buyer can always withdraw. Same look as the AI bid card (`BidCard`); `offer` null = closed.
 */
export function SeatOfferCard({ saveId, offer, onChanged }: { saveId: string; offer: SeatOfferView | null; onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  const [current, setCurrent] = useState<SeatOfferView | null>(offer);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const [fee, setFee] = useState(offer?.terms.fee ?? 0);
  const [sellOn, setSellOn] = useState<(typeof SELL_ON_KEYS)[number]>("0");
  const [share, setShare] = useState<(typeof SHARE_KEYS)[number]>("100");
  useEffect(() => { setCurrent(offer); }, [offer]);
  useEffect(() => {
    if (!current) return;
    setFee(current.terms.fee);
    setSellOn(String(current.terms.sellOnPct ?? 0) as (typeof SELL_ON_KEYS)[number]);
    setShare(String(Math.round((current.terms.wageShare ?? 1) * 10) * 10) as (typeof SHARE_KEYS)[number]);
  }, [current]);

  if (!current) return <p className="text-sm text-muted-foreground m-0">{status ?? t("seatOffers.closed")}</p>;
  const o = current;
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });
  const otherClub = o.side === "buyer" ? o.seller.clubName : o.buyer.clubName;
  const last = o.history[o.history.length - 1];
  const canCounter = o.counters < MAX_COUNTERS;
  const feeMax = Math.max(o.terms.fee * 2, o.terms.fee + 1_000_000, 1_000_000);

  async function answer(action: "accept" | "reject" | "counter" | "withdraw") {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "counter") {
        body.fee = fee;
        if (o.kind === "transfer") body.sellOnPct = Number(sellOn);
        else body.wageShare = Number(share);
      }
      const r = await seatOfferApi.respond(saveId, o.id, body);
      if (!r.ok) {
        setError(seatOfferErrorText(t, i18n.language, r));
        if (r.error === "offerClosed" || r.error === "notFound" || r.error === "contractRefused") {
          setCurrent(null);
          notifySeatOffersChanged();
          onChanged?.();
        }
        return;
      }
      if (r.data.status === "countered" && r.data.offer) {
        setCurrent(r.data.offer);
        setCountering(false);
      } else {
        setStatus(t(`seatOffers.done.${r.data.status}`));
        setCurrent(null);
      }
      notifySeatOffersChanged();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0">
        {t(o.kind === "transfer" ? "seatOffers.transfer" : "seatOffers.loan")} · {o.playerName} · {t("seatOffers.withClub", { club: otherClub, manager: o.otherManager })}
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 m-0">
        {o.kind === "transfer" ? (
          <>
            <div>
              <dt className={LABEL}>{t("transfers.fee")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{formatFee(o.terms.fee)}</dd>
            </div>
            <div>
              <dt className={LABEL}>{t("negotiation.sellOn")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{o.terms.sellOnPct ? `${o.terms.sellOnPct}%` : "—"}</dd>
            </div>
            <div>
              <dt className={LABEL}>{t("seatOffers.contract")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">
                {t("seatOffers.contractTerms", { wage: formatFee(o.terms.wage ?? 0), count: o.terms.years ?? 0 })}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt className={LABEL}>{t("negotiation.wageShare")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{Math.round((o.terms.wageShare ?? 1) * 100)}%</dd>
            </div>
            <div>
              <dt className={LABEL}>{t("negotiation.loanFee")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{o.terms.fee ? formatFee(o.terms.fee) : "—"}</dd>
            </div>
            <div>
              <dt className={LABEL}>{t("negotiation.returns")}</dt>
              <dd className="m-0 text-sm text-foreground tabular-nums">{o.terms.until ? fmtDate(o.terms.until) : "—"}</dd>
            </div>
          </>
        )}
        <div>
          <dt className={LABEL}>{t("seatOffers.validUntil")}</dt>
          <dd className="m-0 text-sm text-foreground tabular-nums">{fmtDate(o.expires)}</dd>
        </div>
        <div>
          <dt className={LABEL}>{t("seatOffers.turn")}</dt>
          <dd className={`m-0 text-sm ${o.myTurn ? "text-primary font-semibold" : "text-foreground"}`}>
            {o.myTurn ? t("seatOffers.yourTurn") : t("seatOffers.theirTurn", { manager: o.otherManager || otherClub })}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t("seatOffers.counters")}</dt>
          <dd className="m-0 text-sm text-foreground tabular-nums">{t("seatOffers.countersUsed", { used: o.counters, total: MAX_COUNTERS })}</dd>
        </div>
      </dl>
      {last && (
        <p className="text-sm text-muted-foreground m-0">
          {t(`seatOffers.last.${last.action}`, {
            who: last.by === o.side ? t("seatOffers.you") : (o.otherManager || otherClub),
            date: fmtDate(last.date),
          })}
        </p>
      )}

      {countering && (
        <div className="space-y-3">
          <div>
            <p className={`${LABEL} m-0 mb-2`}>{t(o.kind === "transfer" ? "transfers.fee" : "negotiation.loanFee")}</p>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={feeMax} step={100_000} value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
                className="flex-1 accent-primary"
                aria-label={t(o.kind === "transfer" ? "transfers.fee" : "negotiation.loanFee")}
              />
              <span className="text-xl font-black font-display text-primary w-24 text-right tabular-nums">{formatFee(fee)}</span>
            </div>
          </div>
          {o.kind === "transfer" ? (
            <div>
              <p className={`${LABEL} m-0 mb-2`}>{t("negotiation.sellOn")}</p>
              <OptionChips
                aria-label={t("negotiation.sellOn")}
                options={SELL_ON_KEYS.map((k) => ({ key: k, label: `${k}%` }))}
                value={sellOn}
                onChange={setSellOn}
              />
            </div>
          ) : (
            <div>
              <p className={`${LABEL} m-0 mb-2`}>{t("negotiation.wageShare")}</p>
              <OptionChips
                aria-label={t("negotiation.wageShare")}
                options={SHARE_KEYS.map((k) => ({ key: k, label: `${k}%` }))}
                value={share}
                onChange={setShare}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {countering ? (
          <>
            <Button disabled={busy} onClick={() => void answer("counter")}>{t("seatOffers.sendCounter")}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setCountering(false)}>{t("common.cancel")}</Button>
          </>
        ) : (
          <>
            {o.myTurn && (
              <>
                <Button disabled={busy} onClick={() => void answer("accept")}>{t("seatOffers.accept")}</Button>
                <Button
                  variant="secondary" disabled={busy || !canCounter} onClick={() => setCountering(true)}
                  title={canCounter ? undefined : t("seatOffers.lastCounter")}
                >
                  {t("seatOffers.counter")}
                </Button>
                {o.side === "seller" && (
                  <Button variant="danger" disabled={busy} onClick={() => void answer("reject")}>{t("seatOffers.reject")}</Button>
                )}
              </>
            )}
            {o.side === "buyer" && (
              <Button variant="danger" disabled={busy} onClick={() => void answer("withdraw")}>{t("seatOffers.withdraw")}</Button>
            )}
          </>
        )}
      </div>
      {o.myTurn && !canCounter && !countering && <p className="text-sm text-muted-foreground m-0">{t("seatOffers.lastCounter")}</p>}
      {error && <p className="text-sm text-destructive m-0" role="alert">{error}</p>}
    </div>
  );
}
