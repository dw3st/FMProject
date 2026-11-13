import { describe, expect, test } from "bun:test";
import {
  NAV_MENU_LIMITS, NAV_TAB_IDS, addGroup, cleanGroupName, defaultMenu, findTab, groupCount, groupedMenu, isDefaultMenu,
  moveNode, moveTabInGroup, moveTabIntoGroup, moveTabOutOfGroup, normalizeMenu, removeGroup, renameGroup, resetMenu,
  setPosition, visibleMenu, type NavMenu, type NavNode,
} from "@/GameInterface/Components/navMenu";
import { ALL_NAV_ITEMS } from "@/GameInterface/Components/navItems";

const TABS = ["/a", "/b", "/c", "/d", "/e"];
const tab = (id: string): NavNode => ({ kind: "tab", id });
const group = (id: string, tabs: string[], name = ""): NavNode => ({ kind: "group", id, name, tabs });
const shape = (menu: NavMenu) => menu.items.map((n) => (n.kind === "tab" ? n.id : `${n.id}[${n.tabs.join(",")}]`));
/** Every tab once, whatever was done to the menu. */
const allTabs = (menu: NavMenu) => menu.items.flatMap((n) => (n.kind === "tab" ? [n.id] : n.tabs)).sort();

describe("the player's menu: model", () => {
  test("the tab ids are the bar's screens, in the bar's order", () => {
    expect([...NAV_TAB_IDS]).toEqual(ALL_NAV_ITEMS.map((i) => i.href));
  });

  test("the default is the flat top bar; the ready-made preset keeps every tab once", () => {
    const flat = defaultMenu();
    expect(flat.position).toBe("top");
    expect(shape(flat)).toEqual([...NAV_TAB_IDS]);
    expect(isDefaultMenu(flat)).toBe(true);
    const grouped = groupedMenu();
    expect(shape(grouped)).toEqual([
      "/dashboard", "team[/squad,/formation,/development]", "management[/club,/finances,/staff]",
      "competitions[/leagues,/stats,/world]", "market[/transfers,/scout]",
    ]);
    expect(allTabs(grouped)).toEqual([...NAV_TAB_IDS].sort());
    expect(isDefaultMenu(grouped)).toBe(false);
    expect(isDefaultMenu(setPosition(flat, "left"))).toBe(false);
  });
});

describe("normalizeMenu", () => {
  test("garbage gives the default", () => {
    for (const bad of [null, undefined, 3, "x", [], {}, { items: "no" }, { position: "left" }]) {
      expect(normalizeMenu(bad, TABS)).toEqual(defaultMenu(TABS));
    }
  });

  test("unknown and repeated tabs go, missing tabs are appended, empty groups go", () => {
    const menu = normalizeMenu({
      position: "left",
      items: [tab("/c"), tab("/zzz"), tab("/c"), group("mine", ["/a", "/c", "/nope", "/a"], "Meu"), group("empty", ["/zzz"]), 7, { kind: "other" }],
    }, TABS);
    expect(menu.position).toBe("left");
    expect(shape(menu)).toEqual(["/c", "mine[/a]", "/b", "/d", "/e"]);
    expect(allTabs(menu)).toEqual([...TABS].sort());
  });

  test("an unknown position is the top; the editor's copy may keep an empty group", () => {
    const stored = { position: "bottom", items: [group("g1", [])] };
    expect(normalizeMenu(stored, TABS).position).toBe("top");
    expect(shape(normalizeMenu(stored, TABS))).toEqual(TABS);
    expect(shape(normalizeMenu(stored, TABS, true))).toEqual(["g1[]", ...TABS]);
  });

  test("names are cleaned and cut; group ids are unique", () => {
    const menu = normalizeMenu({
      items: [group("x", ["/a"], "  My\u0007   long\n group name that never ends  "), group("x", ["/b"], 5 as unknown as string), group("", ["/c"])],
    }, TABS);
    const groups = menu.items.filter((n) => n.kind === "group");
    expect(groups.map((g) => g.kind === "group" && g.name)).toEqual(["My long group name t", "", ""]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(3);
    expect(cleanGroupName("a".repeat(50)).length).toBe(NAV_MENU_LIMITS.NAME);
    expect(cleanGroupName("ab ", false)).toBe("ab ");
  });

  test("at most 8 groups: the tabs of a ninth stay, ungrouped", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `/t${i}`);
    const menu = normalizeMenu({ items: ids.map((id, i) => group(`g${i}`, [id])) }, ids);
    expect(groupCount(menu)).toBe(NAV_MENU_LIMITS.GROUPS);
    expect(shape(menu).slice(8)).toEqual(["/t8", "/t9"]);
  });

  test("a stored menu is stable and survives a round trip", () => {
    const menu = normalizeMenu({ position: "left", items: [group("mine", ["/b", "/a"], "Meu"), tab("/e")] }, TABS);
    expect(normalizeMenu(JSON.parse(JSON.stringify(menu)), TABS)).toEqual(menu);
  });

  test("a tab the save does not have is hidden, not forgotten", () => {
    const menu = normalizeMenu({ items: [group("g", ["/a", "/e"]), group("solo", ["/d"]), tab("/b")] }, TABS);
    const shown = visibleMenu(menu, ["/a", "/b", "/c"]);
    expect(shape(shown)).toEqual(["g[/a]", "/b", "/c"]);
    expect(shape(menu)).toEqual(["g[/a,/e]", "solo[/d]", "/b", "/c"]);
  });
});

describe("the editor's operations", () => {
  const base: NavMenu = { position: "top", items: [tab("/a"), group("g", ["/b", "/c"]), tab("/d"), tab("/e")] };

  test("moveNode reorders tabs and groups; out of range changes nothing", () => {
    expect(shape(moveNode(base, 0, 1))).toEqual(["g[/b,/c]", "/a", "/d", "/e"]);
    expect(shape(moveNode(base, 1, 3))).toEqual(["/a", "/d", "/e", "g[/b,/c]"]);
    expect(shape(moveNode(base, 3, 0))).toEqual(["/e", "/a", "g[/b,/c]", "/d"]);
    expect(shape(moveNode(base, 3, 99))).toEqual(shape(base));
    expect(moveNode(base, 9, 0)).toBe(base);
    expect(moveNode(base, -1, 0)).toBe(base);
  });

  test("moveTabInGroup reorders inside the group", () => {
    expect(shape(moveTabInGroup(base, "g", 0, 1))).toEqual(["/a", "g[/c,/b]", "/d", "/e"]);
    expect(shape(moveTabInGroup(base, "nope", 0, 1))).toEqual(shape(base));
  });

  test("moveTabIntoGroup takes a tab from the top level or from another group", () => {
    expect(shape(moveTabIntoGroup(base, "/d", "g"))).toEqual(["/a", "g[/b,/c,/d]", "/e"]);
    expect(shape(moveTabIntoGroup(base, "/a", "g", 0))).toEqual(["g[/a,/b,/c]", "/d", "/e"]);
    const two: NavMenu = { position: "top", items: [group("g", ["/b", "/c"]), group("h", ["/a"])] };
    expect(shape(moveTabIntoGroup(two, "/a", "g", 1))).toEqual(["g[/b,/a,/c]", "h[]"]);
    expect(shape(moveTabIntoGroup(base, "/c", "g", 0))).toEqual(["/a", "g[/c,/b]", "/d", "/e"]);
    expect(moveTabIntoGroup(base, "/b", "g")).toBe(base);
    expect(moveTabIntoGroup(base, "/d", "nope")).toBe(base);
    expect(moveTabIntoGroup(base, "/zzz", "g")).toBe(base);
  });

  test("moveTabOutOfGroup puts it right after the group, or where asked", () => {
    expect(shape(moveTabOutOfGroup(base, "/b"))).toEqual(["/a", "g[/c]", "/b", "/d", "/e"]);
    expect(shape(moveTabOutOfGroup(base, "/c", 0))).toEqual(["/c", "/a", "g[/b]", "/d", "/e"]);
    expect(moveTabOutOfGroup(base, "/a")).toBe(base);
  });

  test("addGroup adds an empty group with a free id, up to 8", () => {
    let menu = addGroup(base, "  Novo   grupo ");
    const added = menu.items[menu.items.length - 1]!;
    expect(added).toEqual({ kind: "group", id: "g1", name: "Novo grupo", tabs: [] });
    for (let i = 0; i < 20; i++) menu = addGroup(menu, "x");
    expect(groupCount(menu)).toBe(NAV_MENU_LIMITS.GROUPS);
    const ids = menu.items.flatMap((n) => (n.kind === "group" ? [n.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    expect(addGroup(menu, "y")).toBe(menu);
  });

  test("renameGroup cleans the name as typed", () => {
    const named = renameGroup(base, "g", "Meu\tgrupo ");
    expect(named.items[1]).toEqual({ kind: "group", id: "g", name: "Meu grupo ", tabs: ["/b", "/c"] });
    const long = renameGroup(base, "g", "x".repeat(40)).items[1]!;
    expect(long.kind === "group" && long.name.length).toBe(NAV_MENU_LIMITS.NAME);
  });

  test("removeGroup leaves its tabs at its place", () => {
    expect(shape(removeGroup(base, "g"))).toEqual(["/a", "/b", "/c", "/d", "/e"]);
    expect(shape(removeGroup(base, "nope"))).toEqual(shape(base));
  });

  test("no operation ever loses or repeats a tab", () => {
    const steps: ((m: NavMenu) => NavMenu)[] = [
      (m) => moveNode(m, 0, 3), (m) => moveTabIntoGroup(m, "/e", "g", 1), (m) => addGroup(m, "n"),
      (m) => moveTabIntoGroup(m, "/b", "g1"), (m) => moveTabOutOfGroup(m, "/c", 0), (m) => moveTabInGroup(m, "g", 0, 1),
      (m) => removeGroup(m, "g"), (m) => moveTabOutOfGroup(m, "/b"), (m) => setPosition(m, "left"),
    ];
    let menu = base;
    for (const step of steps) {
      menu = step(menu);
      expect(allTabs(menu)).toEqual([...TABS].sort());
      expect(findTab(menu, "/a")).not.toBeNull();
    }
    expect(menu.position).toBe("left");
    expect(resetMenu(TABS)).toEqual(defaultMenu(TABS));
  });
});
