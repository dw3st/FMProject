import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  TACTICAL_STYLE_OPTIONS, effectiveAxes, getTacticalStyleMeta, hasAxesOverride,
  type TacticalAxes, type TacticalStyle,
} from "@/types/tacticsTypes";
import type { LiveTactics } from "@/Domain/tactics/liveTactics";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { PanelBlock, PanelColumns } from "@/GameInterface/Components/SubsPanelLayout";

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
  pitch,
}: {
  live: LiveTactics;
  /** The saved tactics (what "back to saved" restores). */
  saved: LiveTactics;
  onStyle: (style: TacticalStyle) => void;
  onAxis: <K extends keyof TacticalAxes>(key: K, value: TacticalAxes[K]) => void;
  onReset: () => void;
  /** The panel's mini pitch, on the left. */
  pitch?: ReactNode;
}) {
  const { t } = useTranslation();
  const axes = effectiveAxes(live.style, live.axesOverride);
  const isSaved = live.style === saved.style
    && (Object.keys(axes) as (keyof TacticalAxes)[]).every((k) => axes[k] === effectiveAxes(saved.style, saved.axesOverride)[k]);
  const styleLabel = getTacticalStyleMeta(live.style, t as never).label;
  return (
    <PanelColumns
      pitch={pitch}
      title={t("tactics.tacticalStyle")}
      hint={t("substitutionPanel.tacticsHint")}
      action={(
        <Button variant="secondary" className="w-full border! border-border" onClick={onReset} disabled={isSaved}>
          {t("match.liveTactics.reset")}
        </Button>
      )}
    >
      <OptionChips
        aria-label={t("tactics.tacticalStyle")}
        options={TACTICAL_STYLE_OPTIONS.map((o) => ({ key: o.value, label: getTacticalStyleMeta(o.value, t as never).label }))}
        value={live.style}
        onChange={onStyle}
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("tactics.axes.title")}</h3>
          <span className="text-sm text-primary font-semibold">
            {hasAxesOverride(live.style, live.axesOverride) ? t("tactics.axes.custom", { style: styleLabel }) : styleLabel}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
          {AXIS_CHOICES.map((axis) => (
            <PanelBlock key={axis.key} label={t(`tactics.axes.${axis.key}` as never)}>
              <OptionChips
                aria-label={t(`tactics.axes.${axis.key}` as never)}
                options={axis.values.map((v) => ({ key: v, label: t(`tactics.axes.values.${v}` as never) }))}
                value={axes[axis.key] as string}
                onChange={(v) => onAxis(axis.key, v as never)}
              />
            </PanelBlock>
          ))}
        </div>
        <p className="text-sm text-muted-foreground m-0">{t("match.liveTactics.mentalityNote")}</p>
      </div>
    </PanelColumns>
  );
}
