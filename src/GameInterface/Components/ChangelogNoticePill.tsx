import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

interface Props {
  version: string;
  /** Opens the changelog modal (and should mark the notice as seen). */
  onOpen: () => void;
  /** Dismisses the pill without opening the modal (also marks the notice as seen). */
  onDismiss: () => void;
  className?: string;
}

/** Small dismissible "new version" pill — see .claude/rules/changelog.md. */
export function ChangelogNoticePill({ version, onOpen, onDismiss, className = "" }: Props) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 pl-2.5 pr-1.5 py-1 text-[13px] font-bold uppercase tracking-[0.08em] text-primary ${className}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="bg-transparent border-0 p-0 cursor-pointer text-primary hover:underline"
      >
        {t("changelog.notice", { version })}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="flex items-center justify-center bg-transparent border-0 p-0.5 cursor-pointer text-primary/70 hover:text-primary rounded-full hover:bg-primary/20 transition-colors"
      >
        <Icon name="close" size={10} strokeWidth={2.5} />
      </button>
    </span>
  );
}
