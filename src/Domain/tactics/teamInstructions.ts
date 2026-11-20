/**
 * Team instructions as in FM (engine rebuild stage 20, the 4c proposal; `.claude/rules/tatics.md` → "Instruções da
 * equipe"). Pure: catalog, the style templates, resolution into levels, the axes the levels give, the parser of a
 * `PUT` body and the AI's rule. No I/O; the engine reads the result through `InstructionConfig.ts`.
 *
 * Every instruction has five levels (−2..+2). The style is a template that fills them; the manager moves them on
 * top. Four of them are the old axes (`passing` = build_up, `width` / `defWidth` = width, `line` = defensive_line),
 * and `engagement` / `pressing` / `tackling` split the old `pressing_style`: levels −1 / 0 / +1 give the three axis
 * values exactly (so a style untouched plays as before) and ±2 add a small step beyond. The other instructions act
 * by their difference from the template, so the template always plays as before.
 */
import type {
  BuildUpStyle, DefensiveLine, InstructionLevel, PlayFocus, PressingStyle, TacticalAxes, TacticalStyle,
  TeamInstructions, TeamWidth,
} from "@/types/tacticsTypes";
import { axesFor } from "@/types/tacticsTypes";

export const IN_POSSESSION_KEYS = [
  "passing", "tempo", "width", "passTarget", "flanks", "crossing", "dribbling", "shooting", "freedom", "gkDistribution",
] as const;
export const TRANSITION_KEYS = ["onLoss", "onWin"] as const;
export const OUT_OF_POSSESSION_KEYS = ["engagement", "line", "pressing", "trap", "tackling", "crosses", "defWidth"] as const;

export type InPossessionKey = (typeof IN_POSSESSION_KEYS)[number];
export type TransitionKey = (typeof TRANSITION_KEYS)[number];
export type OutOfPossessionKey = (typeof OUT_OF_POSSESSION_KEYS)[number];
/** Every instruction with a five-level scale (`focus` is a choice of five). */
export type InstructionKey = InPossessionKey | TransitionKey | OutOfPossessionKey;
export type InstructionGroup = "inPossession" | "transition" | "outOfPossession";

export const INSTRUCTION_KEYS: readonly InstructionKey[] = [...IN_POSSESSION_KEYS, ...TRANSITION_KEYS, ...OUT_OF_POSSESSION_KEYS];
export const INSTRUCTION_LEVELS: readonly InstructionLevel[] = [-2, -1, 0, 1, 2];
export const PLAY_FOCUS: readonly PlayFocus[] = ["left", "center", "mixed", "right", "wings"];

export const GROUP_OF: Record<InstructionKey, InstructionGroup> = {
  ...Object.fromEntries(IN_POSSESSION_KEYS.map(k => [k, "inPossession"])),
  ...Object.fromEntries(TRANSITION_KEYS.map(k => [k, "transition"])),
  ...Object.fromEntries(OUT_OF_POSSESSION_KEYS.map(k => [k, "outOfPossession"])),
} as Record<InstructionKey, InstructionGroup>;

/** The instructions that are the old axes: their level picks the axis value (−1 / 0 / +1), ±2 adds a step beyond. */
export const AXIS_KEYS: readonly InstructionKey[] = ["passing", "width", "line", "engagement", "pressing", "tackling", "defWidth"];

export type InstructionLevels = Record<InstructionKey, InstructionLevel>;

/** Every instruction at 0, focus mixed. */
export function neutralLevels(): InstructionLevels {
  return Object.fromEntries(INSTRUCTION_KEYS.map(k => [k, 0])) as InstructionLevels;
}

const PRESS_LEVEL: Record<PressingStyle, InstructionLevel> = { low_block: -1, mid_block: 0, high_press: 1 };
const LINE_LEVEL: Record<DefensiveLine, InstructionLevel> = { deep: -1, normal: 0, high: 1 };
const WIDTH_LEVEL: Record<TeamWidth, InstructionLevel> = { narrow: -1, normal: 0, wide: 1 };
const BUILD_LEVEL: Record<BuildUpStyle, InstructionLevel> = { possession: -1, balanced: 0, direct: 1 };

/** The levels of the old axes (`axesOverride`, a style's bundle). */
export function levelsOfAxes(axes: Partial<TacticalAxes>): Partial<InstructionLevels> {
  const out: Partial<InstructionLevels> = {};
  if (axes.pressing_style) {
    const l = PRESS_LEVEL[axes.pressing_style];
    out.engagement = l; out.pressing = l; out.tackling = l;
  }
  if (axes.defensive_line) out.line = LINE_LEVEL[axes.defensive_line];
  if (axes.width) { out.width = WIDTH_LEVEL[axes.width]; out.defWidth = WIDTH_LEVEL[axes.width]; }
  if (axes.build_up) out.passing = BUILD_LEVEL[axes.build_up];
  return out;
}

/**
 * The style templates (FM's own tactic presets, report 3): the axis instructions are the style's axes; the others
 * describe what the style already does (counter-attack counters when it wins the ball, high press counter-presses).
 * The template plays exactly as the style always did: the new instructions only act by their difference from it.
 */
export const STYLE_TEMPLATES: Record<TacticalStyle, { levels: Partial<InstructionLevels>; focus: PlayFocus }> = {
  balanced:       { levels: {}, focus: "mixed" },
  counter_attack: { levels: { tempo: 1, passTarget: 1, onWin: 2, onLoss: -1 }, focus: "mixed" },
  high_press:     { levels: { tempo: 1, onLoss: 2 }, focus: "mixed" },
  possession:     { levels: { tempo: -1, passTarget: -1, onWin: -1, freedom: 1 }, focus: "mixed" },
  direct_play:    { levels: { tempo: 1, passTarget: 1, crossing: -1, gkDistribution: 1 }, focus: "mixed" },
};

/** A style's full template: neutral, the style's axes, then its own template levels. */
export function styleTemplate(style: TacticalStyle): { levels: InstructionLevels; focus: PlayFocus } {
  const t = STYLE_TEMPLATES[style];
  return { levels: { ...neutralLevels(), ...levelsOfAxes(axesFor(style)), ...t.levels }, focus: t.focus };
}

/** The flat instructions of a save body (absent = not set). */
export function flatInstructions(ti: TeamInstructions | undefined): { levels: Partial<InstructionLevels>; focus?: PlayFocus } {
  const levels: Partial<InstructionLevels> = {};
  if (!ti) return { levels };
  const groups = [ti.inPossession, ti.transition, ti.outOfPossession] as (Record<string, unknown> | undefined)[];
  for (const g of groups) {
    if (!g) continue;
    for (const k of INSTRUCTION_KEYS) {
      const v = g[k];
      if (isLevel(v)) levels[k] = v;
    }
  }
  const focus = ti.inPossession?.focus;
  return { levels, ...(focus && (PLAY_FOCUS as readonly string[]).includes(focus) ? { focus } : {}) };
}

/** Back to the save's nested shape (only the given levels). */
export function nestInstructions(levels: Partial<InstructionLevels>, focus?: PlayFocus): TeamInstructions {
  const out: TeamInstructions = {};
  for (const k of INSTRUCTION_KEYS) {
    const v = levels[k];
    if (v === undefined) continue;
    const g = GROUP_OF[k];
    ((out[g] ??= {}) as Record<string, InstructionLevel>)[k] = v;
  }
  if (focus) (out.inPossession ??= {}).focus = focus;
  return out;
}

export interface ResolvedInstructions {
  style: TacticalStyle;
  /** The levels the team plays. */
  levels: InstructionLevels;
  /** The style's template: the new instructions act by `levels − template`. */
  template: InstructionLevels;
  focus: PlayFocus;
  /** Saved mentality −2..+2. */
  mentality: number;
}

/**
 * What a team plays: the style's template, the old `axesOverride` on top (a save, a preset or the lab from before the
 * instructions), then the instructions themselves. Nothing given = the template (the game as it was).
 */
export function resolveInstructions(
  style: TacticalStyle,
  axesOverride?: Partial<TacticalAxes>,
  instructions?: TeamInstructions,
  mentality?: number,
): ResolvedInstructions {
  const tpl = styleTemplate(style);
  const flat = flatInstructions(instructions);
  const levels: InstructionLevels = { ...tpl.levels, ...(axesOverride ? levelsOfAxes(axesOverride) : {}), ...flat.levels };
  return {
    style, levels, template: tpl.levels, focus: flat.focus ?? tpl.focus,
    mentality: isLevel(mentality) ? mentality : 0,
  };
}

const AXIS_PRESS: PressingStyle[] = ["low_block", "mid_block", "high_press"];
const AXIS_LINE: DefensiveLine[] = ["deep", "normal", "high"];
const AXIS_WIDTH: TeamWidth[] = ["narrow", "normal", "wide"];
const AXIS_BUILD: BuildUpStyle[] = ["possession", "balanced", "direct"];

/** The three-way bucket of a level: ≤ −1 → 0, 0 → 1, ≥ +1 → 2. */
export function bucketOf(level: number): 0 | 1 | 2 {
  return level <= -1 ? 0 : level >= 1 ? 2 : 1;
}

/** The step beyond the bucket: −1 at −2, +1 at +2, else 0. */
export function axisExtraOf(level: number): number {
  return level >= 2 ? 1 : level <= -2 ? -1 : 0;
}

export function pressingStyleOf(level: number): PressingStyle { return AXIS_PRESS[bucketOf(level)]!; }
export function defensiveLineOf(level: number): DefensiveLine { return AXIS_LINE[bucketOf(level)]!; }
export function teamWidthOf(level: number): TeamWidth { return AXIS_WIDTH[bucketOf(level)]!; }
export function buildUpOf(level: number): BuildUpStyle { return AXIS_BUILD[bucketOf(level)]!; }

/**
 * The attacking side's axes (pressing = intensity, width = in possession) and the defending side's (width =
 * defensive width): the two widths are one axis in the old model.
 */
export function axesOfLevels(levels: InstructionLevels): { attack: TacticalAxes; defense: TacticalAxes } {
  const base = {
    pressing_style: pressingStyleOf(levels.pressing),
    defensive_line: defensiveLineOf(levels.line),
    build_up: buildUpOf(levels.passing),
  };
  return {
    attack:  { ...base, width: teamWidthOf(levels.width) },
    defense: { ...base, width: teamWidthOf(levels.defWidth) },
  };
}

/** True when the instructions differ from the style's template. */
export function differsFromTemplate(r: ResolvedInstructions): boolean {
  if (r.focus !== styleTemplate(r.style).focus) return true;
  return INSTRUCTION_KEYS.some(k => r.levels[k] !== r.template[k]);
}

export function isLevel(v: unknown): v is InstructionLevel {
  return typeof v === "number" && Number.isInteger(v) && v >= -2 && v <= 2;
}

/**
 * Validates a `TeamInstructions` body (`PUT /tactics`): `null` / `{}` = none; unknown group or key, a level outside
 * −2..+2 or an unknown focus is an error. Returns the cleaned instructions (only the keys given).
 */
export function parseTeamInstructions(raw: unknown): { ok: true; value: TeamInstructions | undefined } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: undefined };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid team instructions" };
  const groups: Record<InstructionGroup, readonly string[]> = {
    inPossession: [...IN_POSSESSION_KEYS, "focus"], transition: TRANSITION_KEYS, outOfPossession: OUT_OF_POSSESSION_KEYS,
  };
  const out: TeamInstructions = {};
  for (const [g, body] of Object.entries(raw as Record<string, unknown>)) {
    if (!(g in groups)) return { ok: false, error: "unknown instruction group" };
    if (body === null || body === undefined) continue;
    if (typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid team instructions" };
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (!groups[g as InstructionGroup].includes(k)) return { ok: false, error: "unknown instruction" };
      if (v === null || v === undefined) continue;
      if (k === "focus") {
        if (typeof v !== "string" || !(PLAY_FOCUS as readonly string[]).includes(v)) return { ok: false, error: "invalid focus" };
        (out.inPossession ??= {}).focus = v as PlayFocus;
        continue;
      }
      if (!isLevel(v)) return { ok: false, error: "invalid instruction level" };
      ((out[g as InstructionGroup] ??= {}) as Record<string, InstructionLevel>)[k] = v;
    }
  }
  return { ok: true, value: Object.keys(out).length ? out : undefined };
}

/** Only the instructions that differ from the style's template (what a save keeps). */
export function instructionsOffTemplate(style: TacticalStyle, levels: InstructionLevels, focus: PlayFocus): TeamInstructions | undefined {
  const tpl = styleTemplate(style);
  const diff: Partial<InstructionLevels> = {};
  for (const k of INSTRUCTION_KEYS) if (levels[k] !== tpl.levels[k]) diff[k] = levels[k];
  const out = nestInstructions(diff, focus !== tpl.focus ? focus : undefined);
  return Object.keys(out).length ? out : undefined;
}

// ── The AI's instructions (stage 4c-7) ───────────────────────────────────────

/** What the AI reads to pick its instructions: the score from its side and the minute. */
export interface AiInstructionSituation {
  /** Goals for − against. */
  lead: number;
  minute: number;
}

/**
 * The AI's instructions by rule: its style's template, then the score late on. Leading after the 75th it regroups,
 * holds the shape on the ball, slows the tempo and drops a mentality step; trailing after the 70th the opposite
 * (and more direct after the 80th). Level otherwise. Never the axis instructions before the 80th, so the shape and
 * the press the AI starts with stay the style's.
 */
export function aiInstructions(style: TacticalStyle, s: AiInstructionSituation): { instructions: TeamInstructions | undefined; mentality: InstructionLevel } {
  const tpl = styleTemplate(style).levels;
  const lv: Partial<InstructionLevels> = {};
  const step = (k: InstructionKey, d: number) => { lv[k] = clampLevel((lv[k] ?? tpl[k]) + d); };
  let mentality: InstructionLevel = 0;
  if (s.lead > 0 && s.minute >= 75) {
    step("onLoss", -1); step("onWin", -1); step("tempo", -1);
    mentality = -1;
  } else if (s.lead < 0 && s.minute >= 70) {
    step("onLoss", 1); step("onWin", 1); step("tempo", 1); step("shooting", 1);
    if (s.minute >= 80) step("passing", 1);
    mentality = 1;
  }
  const inst = nestInstructions(lv);
  return { instructions: Object.keys(inst).length ? inst : undefined, mentality };
}

/** A key for the AI's situation: the rule only changes at these steps. */
export function aiSituationKey(s: AiInstructionSituation): string {
  const band = s.minute >= 80 ? 3 : s.minute >= 75 ? 2 : s.minute >= 70 ? 1 : 0;
  return `${Math.sign(s.lead)}:${band}`;
}

function clampLevel(v: number): InstructionLevel {
  return Math.max(-2, Math.min(2, Math.round(v))) as InstructionLevel;
}
