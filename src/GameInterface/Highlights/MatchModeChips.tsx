import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import {
  HIGHLIGHT_LEVEL_PREFS, MATCH_PLAY_MODES, readHighlightLevel, readMatchMode, writeHighlightLevel, writeMatchMode,
  type HighlightLevelPref, type MatchPlayMode,
} from "@/GameInterface/artPrefs";

/** "Partida: Inteira / Só os lances" and, for the lances, the level (match preview, stage 19). */
export function MatchModeChips() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<MatchPlayMode>(() => readMatchMode());
  const [level, setLevel] = useState<HighlightLevelPref>(() => readHighlightLevel());
  return (
    <div className="flex items-center gap-3 flex-wrap justify-center">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("match.mode.label")}</span>
      <OptionChips
        value={mode}
        onChange={(k) => { setMode(k as MatchPlayMode); writeMatchMode(k as MatchPlayMode); }}
        options={MATCH_PLAY_MODES.map((m) => ({ key: m, label: t(`match.mode.${m}`) }))}
        aria-label={t("match.mode.label")}
      />
      {mode === "highlights" && (
        <OptionChips
          value={level}
          onChange={(k) => { setLevel(k as HighlightLevelPref); writeHighlightLevel(k as HighlightLevelPref); }}
          options={HIGHLIGHT_LEVEL_PREFS.map((l) => ({ key: l, label: t(`match.highlights.level.${l}`) }))}
          aria-label={t("match.highlights.levelLabel")}
        />
      )}
    </div>
  );
}
