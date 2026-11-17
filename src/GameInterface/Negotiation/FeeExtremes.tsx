import { useTranslation } from "react-i18next";

/** "Min" and "Max" buttons next to a fee slider: the lowest or highest fee in one click (tester report, 12.12.1). */
export function FeeExtremes({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (fee: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {(["min", "max"] as const).map((k) => {
        const target = k === "min" ? min : max;
        return (
          <button
            key={k}
            type="button"
            disabled={value === target}
            onClick={() => onChange(target)}
            className="h-10 px-3 rounded border border-border bg-card font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
          >
            {t(`common.${k}`)}
          </button>
        );
      })}
    </>
  );
}
