import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArtIcon, Icon, type IconName } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useRoute } from "@/GameInterface/router/navigation";
import { NAV_MENU_EVENT, normalizeMenu, readNavMenu, visibleMenu, type NavMenu } from "@/GameInterface/Components/navMenu";
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

/** A tab's icon: the art icon when the new visual has it, else the drawn one. */
export function NavTabIcon({ item, size, toned = true }: { item: NavItemDef; size: number; toned?: boolean }) {
  const cls = `shrink-0 ${toned ? item.tone : ""}`;
  return <ArtIcon art={item.art ?? `tab-${item.href.slice(1)}`} size={size} className={cls} fallback={<Icon name={item.icon} size={size} className={cls} />} />;
}

export interface NavTabView {
  item: NavItemDef;
  /** Where the link really goes (the squad tab points at the manager's own club). */
  to: string;
  label: string;
  /** The name with room to spare (inside a group, in the left column). */
  fullLabel: string;
  active: boolean;
}

export type NavEntryView =
  | { kind: "tab"; tab: NavTabView }
  | { kind: "group"; id: string; label: string; icon: IconName; tone: string; active: boolean; tabs: NavTabView[] };

/** The menu as this save draws it: position, and the entries with their links, names and the active one. */
export function useNavEntries(): { position: NavMenu["position"]; entries: NavEntryView[]; flat: boolean } {
  const { t } = useTranslation();
  const { pathname } = useRoute();
  const { session, save } = useGameSave();
  const menu = useNavMenu();
  const multi = save?.mode === "multi";
  const unemployed = !!save?.unemployed;
  const squadHref = session && !unemployed
    ? `/squad/${encodeURIComponent(session.leagueSlug)}/${encodeURIComponent(session.clubId)}`
    : "/dashboard";

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
      });
    }
    return { position: shown.position, entries, flat: entries.every((e) => e.kind === "tab") };
  }, [menu, multi, squadHref, pathname, t]);
}
