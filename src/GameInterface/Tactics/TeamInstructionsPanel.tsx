import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  INSTRUCTION_LEVELS, OUT_OF_POSSESSION_KEYS, PLAY_FOCUS, TRANSITION_KEYS,
  instructionsOffTemplate, resolveInstructions, styleTemplate,
  type InstructionGroup, type InstructionKey,
} from "@/Domain/tactics/teamInstructions";
import {
  getTacticalStyleMeta, type InstructionLevel, type PlayFocus, type TacticalAxes, type TacticalStyle, type TeamInstructions,
} from "@/types/tacticsTypes";

/** What the panel edits: the instructions on top of the style's template and the saved mentality. */
export interface InstructionsValue {
  teamInstructions?: TeamInstructions;
  mentality?: InstructionLevel;
}

type RowKey = InstructionKey | "focus" | "mentality";

const GROUP_KEYS: Record<InstructionGroup, readonly (InstructionKey | "focus")[]> = {
  inPossession: [
    "passing", "tempo", "width", "passTarget", "focus", "flanks", "crossing", "dribbling", "shooting", "freedom", "gkDistribution",
  ],
  transition: TRANSITION_KEYS,
  outOfPossession: OUT_OF_POSSESSION_KEYS,
};

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";

/** The five labels of a scale (`tactics.instr.keys.<key>`, most negative first). */
export function useLevelLabels() {
  const { t } = useTranslation();
  return (key: string): string[] => {
    const v = t(`tactics.instr.keys.${key}` as never, { returnObjects: true }) as unknown;
    return Array.isArray(v) ? (v as string[]) : INSTRUCTION_LEVELS.map(String);
  };
}

/** One row of the list: the five steps, the template's step marked under the bar. */
function StepBar({ index, templateIndex, off }: { index: number; templateIndex: number; off: boolean }) {
  return (
    <span className="flex flex-col gap-1 w-[92px] shrink-0" aria-hidden>
      <span className="flex gap-[3px]">
        {INSTRUCTION_LEVELS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${i === index ? (off ? "bg-chart-4" : "bg-primary") : "bg-border"}`}
          />
        ))}
      </span>
      <span className="flex gap-[3px]">
        {INSTRUCTION_LEVELS.map((_, i) => (
          <span key={i} className="flex-1 flex justify-center">
            {i === templateIndex && (
              <svg width="8" height="5" viewBox="0 0 8 5" className="fill-muted-foreground"><polygon points="4,0 8,5 0,5" /></svg>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * "Instruções da equipe" (stage 20; list and detail since 12.38, report 969f979d): every instruction in one compact
 * list (its five steps, the template's step marked, what differs from the template in amber); picking one opens its
 * five levels on the side, each with a line on what it does. Dumb: the parent saves (`PUT /tactics`) or, in the live
 * match, applies to the engine only.
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
  /** The live match's panel: no hint line. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const labels = useLevelLabels();
  const [picked, setPicked] = useState<RowKey>("mentality");
  const resolved = resolveInstructions(style, axesOverride, value.teamInstructions, value.mentality);
  const templateFocus = styleTemplate(style).focus;
  const styleLabel = getTacticalStyleMeta(style, t as never).label;

  const indexOf = (key: RowKey): number =>
    key === "focus" ? PLAY_FOCUS.indexOf(resolved.focus)
      : key === "mentality" ? resolved.mentality + 2
      : resolved.levels[key] + 2;
  const templateIndexOf = (key: RowKey): number =>
    key === "focus" ? PLAY_FOCUS.indexOf(templateFocus) : key === "mentality" ? 2 : resolved.template[key] + 2;
  const optionLabels = (key: RowKey): string[] =>
    key === "focus" ? PLAY_FOCUS.map((f) => t(`tactics.instr.focus.${f}` as never)) : labels(key);
  const optionDescs = (key: RowKey): string[] =>
    key === "focus"
      ? PLAY_FOCUS.map((f) => t(`tactics.instr.focusDesc.${f}` as never))
      : ((t(`tactics.instr.desc.${key}` as never, { returnObjects: true }) as unknown) as string[]) ?? [];
  const isOff = (key: RowKey) => indexOf(key) !== templateIndexOf(key);

  const allRows: RowKey[] = ["mentality", ...Object.values(GROUP_KEYS).flat()];
  const changes = allRows.filter(isOff).length;

  function pick(key: RowKey, i: number) {
    if (key === "mentality") { onChange({ ...value, mentality: (i - 2) as InstructionLevel }); return; }
    if (key === "focus") {
      onChange({ ...value, teamInstructions: instructionsOffTemplate(style, resolved.levels, PLAY_FOCUS[i]! as PlayFocus) });
      return;
    }
    const levels = { ...resolved.levels, [key]: (i - 2) as InstructionLevel };
    onChange({ ...value, teamInstructions: instructionsOffTemplate(style, levels, resolved.focus) });
  }

  const row = (key: RowKey) => {
    const off = isOff(key);
    const selected = picked === key;
    const text = optionLabels(key)[indexOf(key)] ?? "";
    return (
      <li key={key}>
        <button
          type="button"
          onClick={() => setPicked(key)}
          aria-pressed={selected}
          className={`w-full min-h-9 flex items-center gap-3 px-3 py-1.5 text-left cursor-pointer border-0 border-l-2 transition-colors ${
            selected ? "bg-primary/10 border-primary" : "bg-transparent border-transparent hover:bg-secondary/30"
          }`}
        >
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">{t(`tactics.instr.labels.${key}` as never)}</span>
          <StepBar index={indexOf(key)} templateIndex={templateIndexOf(key)} off={off} />
          <span className={`w-[120px] shrink-0 truncate text-sm text-right ${off ? "text-chart-4 font-semibold" : "text-muted-foreground"}`}>
            {text}
          </span>
        </button>
      </li>
    );
  };

  const groups: { id: string; title: string; keys: readonly RowKey[] }[] = [
    { id: "mentality", title: t("tactics.instr.mentality"), keys: ["mentality"] },
    ...(Object.keys(GROUP_KEYS) as InstructionGroup[]).map((g) => ({
      id: g, title: t(`tactics.instr.groups.${g}` as never), keys: GROUP_KEYS[g],
    })),
  ];

  const pickedLabels = optionLabels(picked);
  const pickedDescs = optionDescs(picked);
  const current = indexOf(picked);
  const tplIndex = templateIndexOf(picked);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("tactics.instr.title")}</h3>
          {!compact && <p className="text-sm text-muted-foreground m-0 mt-1">{t("tactics.instr.hint")}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${changes > 0 ? "text-chart-4" : "text-primary"}`}>
            {changes > 0
              ? t("tactics.instr.changes", { count: changes, style: styleLabel })
              : t("tactics.instr.template", { style: styleLabel })}
          </span>
          {changes > 0 && (
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-4 items-start">
        <div className="rounded-md border border-border flex flex-col">
          {groups.map((g) => (
            <section key={g.id} aria-label={g.title} className="border-b border-border/50 last:border-b-0 py-2">
              {g.id !== "mentality" && <p className={`${LABEL} px-3 pb-1`}>{g.title}</p>}
              <ul className="list-none m-0 p-0">{g.keys.map(row)}</ul>
            </section>
          ))}
        </div>

        <div className="rounded-md border border-border p-4 flex flex-col gap-3 lg:sticky lg:top-4">
          <div>
            <h4 className="font-display font-black uppercase text-base leading-none m-0">{t(`tactics.instr.labels.${picked}` as never)}</h4>
            <p className="text-sm text-muted-foreground m-0 mt-1">
              {t("tactics.instr.detailSub", { style: styleLabel, level: pickedLabels[tplIndex] ?? "" })}
            </p>
          </div>
          <ul className="list-none m-0 p-0 flex flex-col gap-2" aria-label={t(`tactics.instr.labels.${picked}` as never)}>
            {pickedLabels.map((label, i) => {
              const on = i === current;
              const tpl = i === tplIndex;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pick(picked, i)}
                    disabled={disabled}
                    aria-pressed={on}
                    className={`w-full text-left rounded-md border px-3 py-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default ${
                      on
                        ? `${tpl ? "border-primary bg-primary/15" : "border-chart-4 bg-chart-4/10"}`
                        : "border-border/60 bg-card/40 hover:border-primary"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`font-display font-bold uppercase tracking-[0.08em] text-sm ${
                        on ? (tpl ? "text-primary" : "text-chart-4") : "text-foreground"
                      }`}>{label}</span>
                      {tpl && (
                        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                          {t("tactics.instr.templateTag")}
                        </span>
                      )}
                    </span>
                    {pickedDescs[i] && <span className="block text-sm text-muted-foreground mt-0.5">{pickedDescs[i]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
