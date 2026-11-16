import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArtIcon, Icon, type IconName } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useRoute } from "@/GameInterface/router/navigation";
import { NAV_MENU_EVENT, normalizeMenu, readNavMenu, visibleMenu, type NavMenu } from "@/GameInterface/Components/navMenu";
import { useNavBadges } from "@/GameInterface/Components/navBadgesClient";
import { NAV_ITEMS, WORLD_ITEM, fullLabelKey, groupIconOf, isReadyGroup, navItemOf, type NavItemDef } from "@/GameInterface/Components/navItems";

/** The player's menu (`navMenu.ts`), followed live: the editor in Settings fires `NAV_MENU_EVENT`. */
export function useNavMenu(): NavMenu {
  const [menu, setMenu] = useState<NavMenu>(readNavMenu);
  useEffect(() => {
    const onMenu = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      setMenu(detail ? normalizeMenu(detail) : readNavMenu());
    };
    window.addEventListener(NAV_MENU_EVENT, onMenu);
    return () => window.removeEventListener(NAV_MENU_EVENT, onMenu);
  }, []);
  return menu;
}

/** The count on a tab or a group (report 2026-11-16): a bubble over the icon's corner, like the friends button. */
export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="pointer-events-none absolute -top-2 -right-3 min-w-5 h-5 px-1 rounded-full bg-destructive text-white text-sm font-bold leading-5 text-center tabular-nums"
      aria-hidden="true"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** A tab's icon: the art icon when the new visual has it, else the drawn one; the tab's count over its corner. */
export function NavTabIcon({ item, size, toned = true, badge = 0 }: { item: NavItemDef; size: number; toned?: boolean; badge?: number }) {
  const cls = `shrink-0 ${toned ? item.tone : ""}`;
  const icon = <ArtIcon art={item.art ?? `tab-${item.href.slice(1)}`} size={size} className={cls} fallback={<Icon name={item.icon} size={size} className={cls} />} />;
  if (badge <= 0) return icon;
  return <span className="relative inline-flex shrink-0">{icon}<NavBadge count={badge} /></span>;
}

export interface NavTabView {
  item: NavItemDef;
  /** Where the link really goes (the squad tab points at the manager's own club). */
  to: string;
  label: string;
  /** The name with room to spare (inside a group, in the left column). */
  fullLabel: string;
  active: boolean;
  /** Problems and unseen news of the tab (report 2026-11-16). */
  badge: number;
}

export type NavEntryView =
  | { kind: "tab"; tab: NavTabView }
  | { kind: "group"; id: string; label: string; icon: IconName; tone: string; active: boolean; tabs: NavTabView[]; badge: number };

/** The menu as this save draws it: position, and the entries with their links, names and the active one. */
export function useNavEntries(): { position: NavMenu["position"]; entries: NavEntryView[]; flat: boolean } {
  const { t } = useTranslation();
  const { pathname } = useRoute();
  const { session, save, currentDate } = useGameSave();
  const menu = useNavMenu();
  const multi = save?.mode === "multi";
  const unemployed = !!save?.unemployed;
  const squadHref = session && !unemployed
    ? `/squad/${encodeURIComponent(session.leagueSlug)}/${encodeURIComponent(session.clubId)}`
    : "/dashboard";

  const badgeOf = useNavBadges(unemployed ? undefined : session?.saveId, currentDate, pathname);

  return useMemo(() => {
    const available = (multi ? [...NAV_ITEMS, WORLD_ITEM] : NAV_ITEMS).map((i) => i.href);
    const shown = visibleMenu(menu, available);
    const view = (id: string): NavTabView | null => {
      const item = navItemOf(id);
      if (!item) return null;
      return {
        item,
        to: item.href === "/squad" ? squadHref : item.href,
        label: t(item.labelKey),
        fullLabel: t(fullLabelKey(item)),
        active: pathname.startsWith(item.href),
        badge: badgeOf(item.href),
      };
    };
    const entries: NavEntryView[] = [];
    for (const node of shown.items) {
      if (node.kind === "tab") {
        const tab = view(node.id);
        if (tab) entries.push({ kind: "tab", tab });
        continue;
      }
      const tabs = node.tabs.map(view).filter((v): v is NavTabView => v !== null);
      if (tabs.length === 0) continue;
      const look = groupIconOf(node.id);
      entries.push({
        kind: "group",
        id: node.id,
        label: node.name || (isReadyGroup(node.id) ? t(`nav.group.${node.id}`) : t("nav.group.unnamed")),
        icon: look.icon,
        tone: look.tone,
        active: tabs.some((v) => v.active),
        tabs,
        badge: tabs.reduce((n, v) => n + v.badge, 0),
      });
    }
    return { position: shown.position, entries, flat: entries.every((e) => e.kind === "tab") };
  }, [menu, multi, squadHref, pathname, t, badgeOf]);
}
