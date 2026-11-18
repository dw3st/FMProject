import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { Icon } from "@/GameInterface/Icons";
import { formatEurosText } from "@/Domain/money";
import type { TerminationQuote } from "@/Domain/contracts/termination";
import type { MainRole } from "@/Domain/roles";

type Quote = TerminationQuote & { blocked: boolean; thin?: { line: MainRole; left: number; min: number } | null };

/**
 * "Terminate" on the player's page (friendly termination, tester suggestion): asks the server for the fee, confirms it,
 * then ends the contract. The player leaves as a free agent and the page goes back to the squad.
 */
export function TerminateButton({ saveId, playerId, playerName, onDone, compact = false }: {
  saveId: string;
  playerId: string;
  playerName: string;
  onDone: () => void;
  /** The icon-only button of the squad table (report 12.18: the release was hidden on the player page). */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/saves/${encodeURIComponent(saveId)}/players/${encodeURIComponent(playerId)}/terminate`;

  const open = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => ({}))) as Quote & { error?: string };
      if (!res.ok) setError(t(`contracts.terminate.errors.${body.error ?? "generic"}`, { defaultValue: t("contracts.terminate.errors.generic") }));
      else setQuote(body);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setQuote(null);
        setError(t(`contracts.terminate.errors.${body.error ?? "generic"}`, { defaultValue: t("contracts.terminate.errors.generic") }));
        return;
      }
      setQuote(null);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const body = quote
    ? quote.blocked
      ? t("contracts.terminate.blocked")
      : t(quote.capped ? "contracts.terminate.bodyCapped" : "contracts.terminate.body", {
        name: playerName,
        fee: formatEurosText(quote.fee),
        wages: formatEurosText(quote.wagesLeft),
        weeks: quote.weeksLeft,
        share: Math.round(quote.share * 100),
      }) + (quote.thin ? ` ${t(`negotiation.situation.thinAfter.${quote.thin.line}`, { count: quote.thin.left, min: quote.thin.min })}` : "")
    : "";

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void open(); }}
          disabled={busy}
          title={error ?? t("contracts.terminate.rowHint")}
          aria-label={t("contracts.terminate.button")}
          className="flex items-center justify-center w-9 h-8 border border-border rounded-lg bg-transparent text-muted-foreground transition-all cursor-pointer hover:text-destructive hover:border-destructive disabled:opacity-50"
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          title={error ?? t("contracts.terminate.hint")}
          className="flex items-center gap-2 px-4 h-10 rounded border border-border bg-transparent text-sm font-semibold text-destructive cursor-pointer shrink-0 disabled:opacity-50"
        >
          <Icon name="close" size={16} />
          {t("contracts.terminate.button")}
        </button>
      )}
      {error && !compact && <span role="alert" className="text-sm text-destructive">{error}</span>}
      <ConfirmDialog
        open={quote !== null}
        title={t("contracts.terminate.title", { name: playerName })}
        body={body}
        confirmLabel={quote?.blocked ? t("common.close") : t("contracts.terminate.confirm")}
        onConfirm={() => (quote?.blocked ? setQuote(null) : void confirm())}
        onClose={() => setQuote(null)}
        busy={busy}
      />
    </>
  );
}
