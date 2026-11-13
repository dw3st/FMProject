/**
 * Where in the game a "What's new" item is found (tester report): shown in brackets before the text, one colour per
 * tab, and the items of a release are ordered by it. See .claude/rules/changelog.md.
 */
export const CHANGELOG_TABS = [
  "match", "squad", "formation", "club", "development", "finances", "staff", "leagues", "market", "scout", "stats",
  "manager", "friends", "general",
] as const;

export type ChangelogTab = (typeof CHANGELOG_TABS)[number];

const ORDER = new Map<string, number>(CHANGELOG_TABS.map((tab, i) => [tab, i]));

export function isChangelogTab(v: unknown): v is ChangelogTab {
  return typeof v === "string" && ORDER.has(v);
}

/** Items in tab order (the order of the top bar, the match first, general last); untagged ones keep their place after them. */
export function sortByTab<T extends { tab?: ChangelogTab }>(items: readonly T[]): T[] {
  const rank = (item: T) => (item.tab ? ORDER.get(item.tab)! : CHANGELOG_TABS.length);
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i)
    .map((x) => x.item);
}
