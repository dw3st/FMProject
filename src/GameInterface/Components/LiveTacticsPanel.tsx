import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  TACTICAL_STYLE_OPTIONS, getTacticalStyleMeta,
  type InstructionLevel, type TacticalAxes, type TacticalStyle, type TeamInstructions,
} from "@/types/tacticsTypes";
import { resolveInstructions } from "@/Domain/tactics/teamInstructions";
import { TeamInstructionsPanel } from "@/GameInterface/Tactics/TeamInstructionsPanel";
import type { LiveTactics } from "@/Domain/tactics/liveTactics";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { PanelColumns } from "@/GameInterface/Components/SubsPanelLayout";

/**
 * "Tactics" tab of the live substitution panel (Etapa 35, #108): tactical style and, since stage 20, the team
 * instructions and mentality level for this match only. Dumb: `MatchScreen` applies the choice to the engine and never saves it.
 */
export function LiveTacticsPanel({
  live,
  saved,
  onStyle,
  onInstructions,
  onReset,
  pitch,
}: {
  live: LiveTactics;
  /** The saved tactics (what "back to saved" restores). */
  saved: LiveTactics;
  onStyle: (style: TacticalStyle) => void;
  /** Old per-axis edit (kept for callers; the instructions panel replaces it). */
  onAxis?: <K extends keyof TacticalAxes>(key: K, value: TacticalAxes[K]) => void;
  /** Team instructions and mentality level for this match (stage 20). */
  onInstructions: (next: { teamInstructions?: TeamInstructions; mentality?: number }) => void;
  onReset: () => void;
  /** The panel's mini pitch, on the left. */
  pitch?: ReactNode;
}) {
  const { t } = useTranslation();
  const now = resolveInstructions(live.style, live.axesOverride, live.instructions, live.mentalityLevel);
  const was = resolveInstructions(saved.style, saved.axesOverride, saved.instructions, saved.mentalityLevel);
  const isSaved = live.style === saved.style && now.focus === was.focus && now.mentality === was.mentality
    && (Object.keys(now.levels) as (keyof typeof now.levels)[]).every((k) => now.levels[k] === was.levels[k]);
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
      <TeamInstructionsPanel
        compact
        style={live.style}
        axesOverride={live.axesOverride}
        value={{ teamInstructions: live.instructions, mentality: live.mentalityLevel as InstructionLevel | undefined }}
        onChange={onInstructions}
        onReset={() => onInstructions({ ...(live.mentalityLevel ? { mentality: live.mentalityLevel } : {}) })}
      />
      <p className="text-sm text-muted-foreground m-0">{t("match.liveTactics.mentalityNote")}</p>
    </PanelColumns>
  );
}
