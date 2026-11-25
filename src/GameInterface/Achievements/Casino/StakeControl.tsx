import { useTranslation } from "react-i18next";
import { stepStake } from "@/Domain/bets/bets";
import { CASINO } from "@/Domain/casino/casinoConfig";
import { formatFee } from "@/Domain/money";

const SMALL_BUTTON = "h-10 px-3 rounded border border-border bg-card font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground";

/** Stake with − / + and the lowest and highest stake, like the bets tab. */
export function StakeControl({ value, max, disabled, onChange }: { value: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  const can = !disabled && max >= CASINO.MIN_STAKE;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-between flex-1 min-w-0 max-w-[220px] h-10 rounded border border-border px-1 font-bold tabular-nums">
        <button type="button" aria-label={t("bets.less")} disabled={!can} onClick={() => onChange(stepStake(value, -1, max))} className="w-8 h-8 text-lg hover:text-primary disabled:opacity-40">−</button>
        <span>{formatFee(value)}</span>
        <button type="button" aria-label={t("bets.more")} disabled={!can} onClick={() => onChange(stepStake(value, 1, max))} className="w-8 h-8 text-lg hover:text-primary disabled:opacity-40">+</button>
      </div>
      {(["min", "max"] as const).map((k) => {
        const target = k === "min" ? CASINO.MIN_STAKE : max;
        return (
          <button key={k} type="button" disabled={!can || value === target} onClick={() => onChange(target)} className={SMALL_BUTTON}>
            {t(`bets.${k}`)}
          </button>
        );
      })}
    </div>
  );
}

/** The stake kept inside the limit when the wallet changes. */
export function clampStake(stake: number, max: number): number {
  return Math.max(CASINO.MIN_STAKE, Math.min(stake, Math.max(CASINO.MIN_STAKE, max)));
}

/** Money of the casino: whole euros below €1,000 (a line bet), one decimal in thousands, else the short form. */
export function casinoMoney(n: number): string {
  if (Math.abs(n) < 1_000) return `${n < 0 ? "−" : ""}€${Math.abs(Math.round(n))}`;
  if (Math.abs(n) >= 1_000_000) return formatFee(n);
  const k = Math.abs(n) / 1_000;
  return `${n < 0 ? "−" : ""}€${Number.isInteger(k) ? k : (Math.floor(k * 10) / 10).toFixed(1)}K`;
}
