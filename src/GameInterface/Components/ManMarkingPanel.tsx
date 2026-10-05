import { useTranslation } from "react-i18next";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";

/** Maximum man-marking pairs per match (`.claude/rules/game/player-instructions.md`). */
const MAX_MARKS = 2;

export interface MarkOption { value: string; label: string; overall?: number }
export interface MarkPair { slot: number; targetId: string }

/**
 * Man-marking pairs of a match (player instructions): up to 2 rows "MARKER" (one of our outfield
 * slots) / "TARGET" (an outfield opponent), with "Their best player". Dumb — the parent saves
 * (`POST /match-marking` in the preview, the live state in the match).
 */
export function ManMarkingPanel({
  markers, targets, value, onChange, disabled, title = true,
}: {
  /** Our outfield slots: value = String(slot). */
  markers: MarkOption[];
  /** Opponent outfield players: value = id (roster id before the match, engine id live). */
  targets: MarkOption[];
  value: MarkPair[];
  onChange: (next: MarkPair[]) => void;
  disabled?: boolean;
  title?: boolean;
}) {
  const { t } = useTranslation();
  const best = [...targets].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const update = (i: number, patch: Partial<MarkPair>) => {
    const next = value.map((m, j) => (j === i ? { ...m, ...patch } : m));
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => {
    const usedSlots = new Set(value.map((m) => m.slot));
    const usedTargets = new Set(value.map((m) => m.targetId));
    const slot = markers.find((m) => !usedSlots.has(Number(m.value)));
    const target = best.find((o) => !usedTargets.has(o.value));
    if (!slot || !target) return;
    onChange([...value, { slot: Number(slot.value), targetId: target.value }]);
  };
  return (
    <div>
      {title && (
        <>
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("instructions.marking.title")}</h3>
          <p className="text-sm text-muted-foreground m-0 mt-1 mb-3">{t("instructions.marking.hint")}</p>
        </>
      )}
      <div className="flex flex-col gap-3">
        {value.map((m, i) => {
          const usedTargets = new Set(value.filter((_, j) => j !== i).map((x) => x.targetId));
          const usedSlots = new Set(value.filter((_, j) => j !== i).map((x) => x.slot));
          const bestFree = best.find((o) => !usedTargets.has(o.value));
          return (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <SelectCombobox<string>
                label={t("instructions.marking.marker")}
                labelId={`mark-marker-${i}`}
                className="min-w-48 flex-1"
                disabled={disabled}
                value={String(m.slot)}
                onChange={(v) => update(i, { slot: Number(v) })}
                options={markers.filter((o) => !usedSlots.has(Number(o.value)))}
              />
              <SelectCombobox<string>
                label={t("instructions.marking.target")}
                labelId={`mark-target-${i}`}
                className="min-w-48 flex-1"
                disabled={disabled}
                value={m.targetId}
                onChange={(v) => update(i, { targetId: v })}
                options={targets.filter((o) => !usedTargets.has(o.value))}
              />
              <Button
                variant="secondary"
                disabled={disabled || !bestFree}
                onClick={() => bestFree && update(i, { targetId: bestFree.value })}
              >
                <Icon name="star" size={16} />
                {t("instructions.marking.best")}
              </Button>
              <Button variant="danger" disabled={disabled} onClick={() => remove(i)}>
                {t("instructions.marking.remove")}
              </Button>
            </div>
          );
        })}
        {value.length < MAX_MARKS && (
          <div>
            <Button variant="secondary" disabled={disabled || markers.length === 0 || targets.length === 0} onClick={add}>
              <Icon name="target" size={16} />
              {t("instructions.marking.add")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
