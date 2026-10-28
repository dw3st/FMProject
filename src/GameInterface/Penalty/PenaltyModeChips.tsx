import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { loadPenaltyMode, savePenaltyMode, type PenaltyMode } from "@/GameInterface/Penalty/penaltyMode";

/** "Pênaltis: Bater eu mesmo / Automático", remembered per browser (match preview and the match room). */
export function PenaltyModeChips({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PenaltyMode>(() => loadPenaltyMode());
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("penalty2d.modeLabel")}</span>
      <OptionChips
        value={mode}
        disabled={disabled}
        onChange={(k) => { setMode(k as PenaltyMode); savePenaltyMode(k as PenaltyMode); }}
        options={[{ key: "manual", label: t("penalty2d.modeManual") }, { key: "auto", label: t("penalty2d.modeAuto") }]}
        aria-label={t("penalty2d.modeLabel")}
      />
    </div>
  );
}
