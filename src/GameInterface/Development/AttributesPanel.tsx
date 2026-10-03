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
              className="h-2.5 w-5 sm:w-6 rounded-sm bg-chart-2 shrink-0"
              aria-hidden
            />
          );
        }
        if (i === full && hasProgressOutline) {
          return (
            <span
              key={i}
              className="h-2.5 w-5 sm:w-6 rounded-sm border-2 border-chart-2 bg-background/60 shrink-0 box-border"
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
    <div className="card-arcade rounded-md p-5">
      <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-4">
        {t("development.attributesTitle")}
      </h3>

      <div className="space-y-5">
        {attributes.map((attr) => {
          return (
            <div key={attr.name}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-foreground truncate text-[13px] uppercase tracking-[0.08em] font-display">
                      {attr.name}
                    </span>
                    {attr.focus === "primary" && (
                      <span className="text-sm px-2.5 py-0.5 rounded border border-primary/50 text-primary font-bold bg-transparent shrink-0">
                        {t("development.attributesPrimary")}
                      </span>
                    )}
                    {attr.focus === "secondary" && (
                      <span className="text-sm px-2.5 py-0.5 rounded border border-chart-3/50 text-chart-3 font-bold bg-transparent shrink-0">
                        {t("development.attributesSecondary")}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums mt-0.5 block">
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
