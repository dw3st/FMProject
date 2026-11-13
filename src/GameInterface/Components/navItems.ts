import type { IconName } from "@/GameInterface/Icons";
import type { NavGroupDef } from "@/GameInterface/Components/navGroups";

/** One screen of the menu (top bar or left column). */
export interface NavItemDef {
  icon: IconName;
  /** Icon colour of the section (theme tokens only, #133). */
  tone: string;
  labelKey: string;
  /** The tab's id in the player's menu (`navMenu.ts`). */
  href: string;
  /** Art icon file when it is not `tab-<href>` (the league tab: a cached 404 of the first name, 8.9.17). */
  art?: string;
}

export const NAV_ITEMS: readonly NavItemDef[] = [
  { icon: "dashboard", tone: "text-primary", labelKey: "nav.dashboard", href: "/dashboard" },
  // `/squad` is a prefix: the real link is the player's own club.
  { icon: "squad", tone: "text-chart-2", labelKey: "nav.squad", href: "/squad" },
  { icon: "tactics", tone: "text-chart-2", labelKey: "nav.formation", href: "/formation" },
  { icon: "stadium", tone: "text-chart-3", labelKey: "nav.club", href: "/club" },
  { icon: "trend-up", tone: "text-primary", labelKey: "nav.development", href: "/development" },
  { icon: "wallet", tone: "text-chart-4", labelKey: "nav.finances", href: "/finances" },
  { icon: "staff-coach", tone: "text-chart-3", labelKey: "nav.staff", href: "/staff" },
  { icon: "trophy", tone: "text-chart-4", labelKey: "nav.leagues", href: "/leagues" },
  { icon: "arrow-right-left", tone: "text-chart-5", labelKey: "nav.transfers", href: "/transfers" },
  { icon: "binoculars", tone: "text-chart-3", labelKey: "nav.scout", href: "/scout" },
  { icon: "stats", tone: "text-primary", labelKey: "nav.stats", href: "/stats" },
];

/** The friends' world as a tab, after Stats (tester report, 8.9.14 / 8.9.16; before, an icon in the day block). */
export const WORLD_ITEM: NavItemDef = { icon: "users", tone: "text-chart-2", labelKey: "nav.worldTab", href: "/world", art: "tab-league" };

export const ALL_NAV_ITEMS: readonly NavItemDef[] = [...NAV_ITEMS, WORLD_ITEM];

export function navItemOf(id: string): NavItemDef | undefined {
  return ALL_NAV_ITEMS.find((i) => i.href === id);
}

/** Inside a group or in the left column there is room for the screen's full name. */
export function fullLabelKey(item: NavItemDef): string {
  return item.href === "/transfers" ? "nav.transfersFull" : item.labelKey;
}

const READY_GROUP_ICON: Record<NavGroupDef["key"], { icon: IconName; tone: string }> = {
  team: { icon: "squad", tone: "text-chart-2" },
  management: { icon: "stadium", tone: "text-chart-3" },
  market: { icon: "arrow-right-left", tone: "text-chart-5" },
  competitions: { icon: "trophy", tone: "text-chart-4" },
};

export function isReadyGroup(id: string): id is NavGroupDef["key"] {
  return Object.prototype.hasOwnProperty.call(READY_GROUP_ICON, id);
}

/** A ready-made group keeps its icon; a group of the player's own gets a neutral one. */
export function groupIconOf(id: string): { icon: IconName; tone: string } {
  return isReadyGroup(id) ? READY_GROUP_ICON[id] : { icon: "grid", tone: "text-primary" };
}
