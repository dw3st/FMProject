import { stepWage } from "@/Domain/contracts/contracts";
import { StepButton } from "@/GameInterface/ui/StepButton";
import { useEffect, useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { formatFee as formatWage, formatWageFull } from "@/Domain/money";

/** What the demand route answers: the wage, plus (own player) the morale behind it (`morale.md`). */
export interface ContractDemandInfo {
  demand: number;
  /** What it costs to pay his release clause (a player of an AI club). */
  clause?: number;
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
  /** Signing only: poor facilities of our club (`facilities.md`), a multiplier. */
  facilities?: number;
  /** A very ambitious player refuses a club whose training ground is below 25%. */
  refusesPoorFacilities?: boolean;
  /** The manager's Negotiation attribute (`achievements.md`), a multiplier; absent = neutral. */
  negotiation?: number;
  /** Renewal: his wage today, to compare with the asking wage. */
  currentWage?: number;
  /** Renewal: renewed recently, again only from this date. */
  renewableOn?: string;
  /** A fee-free arrival (pre-contract, free agent; 4.47.9): the signing bonus he asks, EUR, and the clubs also after him. */
  bonusAsk?: number;
  rivals?: string[];
}

/** The personality lines explaining a demand ("Loyal to the club: −7%"). */
function PersonalityDemandLines({ info }: { info: ContractDemandInfo | null | undefined }) {
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
  const fac = pct(info.facilities);
  if (fac !== 0) lines.push({ key: "fac", text: t("personality.demand.facilities", { pct: sign(fac) }) });
  const neg = pct(info.negotiation);
  if (neg !== 0) lines.push({ key: "neg", text: t("achievements.contractLine", { value: sign(neg) }) });
  if (lines.length === 0 && !info.refusesSmallerClub && !info.refusesPoorFacilities) return null;
  return (
    <ul className="m-0 p-0 list-none space-y-1">
      {lines.map((l) => <li key={l.key} className="text-sm text-muted-foreground tabular-nums">{l.text}</li>)}
      {info.refusesSmallerClub && <li className="text-sm text-destructive">{t("contracts.refusal.smallerClub")}</li>}
      {info.refusesPoorFacilities && <li className="text-sm text-destructive">{t("contracts.refusal.poorFacilities")}</li>}
    </ul>
  );
}

/** Demand plus morale info (`GET .../players/:id/demand`). `from` = his squad id; omit for a free agent. */
export function useContractDemandInfo(saveId: string | undefined, playerId: string | null, from?: string, pre = false): ContractDemandInfo | null {
  const [info, setInfo] = useState<ContractDemandInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!saveId || !playerId) return;
    const controller = new AbortController();
    const qs = from ? `?from=${encodeURIComponent(from)}${pre ? "&pre=1" : ""}` : "";
    fetch(`/api/saves/${saveId}/players/${encodeURIComponent(playerId)}/demand${qs}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as ContractDemandInfo) : null))
      .then((d) => { if (!controller.signal.aborted) setInfo(d); })
      .catch(() => { /* leave null */ });
    return () => controller.abort();
  }, [saveId, playerId, from, pre]);
  return info;
}

/** A signing-bonus step: €0,1M below €10M, €1M from there (the fee grid). */
function stepBonus(v: number, dir: 1 | -1): number {
  const step = v + (dir < 0 ? -1 : 0) < 10_000_000 ? 100_000 : 1_000_000;
  return Math.max(0, Math.round((v + dir * step) / step) * step);
}

/**
 * Signing bonus (luvas) of a fee-free arrival (4.47.9): what he asks, the amount offered (paid when he joins) and the
 * AI clubs also after him. Nothing without an ask.
 */
export function SigningBonusField({ ask, rivals, bonus, onBonus, paidOn }: {
  ask: number | undefined; rivals: string[] | undefined; bonus: number; onBonus: (v: number) => void;
  /** "arrival" (pre-contract) or "now" (free agent). */
  paidOn: "arrival" | "now";
}) {
  const { t } = useTranslation();
  const id = useId();
  if (ask === undefined) return null;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] font-display">
        {t("contracts.bonus.label")}
      </label>
      <p className="text-sm text-muted-foreground m-0 tabular-nums">
        {t("contracts.bonus.asks", { amount: formatWage(ask) })} · {t(paidOn === "arrival" ? "contracts.bonus.paidOnArrival" : "contracts.bonus.paidNow")}
      </p>
      <div className="flex items-center gap-2">
        <StepButton dir={-1} label={t("contracts.bonus.down")} disabled={bonus <= 0} onClick={() => onBonus(stepBonus(bonus, -1))} />
        <input
          id={id}
          inputMode="numeric"
          value={bonus}
          onChange={(e) => onBonus(Number(e.target.value.replace(/\D/g, "")))}
          className="flex-1 min-w-0 h-10 px-3 rounded border border-border bg-muted/20 text-foreground text-sm font-semibold tabular-nums focus:outline-none focus:border-primary"
        />
        <StepButton dir={1} label={t("contracts.bonus.up")} onClick={() => onBonus(stepBonus(bonus, 1))} />
        <span className="text-sm font-semibold tabular-nums w-20 text-right">{formatWage(bonus)}</span>
      </div>
      {rivals && rivals.length > 0 && (
        <p className="text-sm text-chart-4 m-0">{t("contracts.bonus.rivals", { clubs: rivals.join(", "), count: rivals.length })}</p>
      )}
    </div>
  );
}

/** Translated reason for a refused contract offer (`error` from the API). */
export function useRefusalText() {
  const { t } = useTranslation();
  return (error: string): string => {
    const known = ["lowWage", "lowBonus", "tooManyYears", "invalidYears", "squadFull", "unhappy", "smallerClub", "poorFacilities", "recentlyRenewed", "noMoney"];
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
  /** Longest length the player accepts (`maxOfferYears`); absent = 5. */
  maxYears?: number;
  /** The asking wage is already on screen: no line above the fields, only the refusal limit under them. */
  askingShown?: boolean;
  /** Weekly wage bill of the club today: shows it before and after this contract. */
  wageBill?: number;
}

/** Wage + length inputs shared by the renew, offer and free-agent signing modals. */
export function ContractTermsFields({ wage, years, onWage, onYears, demand, info, maxYears = 5, askingShown, wageBill }: Props) {
  const { t } = useTranslation();
  const wageId = useId();
  const shownWage = Number.isFinite(wage) ? wage : 0;
  return (
    <div className="space-y-3">
      {!askingShown && (
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {demand === null ? t("contracts.loadingDemand") : t("contracts.askingLine", { wage: formatWageFull(demand) })}
        </p>
      )}
      {demand !== null && info?.currentWage !== undefined && info.currentWage > 0 && (
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {t("contracts.currentWage", { wage: formatWageFull(info.currentWage) })}
          {" · "}
          <span className={demand > info.currentWage ? "text-chart-4" : "text-primary"}>
            {t("contracts.wageChange", { pct: `${demand >= info.currentWage ? "+" : "−"}${Math.abs(Math.round((demand / info.currentWage - 1) * 100))}` })}
          </span>
        </p>
      )}
      <PersonalityDemandLines info={info} />
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <label htmlFor={wageId} className="block mb-1 text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] font-display">
            {t("contracts.weeklyWage")}
          </label>
          <div className="flex items-center gap-2">
            <StepButton dir={-1} label={t("contracts.wageDown")} disabled={shownWage <= 0} onClick={() => onWage(stepWage(shownWage, -1))} />
            <input
              id={wageId}
              inputMode="numeric"
              value={shownWage}
              onChange={(e) => onWage(Number(e.target.value.replace(/\D/g, "")))}
              className="flex-1 min-w-0 h-10 px-3 rounded border border-border bg-muted/20 text-foreground text-sm font-semibold tabular-nums focus:outline-none focus:border-primary"
            />
            <StepButton dir={1} label={t("contracts.wageUp")} onClick={() => onWage(stepWage(shownWage, 1))} />
          </div>
        </div>
        <label className="w-24 text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] font-display">
          {t("contracts.years")}
          <select
            value={years}
            onChange={(e) => onYears(Number(e.target.value))}
            className="mt-1 w-full h-10 px-3 rounded border border-border bg-muted/20 text-foreground text-sm font-semibold"
          >
            {[1, 2, 3, 4, 5].filter((y) => y <= maxYears).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      {((askingShown && demand !== null) || wageBill !== undefined) && (
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {askingShown && demand !== null ? t("contracts.belowRefuses", { wage: formatWageFull(demand) }) : ""}
          {askingShown && demand !== null && wageBill !== undefined ? " " : ""}
          {wageBill !== undefined ? t("contracts.billLine", { before: formatWage(wageBill), after: formatWage(wageBill + shownWage) }) : ""}
        </p>
      )}
    </div>
  );
}
