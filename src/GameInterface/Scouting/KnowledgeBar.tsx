import { useTranslation } from "react-i18next";

/** How well the manager knows a player (0..100): a 64px bar with the number (`scouting.md`). */
export function KnowledgeBar({ value }: { value: number | undefined }) {
  const { t } = useTranslation();
  const k = value ?? 100;
  const tone = k >= 80 ? "bg-primary" : k >= 40 ? "bg-chart-4" : "bg-destructive";
  return (
    <span className="inline-flex items-center gap-2" title={t("scouting.knowledgeTitle", { k })}>
      <span className="inline-block w-16 h-1.5 rounded bg-border overflow-hidden">
        <span className={`block h-full ${tone}`} style={{ width: `${k}%` }} />
      </span>
      <span className="text-sm tabular-nums text-muted-foreground w-7 text-right">{k}</span>
    </span>
  );
}

/** "12–20M" when the value is uncertain, else the exact label. */
export function valueText(value: string, range?: [number, number]): string {
  if (!range) return value;
  const f = (v: number) => (v >= 100 ? `${Math.round(v)}` : v.toFixed(1));
  return `${f(range[0])}–${f(range[1])}M`;
}
