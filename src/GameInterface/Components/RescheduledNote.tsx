import { useTranslation } from "react-i18next";

/** Short date (`02 Oct`) in the UI language. */
export function shortDateLabel(iso: string, lang: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(lang, { day: "2-digit", month: "short" });
}

/** "Rescheduled from 02 Oct" under a league game moved off a clash (`.claude/rules/game/rescheduling.md`). */
export function RescheduledNote({ from, className = "" }: { from?: string; className?: string }) {
  const { t, i18n } = useTranslation();
  if (!from) return null;
  return (
    <span className={`text-sm text-muted-foreground ${className}`}>
      {t("schedule.rescheduledFrom", { date: shortDateLabel(from, i18n.language) })}
    </span>
  );
}
