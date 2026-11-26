import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";

const KNOWN_ERRORS = ["windowClosed", "seatLoan", "notLoanedIn", "lobby"];

/**
 * Sends a player on loan at the manager's club back to his own club (12.39): the loan ends today. Full button on the
 * player page, a small blue icon on the squad row (user request, 12.44.2).
 */
export function ReturnLoanButton({ saveId, playerId, playerName, fromClubName, onReturned, compact = false }: {
  saveId: string;
  playerId: string;
  playerName: string;
  fromClubName: string;
  onReturned: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendBack = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/saves/${encodeURIComponent(saveId)}/loans/${encodeURIComponent(playerId)}/return`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setAsking(false);
      if (!res.ok) {
        setError(t(`loanedIn.returnErrors.${KNOWN_ERRORS.includes(body.error ?? "") ? body.error : "generic"}`));
        return;
      }
      onReturned();
    } finally {
      setBusy(false);
    }
  };
  const label = t("loanedIn.returnButton", { club: fromClubName });
  const ask = () => { setError(null); setAsking(true); };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ask(); }}
          disabled={busy}
          title={error ?? label}
          aria-label={label}
          className="flex items-center justify-center w-9 h-8 border rounded-lg transition-all cursor-pointer bg-primary/20 text-primary border-primary/40 hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={ask} disabled={busy}>
            <Icon name="arrow-left" size={16} />
            {label}
          </Button>
          {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
        </div>
      )}
      <ConfirmDialog
        open={asking}
        title={t("loanedIn.returnTitle", { name: playerName })}
        body={t("loanedIn.returnBody", { name: playerName, club: fromClubName })}
        confirmLabel={t("loanedIn.returnConfirm")}
        onConfirm={() => void sendBack()}
        onClose={() => setAsking(false)}
        busy={busy}
      />
    </>
  );
}
