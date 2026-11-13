import { describe, expect, test } from "bun:test";
import { groupNav, NAV_GROUPS } from "@/GameInterface/Components/navGroups";

const bar = ["/dashboard", "/squad", "/formation", "/club", "/development", "/finances", "/staff", "/leagues", "/transfers", "/scout", "/stats"]
  .map((href) => ({ href }));

describe("grouped top bar", () => {
  test("the dashboard stays a tab; every other screen is in one group, in the bar's order", () => {
    const entries = groupNav(bar);
    expect(entries.map((e) => (e.kind === "tab" ? e.item.href : e.key))).toEqual(["/dashboard", "team", "management", "competitions", "market"]);
    const inGroups = entries.flatMap((e) => (e.kind === "group" ? e.items.map((i) => i.href) : []));
    expect(new Set(inGroups).size).toBe(inGroups.length);
    expect(inGroups.length).toBe(bar.length - 1);
  });

  test("the friends' league joins the competitions; menu order is the group's", () => {
    const entries = groupNav([...bar, { href: "/world" }]);
    const comps = entries.find((e) => e.kind === "group" && e.key === "competitions");
    expect(comps?.kind === "group" && comps.items.map((i) => i.href)).toEqual(["/leagues", "/stats", "/world"]);
  });

  test("a group with one screen left is that screen's tab; no screen sits in two groups", () => {
    const entries = groupNav([{ href: "/dashboard" }, { href: "/scout" }]);
    expect(entries).toEqual([{ kind: "tab", item: { href: "/dashboard" } }, { kind: "tab", item: { href: "/scout" } }]);
    const all = NAV_GROUPS.flatMap((g) => g.hrefs);
    expect(new Set(all).size).toBe(all.length);
  });
});
