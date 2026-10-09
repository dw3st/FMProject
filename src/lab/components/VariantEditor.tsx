import { useState } from "react";
import { TACTICAL_STYLE_OPTIONS, MENTALITY_OPTIONS, DEFAULT_MENTALITY, axesFor } from "@/types/tacticsTypes";
import type { TacticalStyle, Mentality, TacticalAxes } from "@/types/tacticsTypes";
import { CUSTOM_PRESETS, customToFormation } from "@/Domain/formation/zones";
import { formationForSimId } from "@/Domain/matchFormations";
import { variantsForRole } from "@/GameEngine/Configs/RoleVariantConfig";
import type { PressLevel, RoleVariantId, SlotInstruction } from "@/types/tacticsTypes";
import type { RawAttributes, Variant } from "@/lab/types";
import { RAW_ATTRIBUTE_KEYS } from "@/lab/types";
import type { FormationCatalog } from "@/lab/api";
import { variantAutoLabel } from "@/lab/labNames";

const AXIS_OPTIONS: { key: keyof TacticalAxes; label: string; values: string[] }[] = [
  { key: "pressing_style", label: "Pressing", values: ["low_block", "mid_block", "high_press"] },
  { key: "defensive_line", label: "Line", values: ["deep", "normal", "high"] },
  { key: "width", label: "Width", values: ["narrow", "normal", "wide"] },
  { key: "build_up", label: "Build-up", values: ["direct", "balanced", "possession"] },
];

interface Props {
  variant: Variant;
  formations: FormationCatalog;
  onChange: (v: Variant) => void;
  onRemove?: () => void;
}

export function VariantEditor({ variant, formations, onChange, onRemove }: Props) {
  const [showCustom, setShowCustom] = useState(variant.squad.kind === "custom");

  function patch(p: Partial<Variant>) {
    const next = { ...variant, ...p };
    // If formation, tactic or mentality changed (not label), and the current label is
    // still the auto-generated one, keep it in sync.
    if (('formation' in p || 'tacticalStyle' in p || 'mentality' in p || 'axesOverride' in p || 'customFormation' in p || 'slotInstructions' in p || 'manMarks' in p) && !('label' in p)) {
      if (variant.label === variantAutoLabel(variant)) {
        next.label = variantAutoLabel(next);
      }
    }
    onChange(next);
  }

  function setSquadLevel(n: number) {
    onChange({ ...variant, squad: { ...variant.squad, statLevel: n } });
  }

  function toggleCustom(on: boolean) {
    setShowCustom(on);
    onChange({
      ...variant,
      squad: on
        ? { kind: "custom", statLevel: variant.squad.statLevel, attributes: {} }
        : { kind: "uniform", statLevel: variant.squad.statLevel },
    });
  }

  function setAttr(key: keyof RawAttributes, val: string) {
    if (variant.squad.kind !== "custom") return;
    const num = val === "" ? undefined : Math.max(1, Math.min(10, parseInt(val) || 1));
    const attrs = { ...(variant.squad.attributes ?? {}) };
    if (num === undefined) delete attrs[key];
    else attrs[key] = num;
    onChange({ ...variant, squad: { ...variant.squad, attributes: attrs } });
  }

  return (
    <div className="bg-black/30 border border-white/10 rounded p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={variant.label}
          onChange={(e) => patch({ label: e.target.value })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm flex-1"
        />
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-xs text-white/40 hover:text-red-400 px-2"
            aria-label="remove"
          >
            ×
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={variant.formation}
          onChange={(e) => patch({ formation: e.target.value })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
          title="Only formations supported by the engine are selectable"
        >
          {formations.supported.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
          {formations.unsupported.length > 0 && (
            <optgroup label="not yet supported">
              {formations.unsupported.map((f) => (
                <option key={f} value={f} disabled>
                  {f} (unsupported)
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <select
          value={variant.tacticalStyle}
          onChange={(e) => patch({ tacticalStyle: e.target.value as TacticalStyle })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
        >
          {TACTICAL_STYLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <InstructionsEditor variant={variant} onPatch={patch} />

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20">Free form.</span>
        <select
          value={variant.customFormation ? Object.keys(CUSTOM_PRESETS).find((k) => JSON.stringify(CUSTOM_PRESETS[k]) === JSON.stringify(variant.customFormation)) ?? "" : ""}
          onChange={(e) => patch({ customFormation: e.target.value ? CUSTOM_PRESETS[e.target.value] : undefined })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs flex-1"
          title="Zone-grid formation (replaces the formation above)"
        >
          <option value="">off (use formation above)</option>
          {Object.keys(CUSTOM_PRESETS).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {AXIS_OPTIONS.map((a) => (
          <label key={a.key} className="flex items-center gap-2">
            <span className="text-white/50 w-16">{a.label}</span>
            <select
              value={variant.axesOverride?.[a.key] ?? ""}
              onChange={(e) => {
                const next = { ...(variant.axesOverride ?? {}) } as Record<string, string>;
                if (e.target.value) next[a.key] = e.target.value;
                else delete next[a.key];
                patch({ axesOverride: Object.keys(next).length ? (next as Partial<TacticalAxes>) : undefined });
              }}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs flex-1"
            >
              <option value="">style ({axesFor(variant.tacticalStyle)[a.key]})</option>
              {a.values.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20">Mentality</span>
        <select
          value={variant.mentality ?? DEFAULT_MENTALITY}
          onChange={(e) => patch({ mentality: e.target.value as Mentality })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs flex-1"
        >
          {MENTALITY_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20">Fitness coach</span>
        <input
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={variant.fitnessCoachStars ?? 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            patch({ fitnessCoachStars: v < 1 ? undefined : v });
          }}
          className="flex-1"
        />
        <span className="text-white/80 w-14 text-right">{variant.fitnessCoachStars ? `${variant.fitnessCoachStars}★` : "tier"}</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20">Familiarity</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={variant.familiarity ?? 50}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            patch({ familiarity: v === 50 ? undefined : v });
          }}
          className="flex-1"
        />
        <span className="text-white/80 w-14 text-right">{variant.familiarity ?? "50"}</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20">Morale</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={variant.morale ?? 65}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            patch({ morale: v === 65 ? undefined : v });
          }}
          className="flex-1"
        />
        <span className="text-white/80 w-14 text-right">{variant.morale ?? "65"}</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20" title="Temperament of the whole side (personality); 0 = each player's own">Temper.</span>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={variant.temperament ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            patch({ temperament: v === 0 ? undefined : v });
          }}
          className="flex-1"
        />
        <span className="text-white/80 w-14 text-right">{variant.temperament ?? "own"}</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20" title="Pitch condition of the match (variant A, the home side, sets it); injury risk of both sides below 40%; 90 = default">Pitch</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={variant.pitchCondition ?? 90}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            patch({ pitchCondition: v === 90 ? undefined : v });
          }}
          className="flex-1"
        />
        <span className="text-white/80 w-14 text-right">{variant.pitchCondition ?? 90}%</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20" title="Referee rigor of the match (variant A sets it): fouls x(1 + 0.08 s), yellows x(1 + 0.15 s); 0 = no referee">Referee</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.25}
          value={variant.refereeStrictness ?? 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            patch({ refereeStrictness: v === 0 ? undefined : v });
          }}
          className="flex-1"
        />
        <span className="text-white/80 w-14 text-right">{variant.refereeStrictness ?? 0}</span>
      </div>

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <span className="text-white/50 w-20">Positions</span>
        <input
          type="checkbox"
          checked={variant.outOfPosition ?? false}
          onChange={(e) => patch({ outOfPosition: e.target.checked })}
        />
        <span className="text-white/70">Ignore position fit (out-of-position lineup)</span>
      </label>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50 w-20">Stat level</span>
        <input
          type="range"
          min={1}
          max={10}
          value={variant.squad.statLevel}
          onChange={(e) => setSquadLevel(parseInt(e.target.value))}
          className="flex-1"
        />
        <span className="text-white/80 w-8 text-right">{variant.squad.statLevel}/10</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-white/50 flex items-center gap-1">
          <input
            type="checkbox"
            checked={showCustom}
            onChange={(e) => toggleCustom(e.target.checked)}
          />
          custom attributes
        </label>
      </div>

      {showCustom && variant.squad.kind === "custom" && (
        <div className="grid grid-cols-2 gap-1 text-xs pt-1">
          {RAW_ATTRIBUTE_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-1 text-white/50">
              <span className="w-20">{k}</span>
              <input
                type="number"
                min={1}
                max={10}
                placeholder={String(variant.squad.statLevel)}
                value={variant.squad.kind === "custom" ? variant.squad.attributes?.[k] ?? "" : ""}
                onChange={(e) => setAttr(k, e.target.value)}
                className="bg-black/40 border border-white/10 rounded px-1 py-0.5 w-12"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Player instructions of a variant (`player-instructions.md`): per-slot variant / pressing, man-marking by slot. */
function InstructionsEditor({ variant, onPatch }: { variant: Variant; onPatch: (p: Partial<Variant>) => void }) {
  const [open, setOpen] = useState(false);
  const formation = variant.customFormation ? customToFormation(variant.customFormation) : formationForSimId(variant.formation);
  const list = variant.slotInstructions ?? [];
  const marks = variant.manMarks ?? [];
  const setSlot = (i: number, next: SlotInstruction | null) => {
    const copy = [...list];
    while (copy.length <= i) copy.push(null);
    copy[i] = next;
    onPatch({ slotInstructions: copy.some(Boolean) ? copy : undefined });
  };
  const setMarks = (next: { slot: number; targetSlot: number }[]) => onPatch({ manMarks: next.length ? next : undefined });
  return (
    <div className="text-xs space-y-1">
      <button type="button" onClick={() => setOpen(!open)} className="text-white/50 hover:text-white">
        {open ? "▾" : "▸"} Instructions ({list.filter(Boolean).length}{marks.length ? ` · ${marks.length} mark` : ""})
      </button>
      {open && (
        <div className="space-y-1 pl-2">
          {formation.attacking.map((s, i) => {
            if (s.role === "GK") return null;
            const cur = list[i] ?? null;
            return (
              <div key={i} className="flex items-center gap-1">
                <span className="text-white/50 w-14">#{i} {s.role}</span>
                <select
                  value={cur?.variant ?? ""}
                  onChange={(e) => setSlot(i, { ...(e.target.value ? { variant: e.target.value as RoleVariantId } : {}), ...(cur?.press ? { press: cur.press } : {}) })}
                  className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs flex-1"
                >
                  <option value="">default</option>
                  {variantsForRole(s.role).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select
                  value={cur?.press ?? "normal"}
                  onChange={(e) => setSlot(i, { ...(cur?.variant ? { variant: cur.variant } : {}), ...(e.target.value !== "normal" ? { press: e.target.value as PressLevel } : {}) })}
                  className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs"
                >
                  {(["less", "normal", "more"] as const).map((p) => <option key={p} value={p}>press {p}</option>)}
                </select>
              </div>
            );
          })}
          {[0, 1].map((k) => {
            const m = marks[k];
            return (
              <div key={k} className="flex items-center gap-1">
                <span className="text-white/50 w-14">mark {k + 1}</span>
                <select
                  value={m ? String(m.slot) : ""}
                  onChange={(e) => {
                    const next = marks.filter((_, j) => j !== k);
                    if (e.target.value) next.splice(k, 0, { slot: Number(e.target.value), targetSlot: m?.targetSlot ?? 9 });
                    setMarks(next);
                  }}
                  className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs flex-1"
                >
                  <option value="">off</option>
                  {formation.attacking.map((s, i) => (s.role === "GK" ? null : <option key={i} value={i}>marker #{i} {s.role}</option>))}
                </select>
                <select
                  value={m ? String(m.targetSlot) : ""}
                  disabled={!m}
                  onChange={(e) => setMarks(marks.map((x, j) => (j === k ? { ...x, targetSlot: Number(e.target.value) } : x)))}
                  className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs flex-1"
                  title="Opponent's formation slot"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => <option key={i} value={i}>opp. slot #{i}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
