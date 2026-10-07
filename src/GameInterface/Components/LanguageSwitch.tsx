import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "@/i18n/i18n";
import { useLanguage } from "@/i18n/LanguageProvider";
import { Flag } from "@/GameInterface/Components/Flag";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";

const SHORT: Record<string, string> = { en: "EN", "pt-BR": "PT" };

/** Compact EN / PT switch with flags; the change applies immediately (same hook as Settings). */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <SegmentedTabs
      compact
      className={className}
      aria-label={t("settings.language")}
      active={language}
      onChange={setLanguage}
      tabs={SUPPORTED_LANGUAGES.map((l) => ({
        key: l.code,
        label: (
          <>
            <Flag code={l.flag} />
            {SHORT[l.code] ?? l.code}
          </>
        ),
      }))}
    />
  );
}
