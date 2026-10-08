import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/**
 * Coaching-staff stars (`.claude/rules/game/staff.md`): five icons to the half star and the number
 * beside them. `stars` null = vacant (no one in the role or area).
 */
export function StaffStars({ stars, size = 16, showNumber = true }: { stars: number | null; size?: number; showNumber?: boolean }) {
  const { t, i18n } = useTranslation();
  if (stars === null) return <span className="text-sm text-destructive">{t("staff.vacant")}</span>;
  const s = Math.round(stars * 2) / 2;
  const label = s.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  return (
    <span className="inline-flex items-center gap-2" aria-label={t("staff.starsAria", { stars: label })} title={t("staff.starsAria", { stars: label })}>
      <span className="inline-flex text-primary" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={s >= i + 0.5 ? "" : "text-muted-foreground/40"}>
            <Icon name={s >= i + 1 ? "star-filled" : s >= i + 0.5 ? "star-half" : "star"} size={size} />
          </span>
        ))}
      </span>
      {showNumber && <span className="text-sm font-semibold tabular-nums">{label}</span>}
    </span>
  );
}
