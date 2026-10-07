import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import { INBOX_THEMES, inboxThemeOf, themeCounts } from "@/Domain/inbox/inboxThemes";
import type { InboxCategory } from "@/types/inboxTypes";

describe("inboxThemes", () => {
  test("every inbox category has a known theme", () => {
    const categories = [...Object.keys(en.inbox.categories), "club_record"] as InboxCategory[];
    for (const c of categories) expect(INBOX_THEMES).toContain(inboxThemeOf(c));
  });

  test("every theme is used by at least one category", () => {
    const categories = [...Object.keys(en.inbox.categories), "club_record"] as InboxCategory[];
    const used = new Set(categories.map(inboxThemeOf));
    for (const theme of INBOX_THEMES) expect(used.has(theme)).toBe(true);
  });

  test("themeCounts counts totals and unread per theme", () => {
    const counts = themeCounts([
      { category: "injury", read: false },
      { category: "injury", read: true },
      { category: "cup", read: false },
    ]);
    expect(counts.get("health")).toEqual({ total: 2, unread: 1 });
    expect(counts.get("competitions")).toEqual({ total: 1, unread: 1 });
    expect(counts.get("jobs")).toBeUndefined();
  });
});
