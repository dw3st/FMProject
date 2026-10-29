import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { Notice } from "@/GameInterface/ui/Notice";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { TRAINING_POSITIONS } from "@/Domain/youth/youthTraining";
import type { YouthFocus } from "@/types/youthTrainingTypes";

const FOCI: YouthFocus[] = ["balanced", "technical", "physical", "passing", "shooting", "defending", "goalkeeping", "setPieces"];

/**
 * A first-team player's individual training (4.39): a focus area and a training position, saved by
 * `PUT /api/saves/:id/players/:playerId/training`. The club-wide intensity stays in the training config.
 */
export function IndividualTrainingPanel({
  saveId, playerId, initial, onSaved,
}: {
  saveId: string;
  playerId: string;
  initial?: { focus?: YouthFocus; position?: string };
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<YouthFocus>(initial?.focus ?? "balanced");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [error, setError] = useState(false);

  useEffect(() => {
    setFocus(initial?.focus ?? "balanced");
    setPosition(initial?.position ?? "");
  }, [playerId, initial?.focus, initial?.position]);

  async function save(next: { focus: YouthFocus; position: string }) {
    setFocus(next.focus);
    setPosition(next.position);
    setError(false);
    const res = await fetch(`/api/saves/${saveId}/players/${playerId}/training`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focus: next.focus, position: next.position || null }),
    }).catch(() => null);
    if (res?.ok) onSaved?.();
    else setError(true);
  }

  return (
    <div className="card-arcade rounded-md p-5 flex flex-col gap-3">
      <SectionTitle>{t("developmentScreen.individual.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("developmentScreen.individual.hint")}</p>
      <div className="flex flex-col gap-1.5">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("youth.training.focus")}</span>
        <OptionChips<YouthFocus>
          aria-label={t("youth.training.focus")}
          value={focus}
          onChange={(v) => void save({ focus: v, position })}
          options={FOCI.map((k) => ({ key: k, label: t(`youth.training.foci.${k}`) }))}
        />
      </div>
      <SelectCombobox<string>
        label={t("youth.training.position")}
        labelId={`it-pos-${playerId}`}
        value={position}
        onChange={(v) => void save({ focus, position: v })}
        options={[{ value: "", label: t("youth.training.natural") }, ...TRAINING_POSITIONS.map((pos) => ({ value: pos, label: t(`roles.detailedAbbr.${pos}`) }))]}
      />
      {error && <Notice kind="error">{t("developmentScreen.individual.saveFailed")}</Notice>}
    </div>
  );
}
