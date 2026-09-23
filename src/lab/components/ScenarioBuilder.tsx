import { useEffect, useState } from "react";
import type { BalanceScenario, Variant } from "@/lab/types";
import { TACTICAL_STYLE_OPTIONS } from "@/types/tacticsTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";
import type { FormationCatalog } from "@/lab/api";
import { VariantEditor } from "@/lab/components/VariantEditor";
import { generateVariantLabel, generateScenarioName } from "@/lab/labNames";

interface Props {
  formations: FormationCatalog;
  draft: Partial<BalanceScenario> | null;
  onRun: (scenario: Partial<BalanceScenario>) => void;
}

const FALLBACK_FORMATION = "4-3-3";

const DEFAULT_VARIANT = (id: string, formation: string): Variant => ({
  id,
  label: generateVariantLabel(formation, "balanced"),
  formation,
  tacticalStyle: "balanced",
  squad: { kind: "uniform", statLevel: 10 },
});

export function ScenarioBuilder({ formations, draft, onRun }: Props) {
  const [matchesPerPair, setMatches] = useState<number>(draft?.matchesPerPair ?? 50);
  const [simEngine, setSimEngine] = useState<"full" | "quick">(draft?.simEngine ?? "full");
  const supported = formations.supported.length > 0 ? formations.supported : [FALLBACK_FORMATION];
  const initialFormation = supported.includes(FALLBACK_FORMATION) ? FALLBACK_FORMATION : supported[0]!;

  const [variants, setVariants] = useState<Variant[]>(
    draft?.variants ?? [
      DEFAULT_VARIANT("v1", initialFormation),
      DEFAULT_VARIANT("v2", initialFormation),
    ],
  );

  const [nameIsAuto, setNameIsAuto] = useState(!draft?.name);
  const [name, setName] = useState(draft?.name ?? generateScenarioName(
    draft?.variants ?? [DEFAULT_VARIANT("v1", initialFormation), DEFAULT_VARIANT("v2", initialFormation)],
  ));

  useEffect(() => {
    if (nameIsAuto) setName(generateScenarioName(variants));
  }, [variants, nameIsAuto]);

  function addVariant() {
    const idx = variants.length + 1;
    setVariants([...variants, DEFAULT_VARIANT(`v${idx}`, initialFormation)]);
  }

  function removeVariant(id: string) {
    setVariants(variants.filter((v) => v.id !== id));
  }

  function updateVariant(v: Variant) {
    setVariants(variants.map((x) => (x.id === v.id ? v : x)));
  }

  function applyPreset(preset: "tactics-balance" | "formation-balance") {
    if (preset === "tactics-balance") {
      const styles = TACTICAL_STYLE_OPTIONS.map((o) => o.value);
      const newVariants = styles.map<Variant>((s) => ({
        id: `v-${s}`,
        label: generateVariantLabel("4-3-3", s as TacticalStyle),
        formation: "4-3-3",
        tacticalStyle: s as TacticalStyle,
        squad: { kind: "uniform", statLevel: 10 },
      }));
      setVariants(newVariants);
      setNameIsAuto(true);
      setMatches(100);
    } else if (preset === "formation-balance") {
      const newVariants = supported.map<Variant>((f) => ({
        id: `v-${f}`,
        label: generateVariantLabel(f, "balanced"),
        formation: f,
        tacticalStyle: "balanced" as TacticalStyle,
        squad: { kind: "uniform", statLevel: 10 },
      }));
      setVariants(newVariants);
      setNameIsAuto(true);
      setMatches(100);
    }
  }

  const n = variants.length;
  const estPairs = (n * (n - 1)) / 2;
  const totalMatches = estPairs * matchesPerPair;
  const canRun = !!name.trim() && n >= 2;

  return (
    <div className="space-y-6">
      <div className="bg-white/[0.03] border border-white/10 rounded p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Scenario</h2>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => applyPreset("tactics-balance")}
              className="px-2 py-1 rounded border border-white/10 hover:bg-white/5"
            >
              Preset: tactics
            </button>
            <button
              onClick={() => applyPreset("formation-balance")}
              className="px-2 py-1 rounded border border-white/10 hover:bg-white/5"
            >
              Preset: formations
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Name">
            <div className="flex gap-1">
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setNameIsAuto(false); }}
                placeholder="e.g. Counter vs all formations"
                className={[
                  "bg-black/40 border border-white/10 rounded px-2 py-1 text-sm flex-1 min-w-0",
                  nameIsAuto ? "text-white/50" : "text-white",
                ].join(" ")}
              />
              {!nameIsAuto && (
                <button
                  onClick={() => setNameIsAuto(true)}
                  title="Reset to auto-generated name"
                  className="px-2 py-1 text-xs text-white/40 hover:text-white border border-white/10 rounded"
                >
                  ↺
                </button>
              )}
            </div>
          </Field>
          <Field label="Matches / pair">
            <input
              type="number"
              min={1}
              value={matchesPerPair}
              onChange={(e) => setMatches(parseInt(e.target.value) || 1)}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm w-full"
            />
          </Field>
          <Field label="Engine">
            <select
              value={simEngine}
              onChange={(e) => setSimEngine(e.target.value as "full" | "quick")}
              className="bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-sm"
            >
              <option value="full">Full engine</option>
              <option value="quick">quickSim</option>
            </select>
          </Field>
        </div>

        <div className="text-xs text-white/50">
          Will run <strong className="text-white">{estPairs}</strong> pair
          {estPairs === 1 ? "" : "s"} × {matchesPerPair} matches ={" "}
          <strong className="text-white">{totalMatches}</strong> matches total.
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Variants</h3>
          <button
            onClick={addVariant}
            className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
          >
            + Add
          </button>
        </div>
        <div className="space-y-2">
          {variants.map((v) => (
            <VariantEditor
              key={v.id}
              variant={v}
              formations={formations}
              onChange={updateVariant}
              onRemove={variants.length > 2 ? () => removeVariant(v.id) : undefined}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          disabled={!canRun}
          onClick={() =>
            onRun({
              name: name.trim(),
              matchesPerPair,
              simEngine,
              variants,
            })
          }
          className={[
            "px-4 py-2 rounded font-medium",
            canRun
              ? "bg-emerald-500 hover:bg-emerald-400 text-black"
              : "bg-white/5 text-white/30 cursor-not-allowed",
          ].join(" ")}
        >
          Run scenario
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/60">
      <span>{label}</span>
      {children}
    </label>
  );
}
