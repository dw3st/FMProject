import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { useCurrentUser } from "@/GameInterface/AuthGate";
import { ReportModal } from "@/GameInterface/Components/ReportModal";

/** The tester's report button: one look everywhere (top bar, live match, preview, result), red with the flag and the word. */
export function ReportButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("nav.report")}
      className={`flex items-center gap-1.5 h-9 px-3 shrink-0 rounded-md border border-destructive bg-destructive text-destructive-foreground font-display font-bold uppercase tracking-[0.08em] text-sm whitespace-nowrap cursor-pointer hover:opacity-90 ${className}`}
    >
      <Icon name="report" size={16} className="shrink-0" />
      <span>{t("nav.report")}</span>
    </button>
  );
}

/** Report button with its modal, shown only to testers (`tester-reports.md`). */
export function TesterReportButton({ className }: { className?: string }) {
  const isTester = !!useCurrentUser()?.isTester;
  const [open, setOpen] = useState(false);
  if (!isTester) return null;
  return (
    <>
      <ReportButton onClick={() => setOpen(true)} {...(className ? { className } : {})} />
      <ReportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
