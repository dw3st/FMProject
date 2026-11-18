import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { Icon, type IconName } from "@/GameInterface/Icons";

export type ClubTab = "facilities" | "stadium" | "attendance" | "works" | "workshop" | "stock" | "shop";
export const CLUB_TABS: ClubTab[] = ["facilities", "stadium", "attendance", "works", "workshop", "stock", "shop"];
/** The tabs drawn by `FacilitiesView` (they share its data). */
export type FacilitiesSection = "facilities" | "stadium" | "attendance" | "works";
export const isFacilitiesSection = (t: ClubTab): t is FacilitiesSection =>
  t === "facilities" || t === "stadium" || t === "attendance" || t === "works";
const ICON: Record<ClubTab, IconName> = {
  facilities: "building", stadium: "stadium", attendance: "users", works: "construction",
  workshop: "hammer", stock: "package", shop: "store",
};

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
