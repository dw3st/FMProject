/**
 * The top bar in groups (tester report, 11.2): instead of one tab per screen, a few groups that open a short menu.
 * Pure: which group each screen belongs to. The layout is a choice of the viewer (`fm.topnav.layout`).
 */

export type NavLayout = "tabs" | "groups";

export interface NavGroupDef {
  key: "team" | "management" | "market" | "competitions";
  /** Paths of the screens in the group, in menu order. */
  hrefs: readonly string[];
}

/** Screens outside every group stay a tab of their own (the dashboard). */
export const NAV_GROUPS: readonly NavGroupDef[] = [
  { key: "team", hrefs: ["/squad", "/formation", "/development"] },
  { key: "management", hrefs: ["/club", "/finances", "/staff"] },
  { key: "market", hrefs: ["/transfers", "/scout"] },
  { key: "competitions", hrefs: ["/leagues", "/stats", "/world"] },
];

export type NavEntry<T> = { kind: "tab"; item: T } | { kind: "group"; key: NavGroupDef["key"]; items: T[] };

/**
 * The bar's entries in order: a group stands where its first present screen was, a screen of no group stays a tab.
 * A group left with a single screen (none here today) is that screen's tab.
 */
export function groupNav<T extends { href: string }>(items: readonly T[]): NavEntry<T>[] {
  const out: NavEntry<T>[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const def = NAV_GROUPS.find((g) => g.hrefs.includes(item.href));
    if (!def) { out.push({ kind: "tab", item }); continue; }
    if (placed.has(def.key)) continue;
    placed.add(def.key);
    const members = def.hrefs.map((h) => items.find((i) => i.href === h)).filter((i): i is T => i !== undefined);
    out.push(members.length === 1 ? { kind: "tab", item: members[0]! } : { kind: "group", key: def.key, items: members });
  }
  return out;
}

const LAYOUT_KEY = "fm.topnav.layout";
export const NAV_LAYOUT_EVENT = "fm:nav-layout";

export function readNavLayout(): NavLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "groups" ? "groups" : "tabs";
  } catch {
    return "tabs";
  }
}

export function writeNavLayout(layout: NavLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // no storage: the choice lasts this page
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(NAV_LAYOUT_EVENT, { detail: layout }));
}
