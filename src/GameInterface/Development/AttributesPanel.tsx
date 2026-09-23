import { useTranslation } from "react-i18next";

export type AttrDirection = "up" | "stable" | "down";
export type AttrFocus = "primary" | "secondary" | "limited";

export interface DevAttribute {
  name: string;
  value: number;
  direction: AttrDirection;
  focus: AttrFocus;
  /** 0–1: how far the DP buffer is toward the next level-up (undefined = unknown) */
  progressPct?: number;
}

interface AttributesPanelProps {
  attributes: DevAttribute[];
}

const PILL_COUNT = 10;

function AttributePillRow({
  value,
  progressPct,
}: {
  value: number;
  progressPct?: number;
}) {
  const full = Math.min(PILL_COUNT, Math.floor(value));
  const frac = value - full;
  const hasProgressOutline =
    value < PILL_COUNT &&
    (frac > 0.04 ||
      (progressPct !== undefined && progressPct > 0));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: PILL_COUNT }, (_, i) => {
        if (i < full) {
          return (
            <span
              key={i}
              className="h-2.5 w-5 sm:w-6 rounded-sm bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)] shrink-0"
              aria-hidden
            />
          );
        }
        if (i === full && hasProgressOutline) {
          return (
            <span
              key={i}
              className="h-2.5 w-5 sm:w-6 rounded-sm border-2 border-emerald-400 bg-background/60 shadow-[0_0_6px_rgba(52,211,153,0.35)] shrink-0 box-border"
              aria-hidden
            />
          );
        }
        return (
          <span
            key={i}
            className="h-2.5 w-5 sm:w-6 rounded-sm bg-muted/35 border border-border/40 shrink-0"
            aria-hidden
          />
        );
      })}
    </div>
  );
}

export function AttributesPanel({ attributes }: AttributesPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-xl p-5">
      <h3 className="text-lg font-bold font-display uppercase tracking-wider mb-4 m-0">
        {t("development.attributesTitle")}
      </h3>

      <div className="space-y-5">
        {attributes.map((attr) => {
          return (
            <div key={attr.name}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-foreground truncate text-[11px] sm:text-xs uppercase tracking-wide">
                      {attr.name}
                    </span>
                    {attr.focus === "primary" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary/50 text-primary font-bold uppercase bg-transparent shrink-0">
                        {t("development.attributesPrimary")}
                      </span>
                    )}
                    {attr.focus === "secondary" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-400/50 text-blue-400 font-bold uppercase bg-transparent shrink-0">
                        {t("development.attributesSecondary")}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5 block">
                    {t("development.developmentProgress")}:{" "}
                    {Math.round((attr.progressPct ?? 0) * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-bold font-display text-foreground tabular-nums">
                    {attr.value.toFixed(1)}
                  </span>
                </div>
              </div>

              <AttributePillRow
                value={attr.value}
                progressPct={
                  attr.value >= PILL_COUNT ? undefined : attr.progressPct
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
