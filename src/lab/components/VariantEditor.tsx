import { useState } from "react";
import { TACTICAL_STYLE_OPTIONS, MENTALITY_OPTIONS, DEFAULT_MENTALITY } from "@/types/tacticsTypes";
import type { TacticalStyle, Mentality } from "@/types/tacticsTypes";
import type { RawAttributes, Variant } from "@/lab/types";
import { RAW_ATTRIBUTE_KEYS } from "@/lab/types";
import type { FormationCatalog } from "@/lab/api";
import { generateVariantLabel } from "@/lab/labNames";

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
    if (('formation' in p || 'tacticalStyle' in p || 'mentality' in p) && !('label' in p)) {
      const autoNow = generateVariantLabel(variant.formation, variant.tacticalStyle, variant.mentality);
      if (variant.label === autoNow) {
        next.label = generateVariantLabel(next.formation, next.tacticalStyle, next.mentality);
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
