import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { MANAGER_CONTRACT } from "@/Domain/managers/managerContract";
import { formatFee } from "@/Domain/money";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";

interface Renewal {
  offeredOn: string;
  expires: string;
  wage: number;
  seasons: number;
  rounds?: number;
}

/** A proposal moves the wage by 5% of the offer, on a round figure. */
function wageStep(wage: number): number {
  return Math.max(100, Math.round((wage * 0.05) / 100) * 100);
}

/**
 * The board's renewal offer for the manager (`.claude/rules/game/jobs.md` → "Contrato do técnico"):
 * Accept / Decline while it is pending (`POST /api/saves/:id/manager-contract`).
 */
export function ManagerRenewalCard({
  saveId, renewal: offered, onAnswered,
}: {
  saveId: string;
  renewal: Renewal | null | undefined;
  onAnswered: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<"renewed" | "declined" | null>(null);
  // The board's answer to a proposal replaces the offer on the table.
  const [countered, setCountered] = useState<Renewal | null>(null);
  const renewal = countered ?? offered;
  const [proposal, setProposal] = useState<{ wage: number; seasons: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (answered) {
    return <p className="text-sm text-muted-foreground m-0">{t(`managerContract.${answered}`)}</p>;
  }
  if (!renewal) return <p className="text-sm text-muted-foreground m-0">{t("managerContract.noOffer")}</p>;

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/manager-contract`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        setError(t("managerContract.offerClosed"));
        return;
      }
      setAnswered(accept ? "renewed" : "declined");
      onAnswered();
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/manager-contract`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proposal),
      });
      const data = await res.json().catch(() => ({})) as { status?: string; offer?: Renewal; error?: string };
      if (data.status === "renewed") {
        setAnswered("renewed");
        onAnswered();
      } else if (data.status === "countered" && data.offer) {
        setCountered(data.offer);
        setProposal(null);
        setNotice(t("managerContract.boardCounter"));
      } else if (data.error === "noRounds") {
        setProposal(null);
        setNotice(t("managerContract.noRounds"));
      } else {
        setError(t("managerContract.offerClosed"));
      }
    } catch {
      setError(t("managerContract.offerClosed"));
    } finally {
      setBusy(false);
    }
  }

  const roundsLeft = Math.max(0, MANAGER_CONTRACT.COUNTER_ROUNDS - (renewal.rounds ?? 0));
  const step = wageStep(renewal.wage);

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <p className="text-sm text-foreground m-0 tabular-nums">
        {t("managerContract.offerTerms", { wage: formatFee(renewal.wage), count: renewal.seasons })}
      </p>
      <p className="text-sm text-muted-foreground m-0">
        {t("managerContract.validUntil", { date: formatDay(renewal.expires, i18n.language, "year") })}
      </p>
      {notice && <p className="text-sm text-foreground m-0" role="status">{notice}</p>}
      {error && <p className="text-sm text-destructive m-0" role="alert">{error}</p>}
      {proposal ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">{t("managerContract.wageLabel")}</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" aria-label={t("managerContract.wageLess")} disabled={proposal.wage - step <= 0} onClick={() => setProposal({ ...proposal, wage: proposal.wage - step })}><Icon name="minus" size={16} /></Button>
                <span className="font-display font-bold tabular-nums text-lg min-w-24 text-center">{formatFee(proposal.wage)}</span>
                <Button variant="secondary" aria-label={t("managerContract.wageMore")} onClick={() => setProposal({ ...proposal, wage: proposal.wage + step })}><Icon name="plus" size={16} /></Button>
              </div>
            </div>
            <div>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">{t("managerContract.seasonsLabel")}</p>
              <OptionChips
                aria-label={t("managerContract.seasonsLabel")}
                options={[1, 2, 3].map((s) => ({ key: String(s), label: String(s) }))}
                value={String(proposal.seasons)}
                onChange={(k) => setProposal({ ...proposal, seasons: Number(k) })}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground m-0">{t("managerContract.negotiateHint")}</p>
          <div className="flex gap-3">
            <Button disabled={busy} onClick={() => void propose()}>{t("managerContract.sendProposal")}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setProposal(null)}>{t("managerContract.backToOffer")}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void answer(true)}>{t("managerContract.accept")}</Button>
          <Button variant="secondary" disabled={busy || roundsLeft === 0} title={roundsLeft === 0 ? t("managerContract.noRounds") : undefined} onClick={() => { setNotice(null); setProposal({ wage: renewal.wage, seasons: renewal.seasons }); }}>
            {t("managerContract.negotiate", { count: roundsLeft })}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>{t("managerContract.decline")}</Button>
        </div>
      )}
    </div>
  );
}
