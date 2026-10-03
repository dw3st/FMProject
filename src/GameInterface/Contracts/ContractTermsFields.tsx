import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Weekly wage the player asks of the human club (`GET .../players/:id/demand`). `from` = his squad id; omit for a free agent. */
export function useContractDemand(saveId: string | undefined, playerId: string | null, from?: string): number | null {
  const [demand, setDemand] = useState<number | null>(null);
  useEffect(() => {
    setDemand(null);
    if (!saveId || !playerId) return;
    const controller = new AbortController();
    const qs = from ? `?from=${encodeURIComponent(from)}` : "";
    fetch(`/api/saves/${saveId}/players/${encodeURIComponent(playerId)}/demand${qs}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as { demand: number }).demand : null))
      .then((d) => { if (!controller.signal.aborted) setDemand(d); })
      .catch(() => { /* leave null */ });
    return () => controller.abort();
  }, [saveId, playerId, from]);
  return demand;
}

export function formatWage(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

/** Translated reason for a refused contract offer (`error` from the API). */
export function useRefusalText() {
  const { t } = useTranslation();
  return (error: string): string => {
    const known = ["lowWage", "tooManyYears", "invalidYears", "squadFull"];
    return known.includes(error) ? t(`contracts.refusal.${error}`) : error;
  };
}

interface Props {
  wage: number;
  years: number;
  onWage: (w: number) => void;
  onYears: (y: number) => void;
  demand: number | null;
}

/** Wage + length inputs shared by the renew, offer and free-agent signing modals. */
export function ContractTermsFields({ wage, years, onWage, onYears, demand }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground m-0">
        {demand === null
          ? t("contracts.loadingDemand")
          : <>{t("contracts.asking")}: <span className="text-primary font-semibold tabular-nums">{formatWage(demand)}</span> {t("contracts.perWeek")}</>}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex-1 text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] font-display">
          {t("contracts.weeklyWage")}
          <input
            type="number"
            min={0}
            step={500}
            value={Number.isFinite(wage) ? wage : 0}
            onChange={(e) => onWage(Number(e.target.value))}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/20 text-foreground text-sm font-semibold"
          />
        </label>
        <label className="w-24 text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] font-display">
          {t("contracts.years")}
          <select
            value={years}
            onChange={(e) => onYears(Number(e.target.value))}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/20 text-foreground text-sm font-semibold"
          >
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
