import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatWageFull } from "@/Domain/money";

/** What the demand route answers: the wage, plus (own player) the morale behind it (`morale.md`). */
export interface ContractDemandInfo {
  demand: number;
  moraleBand?: "very_happy" | "content" | "neutral" | "unhappy" | "furious";
  moraleDemandMult?: number;
  refuses?: boolean;
  /** Personality parts of the demand (`personality.md`), each a multiplier (1 = no effect). */
  ambition?: number;
  loyalty?: number;
  compatriot?: number;
  smallerClub?: number;
  /** A very ambitious player refuses a club two tiers smaller than his. */
  refusesSmallerClub?: boolean;
}

/** The personality lines explaining a demand ("Loyal to the club: −7%"). */
export function PersonalityDemandLines({ info }: { info: ContractDemandInfo | null | undefined }) {
  const { t } = useTranslation();
  if (!info) return null;
  const pct = (m: number | undefined) => Math.round(((m ?? 1) - 1) * 100);
  const sign = (n: number) => (n > 0 ? `+${n}%` : `−${Math.abs(n)}%`);
  const lines: { key: string; text: string }[] = [];
  const amb = pct(info.ambition);
  if (amb !== 0) lines.push({ key: "amb", text: t(amb > 0 ? "personality.demand.ambitious" : "personality.demand.settled", { pct: sign(amb) }) });
  const loy = pct(info.loyalty);
  if (loy !== 0) lines.push({ key: "loy", text: t("personality.demand.loyal", { pct: sign(loy) }) });
  const com = pct(info.compatriot);
  if (com !== 0) lines.push({ key: "com", text: t("personality.demand.compatriot", { pct: sign(com) }) });
  const sm = pct(info.smallerClub);
  if (sm !== 0) lines.push({ key: "sm", text: t("personality.demand.smallerClub", { pct: sign(sm) }) });
  if (lines.length === 0 && !info.refusesSmallerClub) return null;
  return (
    <ul className="m-0 p-0 list-none space-y-1">
      {lines.map((l) => <li key={l.key} className="text-sm text-muted-foreground tabular-nums">{l.text}</li>)}
      {info.refusesSmallerClub && <li className="text-sm text-destructive">{t("contracts.refusal.smallerClub")}</li>}
    </ul>
  );
}

/** Demand plus morale info (`GET .../players/:id/demand`). `from` = his squad id; omit for a free agent. */
export function useContractDemandInfo(saveId: string | undefined, playerId: string | null, from?: string): ContractDemandInfo | null {
  const [info, setInfo] = useState<ContractDemandInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!saveId || !playerId) return;
    const controller = new AbortController();
    const qs = from ? `?from=${encodeURIComponent(from)}` : "";
    fetch(`/api/saves/${saveId}/players/${encodeURIComponent(playerId)}/demand${qs}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as ContractDemandInfo) : null))
      .then((d) => { if (!controller.signal.aborted) setInfo(d); })
      .catch(() => { /* leave null */ });
    return () => controller.abort();
  }, [saveId, playerId, from]);
  return info;
}

/** Weekly wage the player asks of the human club (`GET .../players/:id/demand`). `from` = his squad id; omit for a free agent. */
export function useContractDemand(saveId: string | undefined, playerId: string | null, from?: string): number | null {
  return useContractDemandInfo(saveId, playerId, from)?.demand ?? null;
}

/** Translated reason for a refused contract offer (`error` from the API). */
export function useRefusalText() {
  const { t } = useTranslation();
  return (error: string): string => {
    const known = ["lowWage", "tooManyYears", "invalidYears", "squadFull", "unhappy", "smallerClub"];
    return known.includes(error) ? t(`contracts.refusal.${error}`) : error;
  };
}

interface Props {
  wage: number;
  years: number;
  onWage: (w: number) => void;
  onYears: (y: number) => void;
  demand: number | null;
  /** Demand info: shows the personality lines under the asking wage. */
  info?: ContractDemandInfo | null;
}

/** Wage + length inputs shared by the renew, offer and free-agent signing modals. */
export function ContractTermsFields({ wage, years, onWage, onYears, demand, info }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground m-0">
        {demand === null
          ? t("contracts.loadingDemand")
          : <>{t("contracts.asking")}: <span className="text-primary font-semibold tabular-nums">{formatWageFull(demand)}</span> {t("contracts.perWeek")}</>}
      </p>
      <PersonalityDemandLines info={info} />
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
