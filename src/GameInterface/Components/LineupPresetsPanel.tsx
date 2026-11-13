import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LineupPresetKey, LineupPresets } from "@/types/tacticsTypes";
import { LINEUP_PRESET_KEYS, PRESET_NAME_MAX, presetDisplayName } from "@/Domain/tactics/lineupPresets";
import { CUSTOM_FORMATION_ID, customShape } from "@/Domain/formation/zones";
import { Button } from "@/GameInterface/ui/Button";
import { TextField } from "@/GameInterface/ui/TextField";
import { Icon } from "@/GameInterface/Icons";

/** One swap made when a preset was used, already resolved to names. */
export interface PresetSwapLine {
  outName: string;
  /** "" = nobody could replace him. */
  inName: string;
  reason: "injured" | "suspended" | "left";
}

type PendingAction = "overwrite" | "delete" | "use";
type Pending = { key: LineupPresetKey; action: PendingAction } | null;

const CONFIRM_TEXT: Record<PendingAction, string> = {
  overwrite: "formations.presets.confirmOverwrite",
  delete: "formations.presets.confirmDelete",
  use: "formations.presets.confirmUse",
};

/**
 * "Saved lineups" block of the formation screen (#84): three slots (A, B, C). Dumb — the screen
 * owns the presets and the requests; this only renders and asks for confirmation before
 * overwriting or deleting a slot. A saved slot can be given a name (tester report), shown here and in the match.
 */
export function LineupPresetsPanel({
  presets,
  busy,
  disabled,
  swaps,
  error,
  confirmUse,
  onSave,
  onUse,
  onDelete,
  onRename,
}: {
  presets: LineupPresets;
  busy: boolean;
  /** True while editing the formation: saving or using a preset waits. */
  disabled: boolean;
  /** Swaps of the last preset used (shown under the slots); null = nothing used yet. */
  swaps: { key: LineupPresetKey; lines: PresetSwapLine[] } | null;
  error: boolean;
  /** True when the XI on screen differs from the saved one: "Usar" asks before replacing it. */
  confirmUse: boolean;
  onSave: (key: LineupPresetKey) => void;
  onUse: (key: LineupPresetKey) => void;
  onDelete: (key: LineupPresetKey) => void;
  /** The typed name of a slot ("" clears it). */
  onRename: (key: LineupPresetKey, name: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<Pending>(null);
  const [renaming, setRenaming] = useState<{ key: LineupPresetKey; value: string } | null>(null);
  const fmtDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" });

  function confirm() {
    if (!pending) return;
    if (pending.action === "overwrite") onSave(pending.key);
    else if (pending.action === "use") onUse(pending.key);
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
          const naming = renaming?.key === key ? renaming : null;
          const shown = presetDisplayName(key, preset);
          return (
            <div key={key} className="rounded-md border border-border p-4 flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <span className="font-display font-bold text-2xl leading-none text-primary">{key}</span>
                {preset ? (
                  <div className="min-w-0">
                    {preset.name && (
                      <div className="font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground truncate" title={preset.name}>
                        {preset.name}
                      </div>
                    )}
                    <div className="text-sm font-semibold tabular-nums truncate">
                      {preset.fromClub && starters === 0 ? shape : <>{shape} · {t("formations.presets.starters", { count: starters })}</>}
                    </div>
                    <div className="text-sm text-muted-foreground tabular-nums truncate" title={preset.fromClub}>
                      {preset.fromClub && starters === 0
                        ? t("formations.presets.fromClub", { club: preset.fromClub })
                        : t("formations.presets.savedOn", { date: fmtDate(preset.savedOn) })}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{t("formations.presets.empty")}</span>
                )}
              </div>
              {naming ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRename(key, naming.value);
                    setRenaming(null);
                  }}
                >
                  <TextField
                    id={`preset-name-${key}`}
                    variant="box"
                    label={t("formations.presets.nameLabel", { key })}
                    value={naming.value}
                    maxLength={PRESET_NAME_MAX}
                    placeholder={t("formations.presets.namePlaceholder")}
                    autoFocus
                    onChange={(e) => setRenaming({ key, value: e.target.value })}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("formations.presets.nameHint", { n: PRESET_NAME_MAX })}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={busy}>{t("formations.presets.nameSave")}</Button>
                    <Button variant="secondary" onClick={() => setRenaming(null)}>{t("common.cancel")}</Button>
                  </div>
                </form>
              ) : asking ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t(CONFIRM_TEXT[pending!.action], { key: shown })}
                  </span>
                  <Button variant={pending!.action === "delete" ? "danger" : "primary"} onClick={confirm} disabled={busy || (pending!.action !== "delete" && disabled)}>
                    {t("formations.presets.confirm")}
                  </Button>
                  <Button variant="secondary" onClick={() => setPending(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {preset && (
                    <Button onClick={() => (confirmUse ? setPending({ key, action: "use" }) : onUse(key))} disabled={busy || disabled}>
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
                      variant="secondary"
                      onClick={() => setRenaming({ key, value: preset.name ?? "" })}
                      disabled={busy}
                      aria-label={t("formations.presets.rename", { key: shown })}
                      title={t("formations.presets.rename", { key: shown })}
                      className="ml-auto !px-2"
                    >
                      <Icon name="pencil" size={16} />
                    </Button>
                  )}
                  {preset && (
                    <Button
                      variant="danger"
                      onClick={() => setPending({ key, action: "delete" })}
                      disabled={busy}
                      aria-label={t("formations.presets.delete", { key: shown })}
                      title={t("formations.presets.delete", { key: shown })}
                      className="!px-2"
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
            <p className="text-muted-foreground">{t("formations.presets.applied", { key: presetDisplayName(swaps.key, presets[swaps.key]) })}</p>
          ) : (
            <>
              <p className="text-chart-4 font-semibold">{t("formations.presets.appliedWithSwaps", { key: presetDisplayName(swaps.key, presets[swaps.key]) })}</p>
              <ul className="mt-1 space-y-0.5">
                {swaps.lines.map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    {s.inName
                      ? t(`formations.presets.swap.${s.reason}`, { out: s.outName, in: s.inName })
                      : t(`formations.presets.noReplacement.${s.reason}`, { out: s.outName })}
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
