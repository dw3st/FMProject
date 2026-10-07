import { useTranslation } from "react-i18next";
import { attrDisplay } from "@/Domain/attributes";
import { attributeBarClass, attributeTextClass } from "@/GameInterface/scoreColors";

type AttrDirection = "up" | "stable" | "down";
export type AttrFocus = "primary" | "secondary" | "limited";

export interface DevAttribute {
  name: string;
  value: number;
  direction: AttrDirection;
  focus: AttrFocus;
  /** 0–1: how far the DP buffer is toward the next 0.1 step, i.e. the next display point (undefined = unknown) */
  progressPct?: number;
}

interface AttributesPanelProps {
  attributes: DevAttribute[];
}

/** Bar of an attribute on the 0..100 display scale, coloured by band. */
function AttributeBar({ display }: { display: number }) {
  return (
    <div className="h-2 w-full rounded bg-border overflow-hidden" aria-hidden>
      <div
        className={`h-full rounded ${attributeBarClass(display)}`}
        style={{ width: `${Math.max(0, Math.min(100, display))}%` }}
      />
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
          const display = attrDisplay(attr.value);
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
                    {Math.round(Math.min(1, attr.progressPct ?? 0) * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-lg font-bold font-display tabular-nums ${attributeTextClass(display)}`}>
                    {display}
                  </span>
                </div>
              </div>

              <AttributeBar display={display} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
