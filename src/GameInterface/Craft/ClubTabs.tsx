import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { CLUB_TABS, type ClubTab } from "@/Domain/facilities/clubTabs";

export type { ClubTab };

/** Club screen tabs (spec 2026-11-19-club-tab-redesign): Overview · Stadium · Works · Materials. */
export function ClubTabs({ active, onChange }: { active: ClubTab; onChange: (t: ClubTab) => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-[640px]">
      <SegmentedTabs<ClubTab>
        aria-label={t("clubTabs.label")}
        active={active}
        onChange={onChange}
        fill
        tabs={CLUB_TABS.map((k) => ({ key: k, label: t(`clubTabs.tab.${k}`) }))}
      />
    </div>
  );
}
