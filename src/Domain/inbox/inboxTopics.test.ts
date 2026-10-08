import { describe, expect, test } from "bun:test";
import { INBOX_TOPICS, inboxAllowed, inboxTopicOf, sanitizeInboxPrefs, topicDefault, topicLocked } from "@/Domain/inbox/inboxTopics";
import type { InboxMessage } from "@/types/inboxTypes";

const msg = (category: string, kind?: string) => ({ category, kind } as unknown as InboxMessage);

describe("inboxTopicOf", () => {
  test("maps categories and kinds", () => {
    expect(inboxTopicOf(msg("manager_news"))).toBe("manager_news");
    expect(inboxTopicOf(msg("scouting", "report"))).toBe("scouting_reports");
    expect(inboxTopicOf(msg("scouting", "shortlist"))).toBe("scouting_alerts");
    expect(inboxTopicOf(msg("transfer", "bid"))).toBe("actions");
    expect(inboxTopicOf(msg("transfer", "loan_back"))).toBe("transfer_news");
    expect(inboxTopicOf(msg("player", "talk"))).toBe("actions");
    expect(inboxTopicOf(msg("season", "negative_balance"))).toBe("actions");
    expect(inboxTopicOf(msg("retirement", "reborn"))).toBe("actions");
    expect(inboxTopicOf(msg("retirement", "retired"))).toBe("retirement");
  });
  test("actions, transfer news and contracts follow the spec table", () => {
    expect(inboxTopicOf(msg("transfer", "loan_bid"))).toBe("actions");
    expect(inboxTopicOf(msg("transfer", "rival_bid"))).toBe("actions");
    expect(inboxTopicOf(msg("transfer", "pre_contract"))).toBe("transfer_news");
    expect(inboxTopicOf(msg("transfer", "window_open"))).toBe("transfer_news");
    expect(inboxTopicOf(msg("board", "contract_offer"))).toBe("actions");
    expect(inboxTopicOf(msg("job", "offer"))).toBe("actions");
    expect(inboxTopicOf(msg("contract", "expiring"))).toBe("contracts");
    expect(inboxTopicOf(msg("contract", "released"))).toBe("contracts");
    expect(inboxTopicOf(msg("scouting", "prospect"))).toBe("scouting_alerts");
    expect(inboxTopicOf(msg("scouting", "gem"))).toBe("scouting_reports");
  });
});

describe("prefs", () => {
  test("defaults: manager news and scouting reports off, the rest on", () => {
    expect(topicDefault("manager_news")).toBe(false);
    expect(topicDefault("scouting_reports")).toBe(false);
    for (const t of INBOX_TOPICS.filter((x) => x !== "manager_news" && x !== "scouting_reports")) expect(topicDefault(t)).toBe(true);
  });
  test("actions can never be switched off", () => {
    expect(topicLocked("actions")).toBe(true);
    expect(inboxAllowed(msg("transfer", "bid"), { actions: false })).toBe(true);
  });
  test("a switched-off topic is dropped, a default-off topic too", () => {
    expect(inboxAllowed(msg("injury", "injured"), { injuries: false })).toBe(false);
    expect(inboxAllowed(msg("manager_news"), {})).toBe(false);
    expect(inboxAllowed(msg("manager_news"), { manager_news: true })).toBe(true);
  });
  test("sanitize rejects unknown topics and locked ones", () => {
    expect(() => sanitizeInboxPrefs({ nope: true })).toThrow();
    expect(() => sanitizeInboxPrefs({ actions: false })).toThrow();
    expect(() => sanitizeInboxPrefs({ injuries: "no" })).toThrow();
    expect(() => sanitizeInboxPrefs([])).toThrow();
    expect(sanitizeInboxPrefs({ injuries: false })).toEqual({ injuries: false });
  });
});
