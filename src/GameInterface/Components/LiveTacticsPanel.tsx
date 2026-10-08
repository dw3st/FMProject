import { useTranslation } from "react-i18next";
import {
  TACTICAL_STYLE_OPTIONS, effectiveAxes, getTacticalStyleMeta, hasAxesOverride,
  type TacticalAxes, type TacticalStyle,
} from "@/types/tacticsTypes";
import type { LiveTactics } from "@/Domain/tactics/liveTactics";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";

const AXIS_CHOICES: { key: keyof TacticalAxes; values: string[] }[] = [
  { key: "pressing_style", values: ["low_block", "mid_block", "high_press"] },
  { key: "defensive_line", values: ["deep", "normal", "high"] },
  { key: "width", values: ["narrow", "normal", "wide"] },
  { key: "build_up", values: ["direct", "balanced", "possession"] },
];

/**
 * "Tactics" tab of the live substitution panel (Etapa 35, #108): tactical style and the four axes for this
 * match only. Dumb: `MatchScreen` applies the choice to the engine and never saves it.
 */
export function LiveTacticsPanel({
  live,
  saved,
  onStyle,
  onAxis,
  onReset,
}: {
  live: LiveTactics;
  /** The saved tactics (what "back to saved" restores). */
  saved: LiveTactics;
  onStyle: (style: TacticalStyle) => void;
  onAxis: <K extends keyof TacticalAxes>(key: K, value: TacticalAxes[K]) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const axes = effectiveAxes(live.style, live.axesOverride);
  const isSaved = live.style === saved.style
    && (Object.keys(axes) as (keyof TacticalAxes)[]).every((k) => axes[k] === effectiveAxes(saved.style, saved.axesOverride)[k]);
  const styleLabel = getTacticalStyleMeta(live.style, t as never).label;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <p className="text-sm text-muted-foreground m-0">{t("match.liveTactics.hint")}</p>
      <div>
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">
          {t("tactics.tacticalStyle")}
        </p>
        <OptionChips
          aria-label={t("tactics.tacticalStyle")}
          options={TACTICAL_STYLE_OPTIONS.map((o) => ({ key: o.value, label: getTacticalStyleMeta(o.value, t as never).label }))}
          value={live.style}
          onChange={onStyle}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display font-black uppercase text-xl leading-none">{t("tactics.axes.title")}</span>
        <span className="text-sm text-primary font-semibold">
          {hasAxesOverride(live.style, live.axesOverride) ? t("tactics.axes.custom", { style: styleLabel }) : styleLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {AXIS_CHOICES.map((axis) => (
          <div key={axis.key}>
            <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">
              {t(`tactics.axes.${axis.key}` as never)}
            </p>
            <OptionChips
              aria-label={t(`tactics.axes.${axis.key}` as never)}
              options={axis.values.map((v) => ({ key: v, label: t(`tactics.axes.values.${v}` as never) }))}
              value={axes[axis.key] as string}
              onChange={(v) => onAxis(axis.key, v as never)}
            />
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("match.liveTactics.mentalityNote")}</p>
      <Button variant="secondary" flush onClick={onReset} disabled={isSaved}>
        {t("match.liveTactics.reset")}
      </Button>
    </div>
  );
}
