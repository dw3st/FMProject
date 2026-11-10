import { useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { navigate } from "@/GameInterface/router/navigation";
import { JOBS } from "@/Domain/jobs/jobsConfig";
import { compensationFee } from "@/Domain/managers/managerContract";
import { formatFee } from "@/Domain/money";

/**
 * Leaving the club (8.9.23): "available on the market" (offers every two weeks, the board loses a little each month)
 * and "resign" (out now, no severance, unemployed). Shown on the club card of the dashboard.
 */
export function CareerExitControls() {
  const { t } = useTranslation();
  const { session, save, refresh } = useGameSave();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (!session || !save || save.unemployed || !save.clubId) return null;
  const seeking = !!save.jobSeeking;
  const fee = save.currentDate ? compensationFee(save.managerContract, save.currentDate) : 0;

  async function setSeeking(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${session!.saveId}/job-seeking`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on }),
      });
      if (!res.ok) { setError(t("jobs.exitFailed")); return; }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resign() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${session!.saveId}/job-resign`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; fee?: number; wallet?: number };
        setError(body.error === "noMoney" ? t("jobs.resign.noMoney", { fee: formatFee(body.fee ?? 0), wallet: formatFee(body.wallet ?? 0) }) : t("jobs.exitFailed"));
        setConfirming(false);
        return;
      }
      await refresh();
      setConfirming(false);
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Chip selected={seeking} disabled={busy} onClick={() => void setSeeking(!seeking)} title={t("jobs.seeking.help", { board: JOBS.seeking.BOARD_PER_MONTH })}>
          {t("jobs.seeking.label")}
        </Chip>
        <Button variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>{t("jobs.resign.button")}</Button>
      </div>
      {seeking && (
        <p className="text-sm text-muted-foreground m-0">{t("jobs.seeking.on", { board: JOBS.seeking.BOARD_PER_MONTH })}</p>
      )}
      {error && <p className="text-sm text-destructive m-0">{error}</p>}
      <Modal open={confirming} onClose={() => !busy && setConfirming(false)} size="sm">
        <div className="p-6 space-y-4">
          <DialogTitle className="font-display font-black uppercase text-xl leading-none m-0">{t("jobs.resign.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground m-0">{t("jobs.resign.body", { club: save.clubName })}</p>
          <p className="text-sm text-foreground m-0 tabular-nums">{fee > 0 ? t("jobs.resign.fee", { fee: formatFee(fee) }) : t("jobs.resign.noFee")}</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
            <Button disabled={busy} onClick={() => void resign()}>{t("jobs.resign.confirm")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
