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
import { ContractTermsFields, useContractDemandInfo, useRefusalText } from "@/GameInterface/Contracts/ContractTermsFields";
import { Icon } from "@/GameInterface/Icons";
import { formatFee } from "@/Domain/money";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { NegotiationHistory } from "@/GameInterface/Negotiation/NegotiationHistory";
import { windowClosedText } from "@/GameInterface/Transfers/transferWindow";
import { addDays } from "@/Domain/dates";

/** Pre-contract window (D2): the target's contract ends within this many days. */
const PRE_CONTRACT_DAYS = 183;

interface RivalDto { clubId: string; clubName: string; fee: number; deadline: string; sellerAccepts: boolean }
interface WindowDto { open: boolean; until?: string; opensOn?: string }

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

type Tab = "transfer" | "loan" | "precontract";
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
  const { squad, refresh, currentDate } = useGameSave();
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
  const [talks, setTalks] = useState<Record<Tab, Talk>>({ transfer: null, loan: null, precontract: null });
  const [buyWindow, setBuyWindow] = useState<WindowDto | null>(null);
  const [rivals, setRivals] = useState<RivalDto[]>([]);
  const [preference, setPreference] = useState<{ winner: string; clubName: string; reason: string } | null>(null);
  const [preDone, setPreDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refusalText = useRefusalText();
  const demandInfo = useContractDemandInfo(saveId, player?.id ?? null, player?.squadId);
  const demand = demandInfo?.demand ?? null;
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  const [contractError, setContractError] = useState<string | null>(null);
  useEffect(() => { if (demand !== null) setWage(demand); }, [demand]);
  // Default length the player accepts at his age (age + years <= 36), as the server's default.
  useEffect(() => {
    if (player) setYears(Math.min(3, Math.max(1, 36 - player.age)));
  }, [player?.id]);

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
      const body = (await res.json()) as { talk: Talk; window?: WindowDto; rivals?: RivalDto[] };
      setTalks((cur) => ({ ...cur, [kind]: body.talk }));
      if (body.window) setBuyWindow(body.window);
      if (kind === "transfer") setRivals(body.rivals ?? []);
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
    setTalks({ transfer: null, loan: null, precontract: null });
    setRivals([]);
    setPreference(null);
    setPreDone(false);
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

  // Window closed: a target near the end of his contract opens on the pre-contract tab.
  const closedNow = buyWindow !== null && !buyWindow.open;
  const eligibleNow = !!player?.contractEnd && !!currentDate && !player?.loan
    && player.contractEnd >= currentDate && player.contractEnd <= addDays(currentDate, PRE_CONTRACT_DAYS);
  useEffect(() => {
    if (closedNow && eligibleNow) setTab("precontract");
  }, [closedNow, eligibleNow]);

  if (!player) return null;
  const activePlayer = player;
  const today = tab === "precontract" ? null : talks[tab];
  const windowClosed = buyWindow !== null && !buyWindow.open;
  const preContractEligible = !!player.contractEnd && !!currentDate
    && player.contractEnd >= currentDate && player.contractEnd <= addDays(currentDate, PRE_CONTRACT_DAYS) && !player.loan;
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
    if (code === "notEligible") return t("negotiation.preContract.notEligible");
    return t("negotiation.errors.generic");
  }

  async function submitPreContract() {
    if (submitting || !activePlayer.squadId || !saveId) return;
    setSubmitting(true);
    setContractError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/pre-contracts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: activePlayer.id, fromSquadId: activePlayer.squadId, wage, years }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; accepted?: boolean; reason?: string };
      if (!res.ok) {
        if (body.error && ["lowWage", "tooManyYears", "invalidYears", "smallerClub"].includes(body.error)) setContractError(refusalText(body.error));
        else setMessage(errorText(body.error));
        return;
      }
      if (body.accepted) {
        setPreDone(true);
        void refresh();
      } else {
        setMessage(t("negotiation.preContract.prefersCurrent"));
      }
    } finally {
      setSubmitting(false);
    }
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
        error?: string; opensOn?: string; record?: TransferRecord; talk?: NegotiationTalk;
        response?: { kind: "accept" | "counter" | "reject" | "prefers_rival" | "lost"; counterFee?: number; reason?: string; clubName?: string; fee?: number };
        rival?: RivalDto[];
        preference?: { winner: string; clubName: string; reason: string };
      };
      if (!res.ok) {
        if (body.error && ["lowWage", "tooManyYears", "invalidYears", "smallerClub"].includes(body.error)) {
          setContractError(refusalText(body.error));
        } else if (body.error === "windowClosed") {
          setMessage(windowClosedText(t, i18n.language, body.opensOn));
        } else {
          setMessage(errorText(body.error));
        }
        void loadTalk("transfer");
        return;
      }
      if (body.talk) setTalks((cur) => ({ ...cur, transfer: body.talk! }));
      if (body.rival) setRivals(body.rival);
      setPreference(body.preference ?? null);
      if (body.response?.kind === "counter") {
        setMessage(t("negotiation.counterReceived", { fee: formatFee(body.response.counterFee ?? 0) }));
        return;
      }
      if (body.response?.kind === "prefers_rival") {
        setMessage(t(`negotiation.rival.prefers.${body.response.reason ?? "wage"}`, { club: body.response.clubName ?? "" }));
        return;
      }
      if (body.response?.kind === "lost") {
        setMessage(t("negotiation.rival.lost", { club: body.response.clubName ?? "", fee: formatFee(body.response.fee ?? 0) }));
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
        setMessage(body.error === "windowClosed" ? windowClosedText(t, i18n.language, (body as { opensOn?: string }).opensOn) : errorText(body.error));
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

  const done = !!result || loanDone !== null || preDone;

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
                ...(preContractEligible ? [{ key: "precontract" as const, label: t("negotiation.preContract.tab") }] : []),
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
          ) : preDone ? (
            <div className="text-center py-4">
              <Icon name="check-circle" className="w-12 h-12 text-chart-2 mx-auto mb-3" />
              <p className="text-base font-black text-chart-2 m-0">{t("negotiation.preContract.signed", { name: player.name })}</p>
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
              {tab !== "precontract" && (
                <p className="text-sm text-muted-foreground m-0 tabular-nums">
                  {closedUntil
                    ? t("negotiation.closedUntil", { date: fmtDate(closedUntil) })
                    : t("negotiation.patience", { count: roundsLeft, total: ROUNDS_PER_DAY })}
                </p>
              )}
              {windowClosed && tab !== "precontract" && (
                <p className="text-sm text-destructive m-0" role="status">
                  {windowClosedText(t, i18n.language, buyWindow?.opensOn)}
                  {preContractEligible ? ` · ${t("negotiation.preContract.hint")}` : ""}
                </p>
              )}

              {tab === "transfer" && rivals.length > 0 && (
                <div className="rounded-md border border-border p-3 space-y-1">
                  <p className={LABEL}>{t("negotiation.rival.title")}</p>
                  {rivals.map((r) => (
                    <p key={r.clubId} className="text-sm text-foreground m-0 tabular-nums">
                      {t("negotiation.rival.line", { club: r.clubName, fee: formatFee(r.fee), date: fmtDate(r.deadline) })}
                    </p>
                  ))}
                  {preference && (
                    <p className="text-sm text-muted-foreground m-0">
                      {t(`negotiation.rival.preference.${preference.reason}`, { club: preference.clubName })}
                    </p>
                  )}
                </div>
              )}

              {tab === "precontract" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground m-0">{t("negotiation.preContract.explain", { date: fmtDate(player.contractEnd ?? currentDate) })}</p>
                  <label className={LABEL}>{t("contracts.terms")}</label>
                  <ContractTermsFields wage={wage} years={years} onWage={setWage} onYears={setYears} demand={demand} info={demandInfo} />
                  {contractError && <p className="text-sm text-destructive m-0 mt-2" role="alert">{contractError}</p>}
                </div>
              ) : tab === "transfer" ? (
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
                    <ContractTermsFields wage={wage} years={years} onWage={setWage} onYears={setYears} demand={demand} info={demandInfo} />
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
                {tab === "precontract" && (
                  <Button disabled={submitting} onClick={() => void submitPreContract()}>
                    {submitting ? t("transfers.sending") : t("negotiation.preContract.send")}
                  </Button>
                )}
                {tab !== "precontract" && counter && !closedUntil && !windowClosed && (
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
                {tab !== "precontract" && <Button
                  variant={counter ? "secondary" : "primary"}
                  disabled={submitting || blocked || windowClosed || (tab === "transfer" && !slider.canOffer)}
                  onClick={() => (tab === "transfer" ? void submitOffer(offerFee, Number(sellOn)) : void submitLoan(wageShare, loanFee))}
                >
                  {submitting ? t("transfers.sending") : tab === "transfer" ? t("transfers.sendOffer") : t("negotiation.requestLoan")}
                </Button>}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
