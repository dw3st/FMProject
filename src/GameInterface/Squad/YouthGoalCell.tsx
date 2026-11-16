import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { YOUTH_GOAL, type GoalMonths, type GoalStatus } from "@/Domain/youth/youthGoals";
import type { YouthGoal } from "@/types/youthTrainingTypes";

export type YouthGoalView = YouthGoal & { status: GoalStatus };

const STATUS_CLASS: Record<GoalStatus, string> = {
  onTrack: "text-chart-2",
  behind: "text-chart-4",
  reached: "text-chart-2",
  missed: "text-destructive",
};

/**
 * The development goal of an academy player (report 2026-11-16): "OVR 55 by 05/2038 · on track", or a button to set
 * one: the OVR to reach (above today's, at most 20 more) in 3, 6 or 12 months.
 */
export function YouthGoalCell({ overall, goal, onSave }: {
  overall: number;
  goal?: YouthGoalView;
  onSave: (goal: { level: number; months: number } | null) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const now = Math.round(overall * 10);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(String(Math.min(100, now + 5)));
  const [months, setMonths] = useState<`${GoalMonths}`>("6");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const max = Math.min(100, now + YOUTH_GOAL.MAX_GAIN * 10);
  const value = Number(target);
  const valid = Number.isInteger(value) && value > now && value <= max;

  async function save(g: { level: number; months: number } | null) {
    setBusy(true);
    setFailed(false);
    const ok = await onSave(g);
    setBusy(false);
    if (ok) setEditing(false); else setFailed(true);
  }

  if (editing) {
    return (
      <span className="flex flex-col gap-1.5 min-w-56">
        <span className="inline-flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="goal-ovr">{t("youthGoal.target")}</label>
          <input
            id="goal-ovr"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 3))}
            className="w-16 rounded border border-border h-8 px-2 bg-transparent tabular-nums text-sm"
          />
          <span className="text-sm text-muted-foreground tabular-nums">{t("youthGoal.range", { now, max })}</span>
        </span>
        <OptionChips<`${GoalMonths}`>
          aria-label={t("youthGoal.months")}
          value={months}
          onChange={setMonths}
          options={YOUTH_GOAL.MONTHS.map((m) => ({ key: `${m}` as `${GoalMonths}`, label: t("youthGoal.monthsN", { count: m }) }))}
        />
        <span className="inline-flex items-center gap-3">
          <Button disabled={busy || !valid} onClick={() => void save({ level: value / 10, months: Number(months) })}>{t("youthGoal.save")}</Button>
          {goal && <Button variant="danger" flush disabled={busy} onClick={() => void save(null)}>{t("youthGoal.remove")}</Button>}
          <Button variant="secondary" flush onClick={() => setEditing(false)}>{t("youth.cancel")}</Button>
        </span>
        {failed && <span className="text-sm text-destructive">{t("youthGoal.failed")}</span>}
      </span>
    );
  }

  if (!goal) {
    return <Button variant="secondary" flush onClick={() => setEditing(true)}>{t("youthGoal.set")}</Button>;
  }
  const by = new Date(`${goal.by}T12:00:00`).toLocaleDateString(i18n.language, { month: "2-digit", year: "numeric" });
  return (
    <button type="button" onClick={() => setEditing(true)} className="flex flex-col items-start text-left text-sm min-h-8 hover:text-primary">
      <span className="tabular-nums">{t("youthGoal.line", { ovr: Math.round(goal.level * 10), by })}</span>
      <span className={STATUS_CLASS[goal.status]}>{t(`youthGoal.status.${goal.status}`)}</span>
    </button>
  );
}
