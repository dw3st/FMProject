/**
 * The player's own menu (tester report, 11.2): where the menu sits (top bar or a left column), the order of the tabs
 * and his own groups (submenus, one level). Pure model and operations; the choice is the viewer's, kept in the browser
 * (`fm.nav.menu.v1`). With nothing stored the menu is the flat top bar of always.
 */
import { groupNav, NAV_LAYOUT_EVENT } from "@/GameInterface/Components/navGroups";

export type NavPosition = "top" | "left";

export type NavNode =
  | { kind: "tab"; id: string }
  /** `name` empty = the ready-made name of the group (`nav.group.<id>`) or "group" for one of his own. */
  | { kind: "group"; id: string; name: string; tabs: string[] };

export interface NavMenu {
  position: NavPosition;
  items: NavNode[];
}

/** Every tab the game has, in the default order (ids = the tab's path). `/world` only shows in a friends' world. */
export const NAV_TAB_IDS: readonly string[] = [
  "/dashboard", "/squad", "/formation", "/club", "/development", "/finances", "/staff", "/leagues", "/transfers",
  "/scout", "/stats", "/world",
];

export const NAV_MENU_LIMITS = { GROUPS: 8, NAME: 20, ID: 32 } as const;

export function defaultMenu(tabIds: readonly string[] = NAV_TAB_IDS): NavMenu {
  return { position: "top", items: tabIds.map((id) => ({ kind: "tab", id })) };
}

/** The four ready-made groups (`NAV_GROUPS`), unnamed: the bar shows their translated names. */
export function groupedMenu(tabIds: readonly string[] = NAV_TAB_IDS): NavMenu {
  const items: NavNode[] = groupNav(tabIds.map((href) => ({ href }))).map((e) =>
    e.kind === "tab" ? { kind: "tab", id: e.item.href } : { kind: "group", id: e.key, name: "", tabs: e.items.map((i) => i.href) },
  );
  return { position: "top", items };
}

/** A group name as typed: no control characters, single spaces, at most 20 characters. */
export function cleanGroupName(name: unknown, trim = true): string {
  if (typeof name !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trimStart().slice(0, NAV_MENU_LIMITS.NAME);
  return trim ? cleaned.trim() : cleaned;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function freeGroupId(taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const id = `g${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * A stored menu made safe: unknown and repeated tabs dropped, missing tabs appended at the end, empty groups dropped
 * (unless `keepEmpty`, the editor's working copy), names cleaned, at most 8 groups (the tabs of a 9th stay at its
 * place, ungrouped). Total: anything that is not a menu gives the default.
 */
export function normalizeMenu(stored: unknown, tabIds: readonly string[] = NAV_TAB_IDS, keepEmpty = false): NavMenu {
  if (!isRecord(stored) || !Array.isArray(stored.items)) return defaultMenu(tabIds);
  const known = new Set(tabIds);
  const seen = new Set<string>();
  const groupIds = new Set<string>();
  const items: NavNode[] = [];
  const take = (id: unknown): id is string => {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  let groups = 0;
  for (const raw of stored.items as unknown[]) {
    if (!isRecord(raw)) continue;
    if (raw.kind === "tab") {
      if (take(raw.id)) items.push({ kind: "tab", id: raw.id });
    } else if (raw.kind === "group") {
      const tabs = (Array.isArray(raw.tabs) ? (raw.tabs as unknown[]) : []).filter(take);
      if (tabs.length === 0 && !keepEmpty) continue;
      if (groups >= NAV_MENU_LIMITS.GROUPS) {
        for (const id of tabs) items.push({ kind: "tab", id });
        continue;
      }
      groups++;
      const wanted = typeof raw.id === "string" ? raw.id : "";
      const id = wanted.length > 0 && wanted.length <= NAV_MENU_LIMITS.ID && !groupIds.has(wanted) ? wanted : freeGroupId(groupIds);
      groupIds.add(id);
      items.push({ kind: "group", id, name: cleanGroupName(raw.name), tabs });
    }
  }
  for (const id of tabIds) if (!seen.has(id)) items.push({ kind: "tab", id });
  return { position: stored.position === "left" ? "left" : "top", items };
}

/** The menu as drawn: only the tabs this save has (`/world` is a friends' world's), no group left empty. */
export function visibleMenu(menu: NavMenu, available: readonly string[]): NavMenu {
  const ok = new Set(available);
  const items: NavNode[] = [];
  for (const node of menu.items) {
    if (node.kind === "tab") {
      if (ok.has(node.id)) items.push(node);
    } else {
      const tabs = node.tabs.filter((id) => ok.has(id));
      if (tabs.length > 0) items.push({ ...node, tabs });
    }
  }
  return { position: menu.position, items };
}

export function groupCount(menu: NavMenu): number {
  return menu.items.filter((n) => n.kind === "group").length;
}

/** Where a tab is: at the top level (`groupId` null) or inside a group. */
export function findTab(menu: NavMenu, tabId: string): { groupId: string | null; index: number } | null {
  for (let i = 0; i < menu.items.length; i++) {
    const node = menu.items[i]!;
    if (node.kind === "tab") {
      if (node.id === tabId) return { groupId: null, index: i };
    } else {
      const at = node.tabs.indexOf(tabId);
      if (at >= 0) return { groupId: node.id, index: at };
    }
  }
  return null;
}

function clampIndex(i: number, length: number): number {
  return Math.max(0, Math.min(length, Math.trunc(i)));
}

function moved<T>(list: readonly T[], from: number, to: number): T[] | null {
  if (!Number.isInteger(from) || from < 0 || from >= list.length) return null;
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(clampIndex(to, out.length), 0, item!);
  return out;
}

export function setPosition(menu: NavMenu, position: NavPosition): NavMenu {
  return { ...menu, position };
}

/** A top-level entry (tab or group) to another place: `to` is its index in the list once it has left. */
export function moveNode(menu: NavMenu, from: number, to: number): NavMenu {
  const items = moved(menu.items, from, to);
  return items ? { ...menu, items } : menu;
}

/** A tab to another place inside its own group. */
export function moveTabInGroup(menu: NavMenu, groupId: string, from: number, to: number): NavMenu {
  return {
    ...menu,
    items: menu.items.map((n) => {
      if (n.kind !== "group" || n.id !== groupId) return n;
      const tabs = moved(n.tabs, from, to);
      return tabs ? { ...n, tabs } : n;
    }),
  };
}

function withoutTab(menu: NavMenu, tabId: string): NavNode[] {
  const items: NavNode[] = [];
  for (const n of menu.items) {
    if (n.kind === "tab") {
      if (n.id !== tabId) items.push(n);
    } else {
      items.push(n.tabs.includes(tabId) ? { ...n, tabs: n.tabs.filter((t) => t !== tabId) } : n);
    }
  }
  return items;
}

/** A tab (from the top level or another group) into a group, at `index` (default: the end). */
export function moveTabIntoGroup(menu: NavMenu, tabId: string, groupId: string, index?: number): NavMenu {
  const at = findTab(menu, tabId);
  if (!at || !menu.items.some((n) => n.kind === "group" && n.id === groupId)) return menu;
  if (at.groupId === groupId) return index === undefined ? menu : moveTabInGroup(menu, groupId, at.index, index > at.index ? index - 1 : index);
  const items = withoutTab(menu, tabId).map((n) => {
    if (n.kind !== "group" || n.id !== groupId) return n;
    const tabs = [...n.tabs];
    tabs.splice(clampIndex(index ?? tabs.length, tabs.length), 0, tabId);
    return { ...n, tabs };
  });
  return { ...menu, items };
}

/** A tab out of its group, back to the top level at `index` (default: right after the group). */
export function moveTabOutOfGroup(menu: NavMenu, tabId: string, index?: number): NavMenu {
  const at = findTab(menu, tabId);
  if (!at || at.groupId === null) return menu;
  const items = withoutTab(menu, tabId);
  const groupAt = items.findIndex((n) => n.kind === "group" && n.id === at.groupId);
  items.splice(clampIndex(index ?? groupAt + 1, items.length), 0, { kind: "tab", id: tabId });
  return { ...menu, items };
}

/** A new empty group at the end; nothing changes at the limit of 8. */
export function addGroup(menu: NavMenu, name: string): NavMenu {
  if (groupCount(menu) >= NAV_MENU_LIMITS.GROUPS) return menu;
  const taken = new Set(menu.items.flatMap((n) => (n.kind === "group" ? [n.id] : [])));
  return { ...menu, items: [...menu.items, { kind: "group", id: freeGroupId(taken), name: cleanGroupName(name), tabs: [] }] };
}

export function renameGroup(menu: NavMenu, groupId: string, name: string): NavMenu {
  return {
    ...menu,
    items: menu.items.map((n) => (n.kind === "group" && n.id === groupId ? { ...n, name: cleanGroupName(name, false) } : n)),
  };
}

/** The group goes; its tabs stay at its place, at the top level. */
export function removeGroup(menu: NavMenu, groupId: string): NavMenu {
  return {
    ...menu,
    items: menu.items.flatMap((n): NavNode[] => (n.kind === "group" && n.id === groupId ? n.tabs.map((id) => ({ kind: "tab", id })) : [n])),
  };
}

/** Back to the flat top bar. */
export function resetMenu(tabIds: readonly string[] = NAV_TAB_IDS): NavMenu {
  return defaultMenu(tabIds);
}

export function isDefaultMenu(menu: NavMenu, tabIds: readonly string[] = NAV_TAB_IDS): boolean {
  return menu.position === "top" && menu.items.length === tabIds.length && menu.items.every((n, i) => n.kind === "tab" && n.id === tabIds[i]);
}

const MENU_KEY = "fm.nav.menu.v1";
/** The first version's choice (tabs or the ready-made groups), read once. */
const OLD_LAYOUT_KEY = "fm.topnav.layout";

export { NAV_LAYOUT_EVENT as NAV_MENU_EVENT };

export function readNavMenu(): NavMenu {
  try {
    const raw = localStorage.getItem(MENU_KEY);
    if (raw !== null) return normalizeMenu(JSON.parse(raw));
    if (localStorage.getItem(OLD_LAYOUT_KEY) === "groups") {
      const menu = groupedMenu();
      localStorage.setItem(MENU_KEY, JSON.stringify(menu));
      localStorage.removeItem(OLD_LAYOUT_KEY);
      return menu;
    }
  } catch {
    // no storage, or not a menu: the default
  }
  return defaultMenu();
}

export function writeNavMenu(menu: NavMenu): void {
  try {
    localStorage.setItem(MENU_KEY, JSON.stringify(menu));
  } catch {
    // no storage: the choice lasts this page
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(NAV_LAYOUT_EVENT, { detail: menu }));
}
