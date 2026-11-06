import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { maxOfferYears } from "@/Domain/contracts/contracts";
import { loadSession } from "@/GameInterface/gameSession";
import { formatGameDate } from "@/GameInterface/formatDate";
import {
  ContractTermsFields, SigningBonusField, useContractDemandInfo, useRefusalText,
} from "@/GameInterface/Contracts/ContractTermsFields";
import { RenewalResult, type RenewalOutcome } from "@/GameInterface/Contracts/RenewalResult";
import { faceUrl } from "@/Domain/faces/faceUrl";
import { formatWageFull } from "@/Domain/money";

/** Refusals that are the player's own answer (shown as the refused scene); the others are rules, shown inline. */
const PLAYER_REFUSALS = new Set(["lowWage", "unhappy", "smallerClub", "poorFacilities"]);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]!.charAt(0) + (parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "")).toUpperCase();
}

interface ContractTarget {
  id: string;
  name: string;
  age: number;
  /** Squad id the player belongs to now (own club for a renewal); omit for a free agent. */
  squadId?: string;
  /** Year his current contract ends, when he has one. */
  contractUntil?: string;
  /** His face on the renewal result. */
  nationality?: string | null;
  clubColors?: readonly string[];
}

interface Props {
  /** "renew" = own player, "sign" = free agent. */
  mode: "renew" | "sign";
  player: ContractTarget | null;
  onClose: () => void;
  /** Called after the server accepted the contract. */
  onDone?: () => void;
}

/** Renewal of an own player, or signing of a free agent: wage + years against the player's demand. */
export function ContractOfferModal({ mode, player, onClose, onDone }: Props) {
  const { t, i18n } = useTranslation();
  const session = loadSession();
  const refusalText = useRefusalText();
  const demandInfo = useContractDemandInfo(session?.saveId, player?.id ?? null, mode === "renew" ? player?.squadId : undefined);
  const demand = demandInfo?.demand ?? null;
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [outcome, setOutcome] = useState<RenewalOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A free agent near the age cap only takes a short deal: open on what he accepts (tester report, 4.41.25).
  const maxYears = mode === "sign" && player ? maxOfferYears(player.age) : 5;
  useEffect(() => { setError(null); setDone(false); setOutcome(null); setYears(Math.min(2, maxYears)); }, [player?.id, maxYears]);
  useEffect(() => { if (demand !== null) setWage(demand); }, [demand]);
  // A free agent asks a signing bonus, paid on signing, with other clubs after him (4.47.9).
  const [bonus, setBonus] = useState(0);
  useEffect(() => { setBonus(demandInfo?.bonusAsk ?? 0); }, [demandInfo]);

  if (!player || !session) return null;

  async function submit() {
    if (submitting || !player || !session) return;
    setSubmitting(true);
    setError(null);
    try {
      const url = mode === "renew"
        ? `/api/saves/${session.saveId}/players/${encodeURIComponent(player.id)}/renew`
        : `/api/saves/${session.saveId}/free-agents/${encodeURIComponent(player.id)}/sign`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "sign" ? { wage, years, bonus } : { wage, years }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; rival?: { clubName: string } };
        const code = err.error ?? "generic";
        if (mode === "renew" && PLAYER_REFUSALS.has(code)) setOutcome({ kind: "refused", detail: refusalText(code) });
        else if (code === "prefersRival" && err.rival) setError(t("contracts.bonus.prefersRival", { club: err.rival.clubName }));
        else setError(refusalText(code));
        return;
      }
      if (mode === "renew") {
        const body = (await res.json().catch(() => ({}))) as { contract?: { until: string; wage: number } };
        const c = body.contract;
        setOutcome({
          kind: "renewed",
          detail: c ? t("contracts.result.until", { date: formatGameDate(c.until, i18n.language), wage: formatWageFull(c.wage) }) : t("contracts.renewed"),
        });
      }
      setDone(true);
      // A renewal refreshes the sheet when its result is closed: refreshing now remounts this window and loses it.
      if (mode !== "renew") onDone?.();
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "renew" && outcome) {
    const close = () => { if (outcome.kind === "renewed") onDone?.(); onClose(); };
    return (
      <Modal open onClose={close} size="sm">
        <RenewalResult
          outcome={outcome} name={player.name} fallback={initialsOf(player.name)}
          faceSrc={faceUrl(player.id, player.nationality, player.clubColors)}
          onClose={close}
          {...(outcome.kind === "refused" ? { onRetry: () => setOutcome(null) } : {})}
        />
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">
            {mode === "renew" ? t("contracts.renewTitle") : t("contracts.signTitle")}
          </h2>
          <p className="text-sm text-muted-foreground m-0 mt-0.5">
            {player.name} · {t("common.ageYears", { age: player.age })}
            {player.contractUntil ? ` · ${t("contracts.currentUntil", { year: player.contractUntil })}` : ""}
          </p>
        </div>
        <div className="p-6 space-y-5">
          {done ? (
            <div className="text-center py-2">
              <p className="text-base font-black text-chart-2 m-0">
                {mode === "renew" ? t("contracts.renewed") : t("contracts.signed")}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 px-6 h-10 rounded bg-primary text-primary-foreground font-semibold text-sm cursor-pointer border-0"
              >
                {t("common.close")}
              </button>
            </div>
          ) : (
            <>
              <ContractTermsFields wage={wage} years={years} onWage={setWage} onYears={setYears} demand={demand} info={demandInfo} maxYears={maxYears} />
              {mode === "sign" && <SigningBonusField ask={demandInfo?.bonusAsk} rivals={demandInfo?.rivals} bonus={bonus} onBonus={setBonus} paidOn="now" />}
              {mode === "renew" && demandInfo?.renewableOn ? (
                <p className="text-sm text-chart-4 m-0">{t("contracts.recentlyRenewed", { date: formatGameDate(demandInfo.renewableOn, i18n.language) })}</p>
              ) : mode === "renew" && demandInfo?.refuses ? (
                <p className="text-sm text-destructive m-0">{t("morale.contract.refuses")}</p>
              ) : mode === "renew" && (demandInfo?.moraleDemandMult ?? 1) > 1 ? (
                <p className="text-sm text-chart-4 m-0">
                  {t("morale.contract.unhappy", { pct: Math.round(((demandInfo?.moraleDemandMult ?? 1) - 1) * 100) })}
                </p>
              ) : null}
              {error && <p className="text-sm text-destructive m-0" role="alert">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 rounded border-0 text-sm font-semibold text-muted-foreground cursor-pointer bg-transparent hover:text-foreground"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || demand === null || (mode === "renew" && !!demandInfo?.renewableOn)}
                  className="flex-1 h-10 rounded bg-primary text-primary-foreground text-sm font-semibold cursor-pointer border-0 disabled:opacity-60"
                >
                  {submitting ? t("transfers.sending") : mode === "renew" ? t("contracts.renew") : t("contracts.sign")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
