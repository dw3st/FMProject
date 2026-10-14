import { describe, expect, test } from "bun:test";
import { newsHeadline, newsLine, newsParams } from "@/GameInterface/News/newsText";
import type { NewsItem } from "@/types/newsTypes";

// Fake t: the key plus the params, so the test sees what reached the string.
const t = (key: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${key}|${JSON.stringify(o)}` : key);

const item = (over: Partial<NewsItem>): NewsItem => ({
  id: "2027-03-01:thrashing:f1", date: "2027-03-01", kind: "thrashing", importance: 1,
  clubIds: ["a", "b"], playerIds: [], params: {}, ...over,
});

describe("newsText", () => {
  test("headline uses a stable variant of the kind", () => {
    const n = item({ params: { winner: "A", loser: "B", score: "5–0" } });
    expect(newsHeadline(n, t, [], "en")).toMatch(/^news\.thrashing\.[012]\.title\|/);
    expect(newsHeadline(n, t, [], "en")).toBe(newsHeadline(n, t, [], "en"));
    expect(newsLine(n, t, [], "en")).toMatch(/^news\.thrashing\.[012]\.text\|.*"score":"5–0"/);
  });

  test("fee is formatted and a transfer without a seller uses the free text", () => {
    const n = item({ kind: "big_transfer", params: { player: "P", from: "X", to: "Y", fee: 45_000_000 } });
    expect(newsParams(n, t, [], "en").fee).toBe("€45.0M");
    const free = item({ kind: "big_transfer", params: { player: "P", from: "", to: "Y", fee: 0 } });
    expect(newsHeadline(free, t, [], "en")).toMatch(/^news\.big_transfer_free\.title/);
  });

  test("slugs become names; award, national, record and quote keys are translated", () => {
    expect(newsParams(item({ kind: "champion", params: { club: "C", competition: "ucl" } }), t, [], "en").competition)
      .toBe("Champions League");
    expect(newsParams(item({ kind: "national", params: { kind: "champion", team: "France", competition: "wc_2030" } }), t, [], "en").event)
      .toBe('news.nationalKind.champion|{"competition":"World Cup 2030"}');
    expect(newsParams(item({ kind: "award", params: { kind: "world_player", name: "N", club: "", league: "" } }), t, [], "en").award)
      .toMatch(/^news\.awardKind\.world_player/);
    expect(newsParams(item({ kind: "club_record", params: { club: "C", record: "biggestWin" } }), t, [], "en").record)
      .toBe("news.recordKind.biggestWin");
    expect(newsParams(item({ kind: "press_quote", params: { club: "C", manager: "M", key: "praise", player: "P" } }), t, [], "en").quote)
      .toMatch(/^news\.pressQuote\.praise\|/);
    expect(newsParams(item({ kind: "press_quote", params: { club: "C", manager: "M", key: "neutral", player: "" } }), t, [], "en").quote)
      .toMatch(/^news\.pressQuote\.other\|/);
  });
});
