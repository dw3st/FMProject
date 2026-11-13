import { describe, expect, test } from "bun:test";
import { CHANGELOG_TABS, isChangelogTab, sortByTab, type ChangelogTab } from "@/Domain/changelog/changelogTabs";

describe("sortByTab", () => {
  test("orders by tab, keeps the written order inside a tab, untagged last", () => {
    const items = [
      { id: 1 }, { id: 2, tab: "general" as const }, { id: 3, tab: "squad" as const }, { id: 4, tab: "match" as const },
      { id: 5, tab: "squad" as const }, { id: 6 },
    ];
    expect(sortByTab(items).map((i) => i.id)).toEqual([4, 3, 5, 2, 1, 6]);
  });

  test("an entry without tabs is left as written", () => {
    const items: { id: number; tab?: ChangelogTab }[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(sortByTab(items)).toEqual(items);
  });
});

describe("isChangelogTab", () => {
  test("knows the tabs and nothing else", () => {
    for (const tab of CHANGELOG_TABS) expect(isChangelogTab(tab)).toBe(true);
    expect(isChangelogTab("players")).toBe(false);
    expect(isChangelogTab(undefined)).toBe(false);
  });
});
