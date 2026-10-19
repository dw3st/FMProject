import { useTranslation } from "react-i18next";
import { RESULT_PILL } from "@/GameInterface/formColors";

/** A friend's last results as five small markers (oldest first). */
export function RivalForm({ form }: { form: readonly ("W" | "D" | "L")[] }) {
  const { t } = useTranslation();
  if (form.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          title={t(`dashboard.home.formLong.${r}`)}
          className={`w-6 h-6 rounded text-sm font-display font-bold flex items-center justify-center ${RESULT_PILL[r]}`}
        >
          {t(`dashboard.home.form.${r}`)}
        </span>
      ))}
    </span>
  );
}
