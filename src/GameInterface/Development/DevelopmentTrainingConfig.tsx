import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";
import { updateSaveDevelopmentTraining } from "@/GameInterface/gameSession";
import { Icon } from "@/GameInterface/Icons";
import { Chip } from "@/GameInterface/ui/Chip";
import { familiarityKeyLabel } from "@/GameInterface/Components/FamiliarityBars";
import { FAMILIARITY_KEYS, type FamiliarityKey } from "@/types/familiarityTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";

export function DevelopmentTrainingConfig() {
  const { t } = useTranslation();
  const { session, save, mergeSession, refresh } = useGameSave();
  const [minEnergy, setMinEnergy] = useState(DEFAULT_MIN_ENERGY_TO_TRAIN);
  const [intensity, setIntensity] = useState<TrainingIntensity>(DEFAULT_TRAINING_INTENSITY);
  const [saving, setSaving] = useState(false);
  // Style focus (`src/Domain/familiarity`): null = auto, the tactics style is drilled.
  const tacticsStyle = session?.tactical_style ?? DEFAULT_TACTICAL_STYLE;
  const canonicalFocus: FamiliarityKey | null = save?.style_focus ?? null;
  const [styleFocus, setStyleFocus] = useState<FamiliarityKey | null>(canonicalFocus);
  useEffect(() => setStyleFocus(canonicalFocus), [canonicalFocus]);

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
    () => minEnergy !== canonicalMin || intensity !== canonicalIntensity || styleFocus !== canonicalFocus,
    [minEnergy, intensity, canonicalMin, canonicalIntensity, styleFocus, canonicalFocus],
  );

  const saveToFile = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      const updated = await updateSaveDevelopmentTraining(session.saveId, {
        min_energy_to_train: minEnergy,
        training_intensity: intensity,
        style_focus: styleFocus,
      });
      mergeSession({
        min_energy_to_train: updated.min_energy_to_train,
        training_intensity: updated.training_intensity,
      });
      void refresh();
    } finally {
      setSaving(false);
    }
  }, [session, minEnergy, intensity, styleFocus, mergeSession, refresh]);

  return (
    <div className="card-arcade rounded-md p-4 border border-border/50">
      <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-3">
        {t("development.trainingSetupTitle")}
      </h3>
      <p className="text-sm text-muted-foreground m-0 mb-2 leading-relaxed">
        {t("development.trainingSetupDescription")}
      </p>
      <p className="text-sm text-muted-foreground/80 m-0 mb-4 leading-relaxed">
        {t("development.trainingDpHint")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dev-min-energy" className="block text-[13px] font-bold uppercase tracking-[0.08em] font-display text-muted-foreground mb-2">
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
          <p className="text-sm text-muted-foreground mt-1 m-0">{t("development.minEnergyHint")}</p>
        </div>

        <div>
          <span className="block text-[13px] font-bold uppercase tracking-[0.08em] font-display text-muted-foreground mb-2">
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
                  className={`text-[13px] font-black uppercase tracking-[0.08em] font-display px-2.5 py-1.5 rounded-lg border transition-colors ${
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

      <div className="mt-4">
        <span className="block text-[13px] font-bold uppercase tracking-[0.08em] font-display text-muted-foreground mb-2">
          {t("familiarity.focusLabel")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Chip selected={styleFocus === null} disabled={saving || !session} onClick={() => setStyleFocus(null)}>
            {t("familiarity.focusAuto", { style: familiarityKeyLabel(tacticsStyle, t) })}
          </Chip>
          {FAMILIARITY_KEYS.map((key) => (
            <Chip
              key={key}
              selected={styleFocus === key}
              disabled={saving || !session}
              onClick={() => setStyleFocus(key)}
            >
              {familiarityKeyLabel(key, t)}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-1 m-0">
          {t("familiarity.focusHint")}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
        <p className="text-sm text-muted-foreground m-0">
          {dirty ? t("development.unsavedChanges") : t("development.savedToFile")}
        </p>
        <button
          type="button"
          disabled={saving || !session || !dirty}
          onClick={() => void saveToFile()}
          className="inline-flex items-center gap-2 px-5 h-10 rounded bg-primary text-primary-foreground font-semibold text-[13px] border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="save" className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
          {saving ? t("development.savingButton") : t("development.saveButton")}
        </button>
      </div>
    </div>
  );
}
