import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { loadSession } from "@/GameInterface/gameSession";
import { capture } from "@/analytics";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Modal } from "@/GameInterface/Components/Modal";
import { translateTransferReason } from "@/GameInterface/Transfers/transferShared";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import type { TransferRecord } from "@/types/transferTypes";
import type { NegotiationTalk } from "@/types/transferMarketTypes";
import { ContractTermsFields, useContractDemand, useRefusalText } from "@/GameInterface/Contracts/ContractTermsFields";
import { Icon } from "@/GameInterface/Icons";
import { formatFee } from "@/Domain/money";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { NegotiationHistory } from "@/GameInterface/Negotiation/NegotiationHistory";

const LABEL = "block text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-2 font-display";
const ROUNDS_PER_DAY = 3;
const SELL_ON_KEYS = ["0", "10", "20", "30"] as const;

function rawTransferOfferValue(avg: number, age: number): number {
  const base = avg * avg * 0.8;
  const ageFactor = age <= 24 ? 1.3 : age <= 28 ? 1.0 : age <= 32 ? 0.7 : 0.4;
  return Math.round(base * ageFactor) * 1_000_000;
}

function offerSliderConfig(budget: number, avg: number, age: number) {
  const suggested = rawTransferOfferValue(avg, age);
  const cap = Math.max(suggested * 3, 10_000_000);
  const max = Math.min(budget, cap);
  if (budget <= 0 || max <= 0) {
    return { min: 0, max: 0, step: 500_000, canOffer: false as const };
  }
  if (max >= 1_000_000) {
    return { min: 1_000_000, max, step: 100_000, canOffer: true as const };
  }
  const step = 50_000;
  const min = Math.min(step, max);
  return { min, max, step, canOffer: true as const };
}

type Tab = "transfer" | "loan";
type Talk = NegotiationTalk | null;

interface Props {
  player: DisplayPlayer | null;
  onClose: () => void;
  /** Called when a transfer is accepted or refused. Parent handles refresh/navigation on close. */
  onTransferComplete?: (record: TransferRecord) => void;
}

/**
 * "Negotiation" (`.claude/rules/game/negotiation.md`): a transfer offer with a sell-on clause and
 * the club's counter-offers, or a loan request (wage share + loan fee). Shows the rounds of the
 * day and the patience left.
 */
export function PlayerOfferModal({ player, onClose, onTransferComplete }: Props) {
  const { t, i18n } = useTranslation();
  const { squad, refresh } = useGameSave();
  const budget = squad?.finances?.budget ?? 0;
  const saveId = loadSession()?.saveId;
  const [tab, setTab] = useState<Tab>("transfer");
  const [offerFee, setOfferFee] = useState(0);
  const [sellOn, setSellOn] = useState<(typeof SELL_ON_KEYS)[number]>("0");
  const [wageShare, setWageShare] = useState(100);
  const [loanFee, setLoanFee] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TransferRecord | null>(null);
  const [loanDone, setLoanDone] = useState<string | null>(null);
  const [talks, setTalks] = useState<Record<Tab, Talk>>({ transfer: null, loan: null });
  const [message, setMessage] = useState<string | null>(null);
  const refusalText = useRefusalText();
  const demand = useContractDemand(saveId, player?.id ?? null, player?.squadId);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  const [contractError, setContractError] = useState<string | null>(null);
  useEffect(() => { if (demand !== null) setWage(demand); }, [demand]);

  const slider = useMemo(
    () =>
      player
        ? offerSliderConfig(budget, player.avg, player.age)
        : { min: 0, max: 0, step: 500_000, canOffer: false as const },
    [player, budget],
  );

  const playerId = player?.id ?? null;
  const loadTalk = useCallback(async (kind: Tab) => {
    if (!saveId || !playerId) return;
    try {
      const res = await fetch(`/api/saves/${saveId}/negotiation/${encodeURIComponent(playerId)}?kind=${kind}`);
      if (!res.ok) return;
      const body = (await res.json()) as { talk: Talk };
      setTalks((cur) => ({ ...cur, [kind]: body.talk }));
    } catch { /* the modal still works without the history */ }
  }, [saveId, playerId]);

  // A different player: fresh state and that player's talks of the day.
  useEffect(() => {
    setResult(null);
    setLoanDone(null);
    setMessage(null);
    setContractError(null);
    setTab("transfer");
    setSellOn("0");
    setWageShare(100);
    setLoanFee(0);
    setTalks({ transfer: null, loan: null });
    if (playerId) {
      void loadTalk("transfer");
      void loadTalk("loan");
    }
  }, [playerId, loadTalk]);

  useEffect(() => {
    if (!player) return;
    const suggested = rawTransferOfferValue(player.avg, player.age);
    if (!slider.canOffer) setOfferFee(0);
    else setOfferFee(Math.min(slider.max, Math.max(slider.min, suggested)));
  }, [player, budget, slider.canOffer, slider.min, slider.max]);

  if (!player) return null;
  const activePlayer = player;
  const today = talks[tab];
  const closedUntil = today?.closedUntil ?? null;
  const roundsLeft = today ? Math.max(0, ROUNDS_PER_DAY - today.rounds) : ROUNDS_PER_DAY;
  const counter = today?.counter;
  const blocked = !!closedUntil || roundsLeft === 0;
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });

  function errorText(code: string | undefined): string {
    if (code === "talksClosed") return t("negotiation.errors.talksClosed");
    if (code === "noRounds") return t("negotiation.errors.noRounds");
    if (code === "onLoan") return t("negotiation.errors.onLoan");
    if (code === "squadFull") return t("negotiation.errors.squadFull");
    if (code === "Insufficient funds") return t("transfers.insufficientBudget");
    if (code === "noClub") return t("negotiation.errors.noClub");
    return t("negotiation.errors.generic");
  }

  async function submitOffer(fee: number, pct: number) {
    if (submitting || !activePlayer.squadId) return;
    const session = loadSession();
    if (!session) return;
    setSubmitting(true);
    setContractError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/saves/${session.saveId}/transfers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: activePlayer.id, fromSquadId: activePlayer.squadId, fee, wage, years, sellOnPct: pct }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string; record?: TransferRecord; talk?: NegotiationTalk;
        response?: { kind: "accept" | "counter" | "reject"; counterFee?: number; reason?: string };
      };
      if (!res.ok) {
        if (body.error && ["lowWage", "tooManyYears", "invalidYears"].includes(body.error)) {
          setContractError(refusalText(body.error));
        } else {
          setMessage(errorText(body.error));
        }
        void loadTalk("transfer");
        return;
      }
      if (body.talk) setTalks((cur) => ({ ...cur, transfer: body.talk! }));
      if (body.response?.kind === "counter") {
        setMessage(t("negotiation.counterReceived", { fee: formatFee(body.response.counterFee ?? 0) }));
        return;
      }
      if (body.record) {
        setResult(body.record);
        onTransferComplete?.(body.record);
        if (body.record.status === "accepted") void capture("transfer_made", { fee: body.record.fee, direction: body.record.direction });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLoan(share: number, fee: number) {
    if (submitting || !activePlayer.squadId) return;
    const session = loadSession();
    if (!session) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/saves/${session.saveId}/loans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: activePlayer.id, fromSquadId: activePlayer.squadId, wageShare: share, fee }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string; talk?: NegotiationTalk; until?: string;
        response?: { kind: "accept" | "counter" | "reject"; wageShare?: number; fee?: number; reason?: string };
      };
      if (!res.ok) {
        setMessage(errorText(body.error));
        void loadTalk("loan");
        return;
      }
      if (body.talk) setTalks((cur) => ({ ...cur, loan: body.talk! }));
      const r = body.response;
      if (r?.kind === "accept") {
        setLoanDone(body.until ?? "");
        void refresh();
      } else if (r?.kind === "counter") {
        setMessage(t("negotiation.loanCounter", { share: Math.round((r.wageShare ?? 1) * 100), fee: formatFee(r.fee ?? 0) }));
      } else if (r?.kind === "reject") {
        setMessage(t(`negotiation.loanRefusal.${r.reason ?? "notAvailable"}`));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const done = !!result || loanDone !== null;

  return (
    <Modal open onClose={onClose} size="md">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50 space-y-3">
          <div>
            <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("negotiation.title")}</h2>
            <p className="text-sm text-muted-foreground m-0 mt-0.5">
              {player.name} · {player.pos} · {player.age}y · {player.club}
            </p>
          </div>
          {!done && (
            <SegmentedTabs
              fill
              tabs={[
                { key: "transfer", label: t("negotiation.tabs.transfer") },
                { key: "loan", label: t("negotiation.tabs.loan"), disabled: !!player.loan },
              ]}
              active={tab}
              onChange={(k) => { setTab(k); setMessage(null); }}
            />
          )}
        </div>

        <div className="p-6 space-y-5">
          {result ? (
            <div className="text-center py-4">
              {result.status === "accepted" ? (
                <>
                  <Icon name="check-circle" className="w-12 h-12 text-chart-2 mx-auto mb-3" />
                  <p className="text-base font-black text-chart-2 m-0">{translateTransferReason(t, result.reason, true)}</p>
                  <p className="text-sm text-muted-foreground mt-1 m-0 tabular-nums">
                    {t("transfers.acceptedSummary", { name: player.name, fee: formatFee(result.fee) })}
                  </p>
                </>
              ) : (
                <>
                  <Icon name="xcircle" className="w-12 h-12 text-destructive mx-auto mb-3" />
                  <p className="text-base font-black text-destructive m-0">{t("transfers.offerRejected")}</p>
                  <p className="text-sm text-muted-foreground mt-1 m-0">{translateTransferReason(t, result.reason, false)}</p>
                </>
              )}
              <Button className="mt-5" onClick={onClose}>{t("common.close")}</Button>
            </div>
          ) : loanDone !== null ? (
            <div className="text-center py-4">
              <Icon name="check-circle" className="w-12 h-12 text-chart-2 mx-auto mb-3" />
              <p className="text-base font-black text-chart-2 m-0">{t("negotiation.loanAgreed", { name: player.name })}</p>
              {loanDone && (
                <p className="text-sm text-muted-foreground mt-1 m-0 tabular-nums">{t("negotiation.loanUntil", { date: fmtDate(loanDone) })}</p>
              )}
              <Button className="mt-5" onClick={onClose}>{t("common.close")}</Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground m-0 tabular-nums">
                {closedUntil
                  ? t("negotiation.closedUntil", { date: fmtDate(closedUntil) })
                  : t("negotiation.patience", { count: roundsLeft, total: ROUNDS_PER_DAY })}
              </p>

              {tab === "transfer" ? (
                <>
                  <div>
                    <label className={LABEL}>{t("transfers.fee")}</label>
                    <p className="text-sm text-muted-foreground mb-2 m-0">
                      {t("transfers.availableBudget")}:{" "}
                      <span className="text-primary font-semibold tabular-nums">{formatFee(budget)}</span>
                    </p>
                    {!slider.canOffer ? (
                      <p className="text-sm text-destructive m-0">{t("transfers.insufficientBudget")}</p>
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
                          aria-label={t("transfers.fee")}
                        />
                        <span className="text-xl font-black font-display text-primary w-24 text-right tabular-nums">
                          {formatFee(offerFee)}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground mt-1 m-0">
                      {t("transfers.estValue")}: <span className="text-foreground/80 font-semibold">{player.value}</span>
                    </p>
                  </div>

                  <div>
                    <label className={LABEL}>{t("negotiation.sellOn")}</label>
                    <OptionChips
                      aria-label={t("negotiation.sellOn")}
                      options={SELL_ON_KEYS.map((k) => ({ key: k, label: `${k}%` }))}
                      value={sellOn}
                      onChange={setSellOn}
                    />
                    <p className="text-sm text-muted-foreground mt-1 m-0">{t("negotiation.sellOnHint")}</p>
                  </div>

                  <div>
                    <label className={LABEL}>{t("contracts.terms")}</label>
                    <ContractTermsFields wage={wage} years={years} onWage={setWage} onYears={setYears} demand={demand} />
                    {contractError && <p className="text-sm text-destructive m-0 mt-2" role="alert">{contractError}</p>}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={LABEL}>{t("negotiation.wageShare")}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0} max={100} step={10} value={wageShare}
                        onChange={(e) => setWageShare(Number(e.target.value))}
                        className="flex-1 accent-primary"
                        aria-label={t("negotiation.wageShare")}
                      />
                      <span className="text-xl font-black font-display text-primary w-24 text-right tabular-nums">{wageShare}%</span>
                    </div>
                  </div>
                  <div>
                    <label className={LABEL}>{t("negotiation.loanFee")}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0} max={Math.max(0, Math.min(budget, 10_000_000))} step={100_000}
                        value={Math.min(loanFee, Math.max(0, budget))}
                        onChange={(e) => setLoanFee(Number(e.target.value))}
                        className="flex-1 accent-primary"
                        aria-label={t("negotiation.loanFee")}
                      />
                      <span className="text-xl font-black font-display text-primary w-24 text-right tabular-nums">{formatFee(loanFee)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 m-0">{t("negotiation.loanDuration")}</p>
                  </div>
                </>
              )}

              {today && today.history.length > 0 && <NegotiationHistory talk={today} />}
              {message && <p className="text-sm text-foreground m-0" role="status">{message}</p>}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
                <span className="flex-1" />
                {counter && !closedUntil && (
                  <Button
                    disabled={submitting}
                    className="tabular-nums"
                    onClick={() => (tab === "transfer"
                      ? void submitOffer(counter.fee, counter.sellOnPct ?? 0)
                      : void submitLoan(Math.round((counter.wageShare ?? 1) * 100), counter.fee))}
                  >
                    {tab === "transfer"
                      ? t("negotiation.acceptCounter", { fee: formatFee(counter.fee) })
                      : t("negotiation.acceptLoanCounter", { share: Math.round((counter.wageShare ?? 1) * 100), fee: formatFee(counter.fee) })}
                  </Button>
                )}
                <Button
                  variant={counter ? "secondary" : "primary"}
                  disabled={submitting || blocked || (tab === "transfer" && !slider.canOffer)}
                  onClick={() => (tab === "transfer" ? void submitOffer(offerFee, Number(sellOn)) : void submitLoan(wageShare, loanFee))}
                >
                  {submitting ? t("transfers.sending") : tab === "transfer" ? t("transfers.sendOffer") : t("negotiation.requestLoan")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
