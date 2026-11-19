import { useTranslation } from "react-i18next";
import { attrDisplay } from "@/Domain/attributes";
import { attributeBarClass, attributeTextClass } from "@/GameInterface/scoreColors";

type AttrDirection = "up" | "stable" | "down";
export type AttrFocus = "primary" | "secondary" | "limited";

export interface DevAttribute {
  name: string;
  value: number;
  direction: AttrDirection;
  /** Weight of the attribute in the player's position (`limited` = it counts little or nothing). */
  focus: AttrFocus;
  /** 0–1: how far the DP buffer is toward the next 0.1 step, i.e. the next display point (undefined = unknown) */
  progressPct?: number;
}

interface AttributesPanelProps {
  attributes: DevAttribute[];
  /** OVR on the 0..10 scale. */
  ovr: number;
  /** Potential band on the 0..10 scale; null past the age of big growth (`potentialBand`). */
  potential: [number, number] | null;
  /** In the age decline the buffer reads as the margin before losing a point. */
  declining: boolean;
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

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

export function AttributesPanel({ attributes, ovr, potential, declining }: AttributesPanelProps) {
  const { t } = useTranslation();
  const k = "developmentScreen.attributes";
  return (
    <div className="card-arcade rounded-md p-5">
      <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-4">{t(`${k}.title`)}</h3>

      <div className="flex flex-wrap items-end gap-6 mb-5">
        <div>
          <p className={`${LABEL} m-0`}>{t(`${k}.ovr`)}</p>
          <p className={`font-display font-bold tabular-nums text-3xl leading-none m-0 mt-1 ${attributeTextClass(attrDisplay(ovr))}`}>
            {attrDisplay(ovr)}
          </p>
        </div>
        <div>
          <p className={`${LABEL} m-0`}>{t(`${k}.potential`)}</p>
          {potential ? (
            <>
              <p className="font-display font-bold tabular-nums text-3xl leading-none m-0 mt-1 text-foreground">
                {attrDisplay(potential[0])}–{attrDisplay(potential[1])}
              </p>
              <p className="text-sm text-muted-foreground m-0 mt-1">{t(`${k}.potentialHint`)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground m-0 mt-1">{t(`${k}.potentialDone`)}</p>
          )}
        </div>
      </div>

      <AttributeRows attributes={attributes} declining={declining} />
    </div>
  );
}

/** The attribute rows (name, focus badge, progress, value, bar), two columns. */
function AttributeRows({ attributes, declining }: { attributes: DevAttribute[]; declining: boolean }) {
  const { t } = useTranslation();
  const k = "developmentScreen.attributes";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 phone:grid-cols-2 gap-x-6 gap-y-4">
      {attributes.map((attr) => {
        const display = attrDisplay(attr.value);
        const pct = Math.round(Math.min(1, attr.progressPct ?? 0) * 100);
        return (
          <div key={attr.name}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`truncate ${attr.focus === "limited" ? "text-muted-foreground" : "text-foreground"} font-bold text-[13px] uppercase tracking-[0.08em] font-display`}>
                    {attr.name}
                  </span>
                  {attr.focus === "primary" && (
                    <span className="text-sm px-2 py-0.5 rounded border border-primary/50 text-primary font-bold shrink-0">
                      {t("development.attributesPrimary")}
                    </span>
                  )}
                  {attr.focus === "secondary" && (
                    <span className="text-sm px-2 py-0.5 rounded border border-chart-3/50 text-chart-3 font-bold shrink-0">
                      {t("development.attributesSecondary")}
                    </span>
                  )}
                </div>
                {attr.progressPct !== undefined && (
                  <span className="text-sm text-muted-foreground tabular-nums block">
                    {t(declining ? `${k}.toDrop` : `${k}.toNext`, { pct })}
                  </span>
                )}
              </div>
              <span className={`text-lg font-bold font-display tabular-nums shrink-0 ${attributeTextClass(display)}`}>
                {display}
              </span>
            </div>
            <AttributeBar display={display} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The mental attributes (`.claude/rules/game/mental.md`) in their own block, same rows as the others. Shown only
 * with `SHOW_MENTAL`, until the match engine reads them.
 */
export function MentalAttributesPanel({ attributes, declining }: { attributes: DevAttribute[]; declining: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-md p-5">
      <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-4">{t("developmentScreen.attributes.mentalTitle")}</h3>
      <AttributeRows attributes={attributes} declining={declining} />
    </div>
  );
}
