import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { loadSession } from "@/GameInterface/gameSession";
import {
  ContractTermsFields, useContractDemandInfo, useRefusalText,
} from "@/GameInterface/Contracts/ContractTermsFields";

interface ContractTarget {
  id: string;
  name: string;
  age: number;
  /** Squad id the player belongs to now (own club for a renewal); omit for a free agent. */
  squadId?: string;
  /** Year his current contract ends, when he has one. */
  contractUntil?: string;
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
  const { t } = useTranslation();
  const session = loadSession();
  const refusalText = useRefusalText();
  const demandInfo = useContractDemandInfo(session?.saveId, player?.id ?? null, mode === "renew" ? player?.squadId : undefined);
  const demand = demandInfo?.demand ?? null;
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setError(null); setDone(false); setYears(2); }, [player?.id]);
  useEffect(() => { if (demand !== null) setWage(demand); }, [demand]);

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
        body: JSON.stringify({ wage, years }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(refusalText(err.error ?? "generic"));
        return;
      }
      setDone(true);
      onDone?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">
            {mode === "renew" ? t("contracts.renewTitle") : t("contracts.signTitle")}
          </h2>
          <p className="text-sm text-muted-foreground m-0 mt-0.5">
            {player.name} · {player.age}y
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
              <ContractTermsFields wage={wage} years={years} onWage={setWage} onYears={setYears} demand={demand} info={demandInfo} />
              {mode === "renew" && demandInfo?.refuses ? (
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
                  disabled={submitting || demand === null}
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
