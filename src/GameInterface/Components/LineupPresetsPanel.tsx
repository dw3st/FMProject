import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LineupPresetKey, LineupPresets } from "@/types/tacticsTypes";
import { LINEUP_PRESET_KEYS } from "@/Domain/tactics/lineupPresets";
import { CUSTOM_FORMATION_ID, customShape } from "@/Domain/formation/zones";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";

/** One swap made when a preset was used, already resolved to names. */
export interface PresetSwapLine {
  outName: string;
  inName: string;
  reason: "injured" | "suspended" | "left";
}

type Pending = { key: LineupPresetKey; action: "overwrite" | "delete" } | null;

/**
 * "Saved lineups" block of the formation screen (#84): three slots (A, B, C). Dumb — the screen
 * owns the presets and the requests; this only renders and asks for confirmation before
 * overwriting or deleting a slot.
 */
export function LineupPresetsPanel({
  presets,
  busy,
  disabled,
  swaps,
  error,
  onSave,
  onUse,
  onDelete,
}: {
  presets: LineupPresets;
  busy: boolean;
  /** True while editing the formation: saving or using a preset waits. */
  disabled: boolean;
  /** Swaps of the last preset used (shown under the slots); null = nothing used yet. */
  swaps: { key: LineupPresetKey; lines: PresetSwapLine[] } | null;
  error: boolean;
  onSave: (key: LineupPresetKey) => void;
  onUse: (key: LineupPresetKey) => void;
  onDelete: (key: LineupPresetKey) => void;
}) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<Pending>(null);
  const fmtDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" });

  function confirm() {
    if (!pending) return;
    if (pending.action === "overwrite") onSave(pending.key);
    else onDelete(pending.key);
    setPending(null);
  }

  return (
    <div className="card-arcade rounded-md p-5">
      <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("formations.presets.title")}</h3>
      <p className="text-sm text-muted-foreground mt-2 mb-4">{t("formations.presets.hint")}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {LINEUP_PRESET_KEYS.map((key) => {
          const preset = presets[key];
          const starters = preset?.lineup.filter(Boolean).length ?? 0;
          const shape = preset
            ? preset.formation === CUSTOM_FORMATION_ID && preset.customFormation
              ? `${customShape(preset.customFormation.slots)} · ${t("formations.custom")}`
              : preset.formation
            : "";
          const asking = pending?.key === key;
          return (
            <div key={key} className="rounded-md border border-border p-4 flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <span className="font-display font-bold text-2xl leading-none text-primary">{key}</span>
                {preset ? (
                  <div className="min-w-0">
                    <div className="text-sm font-semibold tabular-nums truncate">
                      {shape} · {t("formations.presets.starters", { count: starters })}
                    </div>
                    <div className="text-sm text-muted-foreground tabular-nums">
                      {t("formations.presets.savedOn", { date: fmtDate(preset.savedOn) })}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{t("formations.presets.empty")}</span>
                )}
              </div>
              {asking ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t(pending!.action === "overwrite" ? "formations.presets.confirmOverwrite" : "formations.presets.confirmDelete", { key })}
                  </span>
                  <Button variant={pending!.action === "delete" ? "danger" : "primary"} onClick={confirm} disabled={busy}>
                    {t("formations.presets.confirm")}
                  </Button>
                  <Button variant="secondary" onClick={() => setPending(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {preset && (
                    <Button onClick={() => onUse(key)} disabled={busy || disabled}>
                      <Icon name="check" size={16} />
                      {t("formations.presets.use")}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => (preset ? setPending({ key, action: "overwrite" }) : onSave(key))}
                    disabled={busy || disabled}
                  >
                    <Icon name="save" size={16} />
                    {t(preset ? "formations.presets.overwrite" : "formations.presets.save")}
                  </Button>
                  {preset && (
                    <Button
                      variant="danger"
                      onClick={() => setPending({ key, action: "delete" })}
                      disabled={busy}
                      aria-label={t("formations.presets.delete", { key })}
                      title={t("formations.presets.delete", { key })}
                      className="ml-auto"
                    >
                      <Icon name="trash2" size={16} />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive mt-3">{t("formations.presets.error")}</p>}
      {swaps && (
        <div className="mt-4 text-sm" role="status">
          {swaps.lines.length === 0 ? (
            <p className="text-muted-foreground">{t("formations.presets.applied", { key: swaps.key })}</p>
          ) : (
            <>
              <p className="text-chart-4 font-semibold">{t("formations.presets.appliedWithSwaps", { key: swaps.key })}</p>
              <ul className="mt-1 space-y-0.5">
                {swaps.lines.map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    {t(`formations.presets.swap.${s.reason}`, { out: s.outName, in: s.inName })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
