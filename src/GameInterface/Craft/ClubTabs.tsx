import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { Icon, type IconName } from "@/GameInterface/Icons";

export type ClubTab = "facilities" | "workshop" | "stock" | "shop";
export const CLUB_TABS: ClubTab[] = ["facilities", "workshop", "stock", "shop"];
const ICON: Record<ClubTab, IconName> = { facilities: "building", workshop: "hammer", stock: "package", shop: "store" };

export const isClubTab = (v: string | null): v is ClubTab => v !== null && (CLUB_TABS as string[]).includes(v);

/** Club screen sections: Facilities · Workshop · Stock · Shop (craft, spec 2026-11-18 §10). */
export function ClubTabs({ active, onChange }: { active: ClubTab; onChange: (t: ClubTab) => void }) {
  const { t } = useTranslation();
  return (
    <SegmentedTabs<ClubTab>
      aria-label={t("craft.tabs.label")}
      active={active}
      onChange={onChange}
      tabs={CLUB_TABS.map((k) => ({
        key: k,
        label: <span className="flex items-center gap-1.5"><Icon name={ICON[k]} size={16} />{t(`craft.tabs.${k}`)}</span>,
      }))}
    />
  );
}
