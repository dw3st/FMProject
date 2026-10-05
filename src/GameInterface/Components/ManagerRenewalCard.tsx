import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { formatFee } from "@/Domain/money";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";

interface Renewal {
  offeredOn: string;
  expires: string;
  wage: number;
  seasons: number;
}

/**
 * The board's renewal offer for the manager (`.claude/rules/game/jobs.md` → "Contrato do técnico"):
 * Accept / Decline while it is pending (`POST /api/saves/:id/manager-contract`).
 */
export function ManagerRenewalCard({
  saveId, renewal, onAnswered,
}: {
  saveId: string;
  renewal: Renewal | null | undefined;
  onAnswered: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<"renewed" | "declined" | null>(null);
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

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <p className="text-sm text-foreground m-0 tabular-nums">
        {t("managerContract.offerTerms", { wage: formatFee(renewal.wage), count: renewal.seasons })}
      </p>
      <p className="text-sm text-muted-foreground m-0">
        {t("managerContract.validUntil", { date: formatDay(renewal.expires, i18n.language, "year") })}
      </p>
      {error && <p className="text-sm text-destructive m-0" role="alert">{error}</p>}
      <div className="flex gap-3">
        <Button disabled={busy} onClick={() => void answer(true)}>{t("managerContract.accept")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>{t("managerContract.decline")}</Button>
      </div>
    </div>
  );
}
