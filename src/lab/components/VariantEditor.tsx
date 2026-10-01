import { useState } from "react";
import { TACTICAL_STYLE_OPTIONS, MENTALITY_OPTIONS, DEFAULT_MENTALITY, axesFor } from "@/types/tacticsTypes";
import type { TacticalStyle, Mentality, TacticalAxes } from "@/types/tacticsTypes";
import { CUSTOM_PRESETS } from "@/Domain/formation/zones";
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
    if (('formation' in p || 'tacticalStyle' in p || 'mentality' in p || 'axesOverride' in p || 'customFormation' in p) && !('label' in p)) {
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
          max={10}
          value={variant.staffRating ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            patch({ staffRating: v === 0 ? undefined : v });
          }}
          className="flex-1"
        />
        <span className="text-white/80 w-14 text-right">{variant.staffRating ? `${variant.staffRating}/10` : "tier"}</span>
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
