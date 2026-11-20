import { useTranslation } from "react-i18next";
import {
  INSTRUCTION_LEVELS, OUT_OF_POSSESSION_KEYS, PLAY_FOCUS, TRANSITION_KEYS,
  differsFromTemplate, instructionsOffTemplate, resolveInstructions,
  type InstructionGroup, type InstructionKey,
} from "@/Domain/tactics/teamInstructions";
import {
  getTacticalStyleMeta, type InstructionLevel, type PlayFocus, type TacticalAxes, type TacticalStyle, type TeamInstructions,
} from "@/types/tacticsTypes";
import { OptionChips } from "@/GameInterface/ui/OptionChips";

/** What the panel edits: the instructions on top of the style's template and the saved mentality. */
export interface InstructionsValue {
  teamInstructions?: TeamInstructions;
  mentality?: InstructionLevel;
}

const GROUP_KEYS: Record<InstructionGroup, readonly (InstructionKey | "focus")[]> = {
  inPossession: [
    "passing", "tempo", "width", "passTarget", "focus", "flanks", "crossing", "dribbling", "shooting", "freedom", "gkDistribution",
  ],
  transition: TRANSITION_KEYS,
  outOfPossession: OUT_OF_POSSESSION_KEYS,
};


/** The five labels of a scale (`tactics.instr.keys.<key>`, most negative first). */
export function useLevelLabels() {
  const { t } = useTranslation();
  return (key: string): string[] => {
    const v = t(`tactics.instr.keys.${key}` as never, { returnObjects: true }) as unknown;
    return Array.isArray(v) ? (v as string[]) : INSTRUCTION_LEVELS.map(String);
  };
}

/**
 * "Instruções da equipe" (stage 20, the 4c proposal): the saved mentality and the team instructions in three groups,
 * five levels each, on top of the style's template. Dumb: the parent saves (`PUT /tactics`) or, in the live match,
 * applies to the engine only.
 */
export function TeamInstructionsPanel({
  style, axesOverride, value, onChange, onReset, disabled, compact,
}: {
  style: TacticalStyle;
  /** The old axes edits (a save from before the instructions): shown as levels until an instruction is changed. */
  axesOverride?: Partial<TacticalAxes>;
  value: InstructionsValue;
  onChange: (next: InstructionsValue) => void;
  onReset: () => void;
  disabled?: boolean;
  /** The live match's panel: one column per group, no hints. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const labels = useLevelLabels();
  const resolved = resolveInstructions(style, axesOverride, value.teamInstructions, value.mentality);
  const changed = differsFromTemplate(resolved) || (value.mentality ?? 0) !== 0;
  const styleLabel = getTacticalStyleMeta(style, t as never).label;

  function setLevel(key: InstructionKey, level: InstructionLevel) {
    const levels = { ...resolved.levels, [key]: level };
    onChange({ ...value, teamInstructions: instructionsOffTemplate(style, levels, resolved.focus) });
  }
  function setFocus(focus: PlayFocus) {
    onChange({ ...value, teamInstructions: instructionsOffTemplate(style, resolved.levels, focus) });
  }

  const levelOptions = (key: string) => {
    const l = labels(key);
    return INSTRUCTION_LEVELS.map((lv, i) => ({ key: String(lv), label: l[i] ?? String(lv) }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("tactics.instr.title")}</h3>
          {!compact && <p className="text-sm text-muted-foreground m-0 mt-1">{t("tactics.instr.hint")}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-primary font-semibold">
            {changed ? t("tactics.instr.custom", { style: styleLabel }) : t("tactics.instr.template", { style: styleLabel })}
          </span>
          {changed && (
            <button
              type="button"
              onClick={onReset}
              disabled={disabled}
              className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-0 disabled:opacity-50"
            >
              {t("tactics.instr.reset")}
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">
          {t("tactics.instr.mentality")}
        </p>
        <OptionChips
          aria-label={t("tactics.instr.mentality")}
          options={levelOptions("mentality")}
          value={String(value.mentality ?? 0)}
          onChange={(k) => onChange({ ...value, mentality: Number(k) as InstructionLevel })}
          disabled={disabled}
        />
      </div>

      <div className={compact ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : "grid grid-cols-1 xl:grid-cols-3 gap-4"}>
        {(Object.keys(GROUP_KEYS) as InstructionGroup[]).map((group) => (
          <section key={group} className="rounded-md border border-border p-4 flex flex-col gap-3" aria-label={t(`tactics.instr.groups.${group}` as never)}>
            <div>
              <h4 className="font-display font-black uppercase text-base leading-none m-0">{t(`tactics.instr.groups.${group}` as never)}</h4>
              {!compact && <p className="text-sm text-muted-foreground m-0 mt-1">{t(`tactics.instr.groupHints.${group}` as never)}</p>}
            </div>
            {GROUP_KEYS[group].map((key) => (
              <div key={key}>
                <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-1.5">
                  {t(`tactics.instr.labels.${key}` as never)}
                </p>
                {key === "focus" ? (
                  <OptionChips
                    aria-label={t("tactics.instr.labels.focus")}
                    options={PLAY_FOCUS.map((f) => ({ key: f, label: t(`tactics.instr.focus.${f}` as never) }))}
                    value={resolved.focus}
                    onChange={(f) => setFocus(f)}
                    disabled={disabled}
                  />
                ) : (
                  <OptionChips
                    aria-label={t(`tactics.instr.labels.${key}` as never)}
                    options={levelOptions(key)}
                    value={String(resolved.levels[key])}
                    onChange={(k) => setLevel(key, Number(k) as InstructionLevel)}
                    disabled={disabled}
                  />
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
