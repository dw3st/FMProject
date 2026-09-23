import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";
import { updateSaveDevelopmentTraining } from "@/GameInterface/gameSession";

export function DevelopmentTrainingConfig() {
  const { t } = useTranslation();
  const { session, save, mergeSession, refresh } = useGameSave();
  const [minEnergy, setMinEnergy] = useState(DEFAULT_MIN_ENERGY_TO_TRAIN);
  const [intensity, setIntensity] = useState<TrainingIntensity>(DEFAULT_TRAINING_INTENSITY);
  const [saving, setSaving] = useState(false);

  const INTENSITY_OPTIONS: { value: TrainingIntensity; label: string; hint: string }[] = useMemo(() => [
    { value: "light",  label: t("development.intensityLight"),  hint: t("development.intensityLightHint") },
    { value: "normal", label: t("development.intensityNormal"), hint: t("development.intensityNormalHint") },
    { value: "heavy",  label: t("development.intensityHeavy"),  hint: t("development.intensityHeavyHint") },
  ], [t]);

  useEffect(() => {
    const m = save?.min_energy_to_train ?? session?.min_energy_to_train ?? DEFAULT_MIN_ENERGY_TO_TRAIN;
    const i = save?.training_intensity ?? session?.training_intensity ?? DEFAULT_TRAINING_INTENSITY;
    setMinEnergy(m);
    setIntensity(i);
  }, [save?.min_energy_to_train, save?.training_intensity, session?.min_energy_to_train, session?.training_intensity]);

  const canonicalMin = save?.min_energy_to_train ?? session?.min_energy_to_train ?? DEFAULT_MIN_ENERGY_TO_TRAIN;
  const canonicalIntensity =
    save?.training_intensity ?? session?.training_intensity ?? DEFAULT_TRAINING_INTENSITY;

  const dirty = useMemo(
    () => minEnergy !== canonicalMin || intensity !== canonicalIntensity,
    [minEnergy, intensity, canonicalMin, canonicalIntensity],
  );

  const saveToFile = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      const updated = await updateSaveDevelopmentTraining(session.saveId, {
        min_energy_to_train: minEnergy,
        training_intensity: intensity,
      });
      mergeSession({
        min_energy_to_train: updated.min_energy_to_train,
        training_intensity: updated.training_intensity,
      });
      void refresh();
    } finally {
      setSaving(false);
    }
  }, [session, minEnergy, intensity, mergeSession, refresh]);

  return (
    <div className="card-arcade rounded-xl p-4 border border-border/50">
      <h3 className="text-xs font-black font-display uppercase tracking-wider text-muted-foreground m-0 mb-3">
        {t("development.trainingSetupTitle")}
      </h3>
      <p className="text-[11px] text-muted-foreground m-0 mb-2 leading-relaxed">
        {t("development.trainingSetupDescription")}
      </p>
      <p className="text-[11px] text-muted-foreground/80 m-0 mb-4 leading-relaxed">
        {t("development.trainingDpHint")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dev-min-energy" className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
            {t("development.minEnergyLabel")}
          </label>
          <div className="flex items-center gap-3">
            <input
              id="dev-min-energy"
              type="range"
              min={0}
              max={100}
              value={minEnergy}
              disabled={saving || !session}
              onInput={(e) => setMinEnergy(Number((e.target as HTMLInputElement).value))}
              className="flex-1 min-w-0 accent-primary h-2"
            />
            <span className="text-sm font-black font-display tabular-nums w-10 text-right text-foreground">{minEnergy}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 m-0">{t("development.minEnergyHint")}</p>
        </div>

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
            {t("development.intensityLabel")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {INTENSITY_OPTIONS.map((opt) => {
              const active = intensity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving || !session}
                  title={opt.hint}
                  onClick={() => setIntensity(opt.value)}
                  className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-lg border transition-colors ${
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
        <p className="text-[10px] text-muted-foreground m-0">
          {dirty ? t("development.unsavedChanges") : t("development.savedToFile")}
        </p>
        <button
          type="button"
          disabled={saving || !session || !dirty}
          onClick={() => void saveToFile()}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest glow-primary hover:scale-[1.02] active:scale-[0.98] transition-transform border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:hover:scale-100"
        >
          <Save className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
          {saving ? t("development.savingButton") : t("development.saveButton")}
        </button>
      </div>
    </div>
  );
}
