import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { getTacticalStyleMeta } from "@/types/tacticsTypes";
import { CUSTOM_FORMATION_ID } from "@/Domain/formation/zones";
import { TACTIC_SHORTCUTS, shortcutReadyMinute, tacticShortcutSlots, type ShortcutUse } from "@/Domain/match/tacticShortcuts";
import type { LineupPresetKey, LineupPresets } from "@/types/tacticsTypes";

/**
 * The band under the pitch of the live match (tester reports, 11.0): the manager's three saved line-ups as one-click
 * tactic changes, with the wait between two changes, and a shortcut to the heat map. Same height as the player band it
 * replaced, so the pitch does not move.
 */
export function MatchTacticsBar({ presets, active, lastUse, minute, phase, blocked, heatmapOpen, onUse, onToggleHeatmap }: {
  presets: LineupPresets | undefined;
  /** The shortcut in use (the last one applied and not changed by hand since). */
  active: LineupPresetKey | null;
  lastUse: ShortcutUse | null;
  minute: number;
  phase: string;
  /** Why no change can be made now (manager sent off or suspended); null = allowed. */
  blocked: string | null;
  heatmapOpen: boolean;
  onUse: (key: LineupPresetKey) => void;
  onToggleHeatmap: () => void;
}) {
  const { t } = useTranslation();
  const slots = tacticShortcutSlots(presets);
  const ready = shortcutReadyMinute(lastUse, minute, phase);
  const none = slots.every((s) => !s.preset);
  const status = blocked
    ?? (none
      ? t("match.shortcuts.none")
      : ready !== null
        ? t("match.shortcuts.wait", { minute: ready })
        : t("match.shortcuts.rule", { n: TACTIC_SHORTCUTS.COOLDOWN_MIN }));

  return (
    <div className="h-[92px] shrink-0 border-t border-border bg-card/60 overflow-hidden flex items-center gap-4 px-4">
      <div className="flex flex-col gap-1 shrink-0 w-44">
        <span className="font-display font-black uppercase text-xl leading-none">{t("match.shortcuts.title")}</span>
        <span className={`text-sm leading-tight ${ready !== null && !blocked ? "text-chart-4" : "text-muted-foreground"}`} aria-live="polite">{status}</span>
      </div>
      <div className="flex flex-1 min-w-0 items-stretch gap-3">
        {slots.map(({ key, preset }) => {
          const isActive = active === key && !!preset;
          const formation = preset ? (preset.formation === CUSTOM_FORMATION_ID ? t("substitutionPanel.freeShort") : preset.formation) : "";
          const style = preset?.tacticalStyle ? getTacticalStyleMeta(preset.tacticalStyle, t as never).label : null;
          const disabled = !preset || !!blocked || ready !== null || isActive;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => onUse(key)}
              title={preset ? t("match.shortcuts.use", { name: preset.name || t("match.shortcuts.slot", { key }) }) : t("match.shortcuts.emptyHint")}
              className={`flex flex-1 min-w-0 max-w-xs items-center gap-3 rounded-md border bg-card p-3 text-left transition-colors ${
                isActive ? "border-primary ring-1 ring-primary" : "border-border"
              } ${disabled ? (isActive ? "cursor-default" : "cursor-not-allowed opacity-50") : "cursor-pointer hover:border-primary/60"}`}
            >
              <span className={`font-display font-bold text-2xl leading-none ${preset ? "text-primary" : "text-muted-foreground"}`}>{key}</span>
              {preset ? (
                <span className="flex flex-col min-w-0">
                  <span className="font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground truncate">
                    {preset.name || t("match.shortcuts.slot", { key })}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums truncate">{style ? `${formation} · ${style}` : formation}</span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground truncate">{t("match.shortcuts.empty")}</span>
              )}
            </button>
          );
        })}
      </div>
      <Button
        variant="secondary"
        className={`shrink-0 !px-3 border border-border ${heatmapOpen ? "!text-primary" : ""}`}
        aria-pressed={heatmapOpen}
        onClick={onToggleHeatmap}
        title={t(heatmapOpen ? "match.heatmap.hide" : "match.heatmap.show")}
      >
        <Icon name="grid" size={16} />
        {t("match.shortcuts.heatmap")}
      </Button>
    </div>
  );
}
