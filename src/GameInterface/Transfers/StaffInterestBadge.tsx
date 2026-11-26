import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";
import type { StaffInterest } from "@/Domain/staff/staffInterest";

const STYLE: Record<StaffInterest, { icon: IconName; cls: string }> = {
  interested: { icon: "check-circle", cls: "text-primary" },
  hesitant: { icon: "clock", cls: "text-chart-4" },
  refuses: { icon: "xcircle", cls: "text-destructive" },
};

/** How keen a free professional is on the user's club (report e6707450). */
export function StaffInterestBadge({ interest, premium }: { interest: StaffInterest; premium?: number }) {
  const { t } = useTranslation();
  const s = STYLE[interest];
  const pct = Math.round((premium ?? 0) * 100);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap tabular-nums ${s.cls}`}
      title={t(`staffPool.interest.${interest}Hint`, { pct })}
    >
      <Icon name={s.icon} size={16} aria-hidden />
      {interest === "hesitant" ? t("staffPool.interest.hesitantPct", { pct }) : t(`staffPool.interest.${interest}`)}
    </span>
  );
}
