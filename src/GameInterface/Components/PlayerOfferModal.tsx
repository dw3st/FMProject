import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import { loadSession } from "@/GameInterface/gameSession";
import { capture } from "@/analytics";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Modal } from "@/GameInterface/Components/Modal";
import { translateTransferReason } from "@/GameInterface/Transfers/transferShared";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import type { TransferRecord } from "@/types/transferTypes";

export function rawTransferOfferValue(avg: number, age: number): number {
  const base = avg * avg * 0.8;
  const ageFactor = age <= 24 ? 1.3 : age <= 28 ? 1.0 : age <= 32 ? 0.7 : 0.4;
  return Math.round(base * ageFactor) * 1_000_000;
}

export function formatTransferFee(fee: number): string {
  const m = fee / 1_000_000;
  if (m >= 100) return `£${Math.round(m)}M`;
  if (m >= 1) return `£${m.toFixed(1)}M`;
  return `£${(fee / 1000).toFixed(0)}K`;
}

function offerSliderConfig(budget: number, avg: number, age: number) {
  const suggested = rawTransferOfferValue(avg, age);
  const cap = Math.max(suggested * 3, 10_000_000);
  const max = Math.min(budget, cap);
  if (budget <= 0 || max <= 0) {
    return { min: 0, max: 0, step: 500_000, canOffer: false as const };
  }
  if (max >= 1_000_000) {
    return { min: 1_000_000, max, step: 500_000, canOffer: true as const };
  }
  const step = 50_000;
  const min = Math.min(step, max);
  return { min, max, step, canOffer: true as const };
}

interface Props {
  player: DisplayPlayer | null;
  onClose: () => void;
  /** Called when the transfer API responds (accepted or rejected). Parent handles refresh/navigation on close. */
  onTransferComplete?: (record: TransferRecord) => void;
}

export function PlayerOfferModal({ player, onClose, onTransferComplete }: Props) {
  const { t } = useTranslation();
  const { squad } = useGameSave();
  const budget = squad?.finances?.budget ?? 0;
  const [offerFee, setOfferFee] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TransferRecord | null>(null);

  const slider = useMemo(
    () =>
      player
        ? offerSliderConfig(budget, player.avg, player.age)
        : { min: 0, max: 0, step: 500_000, canOffer: false as const },
    [player, budget],
  );

  // Reset result only when switching to a different player, not when budget changes after refresh()
  const playerId = player?.id ?? null;
  useEffect(() => {
    setResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // Sync fee slider when player or budget changes
  useEffect(() => {
    if (!player) return;
    const suggested = rawTransferOfferValue(player.avg, player.age);
    if (!slider.canOffer) {
      setOfferFee(0);
    } else {
      const clamped = Math.min(slider.max, Math.max(slider.min, suggested));
      setOfferFee(clamped);
    }
  }, [player, budget, slider.canOffer, slider.min, slider.max]);

  if (!player) return null;

  const activePlayer = player;

  async function submitOffer() {
    if (submitting) return;
    const session = loadSession();
    if (!session) return;

    if (!activePlayer.squadId) {
      alert("Cannot make offer: missing club information.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/saves/${session.saveId}/transfers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: activePlayer.id,
          fromSquadId: activePlayer.squadId,
          fee: offerFee,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        alert(err.error ?? "Transfer failed");
        return;
      }

      const { record } = await res.json() as {
        record: TransferRecord;
        newClubMoney: number;
      };

      setResult(record);
      onTransferComplete?.(record);
      if (record.status === "accepted") {
        void capture("transfer_made", { fee: record.fee, direction: record.direction });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <h2 className="text-lg font-black font-display text-foreground uppercase tracking-wider m-0">
            {t("transfers.makeOffer")}
          </h2>
          <p className="text-xs text-muted-foreground m-0 mt-0.5">
            {player.name} · {player.pos} · {player.age}y · {player.club}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {!result ? (
            <>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  {t("transfers.fee")}
                </label>
                <p className="text-[11px] text-muted-foreground mb-2 m-0">
                  {t("transfers.availableBudget")}:{" "}
                  <span className="text-primary font-semibold">{formatTransferFee(budget)}</span>
                </p>
                {!slider.canOffer ? (
                  <p className="text-sm text-red-400 m-0">
                    {t("transfers.insufficientBudget")}
                  </p>
                ) : (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={offerFee}
                      onChange={(e) => setOfferFee(Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xl font-black font-display text-primary w-24 text-right">
                      {formatTransferFee(offerFee)}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-1 m-0">
                  {t("transfers.estValue")}: <span className="text-foreground/80 font-semibold">{player.value}</span>
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer bg-transparent"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={submitOffer}
                  disabled={submitting || !slider.canOffer}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wider glow-primary hover:scale-[1.02] transition-all cursor-pointer border-0 disabled:opacity-60"
                >
                  {submitting ? t("transfers.sending") : t("transfers.sendOffer")}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              {result.status === "accepted" ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                  <p className="text-base font-black text-emerald-400 m-0">{translateTransferReason(t, result.reason, true)}</p>
                  <p className="text-sm text-muted-foreground mt-1 m-0">
                    {t("transfers.acceptedSummary", { name: player.name, fee: formatTransferFee(result.fee) })}
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                  <p className="text-base font-black text-red-400 m-0">{t("transfers.offerRejected")}</p>
                  <p className="text-sm text-muted-foreground mt-1 m-0">{translateTransferReason(t, result.reason, false)}</p>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-5 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider glow-primary cursor-pointer border-0"
              >
                {t("common.close")}
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
