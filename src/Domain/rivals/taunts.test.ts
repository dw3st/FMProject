import { describe, expect, test } from "bun:test";
import {
  ALL_TAUNT_IDS, REACTIONS, TAUNT_GROUPS, TAUNTS, isReaction, isTauntFor, liveGroups, parseTauntMeta,
  tauntFallbackBody, tauntMeta, tauntTone, tauntsFor,
} from "@/Domain/rivals/taunts";
import type { LiveScoreView, SeatResult } from "@/types/rivalsTypes";

describe("taunt catalog", () => {
  test("every group has phrases and ids are unique", () => {
    for (const group of TAUNT_GROUPS) expect(TAUNTS[group].length, group).toBeGreaterThanOrEqual(3);
    expect(new Set(ALL_TAUNT_IDS).size).toBe(ALL_TAUNT_IDS.length);
  });
  test("tauntsFor keeps the specific situations first, without duplicates", () => {
    const ids = tauntsFor(["loss", "big_loss", "home_loss"]);
    expect(ids[0]!.startsWith("big_loss_")).toBe(true);
    expect(ids).toContain("loss_1");
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("a phrase only belongs to the target's situations", () => {
    expect(isTauntFor("home_loss_1", ["loss", "home_loss"])).toBe(true);
    expect(isTauntFor("big_win_1", ["loss", "home_loss"])).toBe(false);
    expect(isTauntFor("nope", ["loss"])).toBe(false);
  });
  test("reactions", () => {
    expect(REACTIONS).toEqual(["applause", "fire", "laugh", "sorry"]);
    expect(isReaction("fire")).toBe(true);
    expect(isReaction("heart")).toBe(false);
  });
  test("live groups follow the friend's last goal", () => {
    const live = { lastGoal: null } as unknown as LiveScoreView;
    expect(liveGroups(live)).toEqual([]);
    expect(liveGroups({ ...live, lastGoal: { minute: 10, side: "against", scorer: null } })).toEqual(["live_goal_against"]);
    expect(liveGroups({ ...live, lastGoal: { minute: 10, side: "for", scorer: null } })).toEqual(["live_goal_for"]);
  });
});

describe("taunt meta", () => {
  const result = {
    id: "r", date: "2027-03-10", seatId: "b", nickname: "fabio", clubId: "c1", clubName: "Vasco", opponentId: "c2",
    opponentName: "Bahia", home: true, competition: "x", score: { for: 0, against: 3 }, goals: [], situations: ["loss"],
  } as SeatResult;
  test("from a result; round trip; fallback body", () => {
    const meta = tauntMeta({ kind: "phrase", id: "big_loss_1", from: result });
    expect(meta).toEqual({
      kind: "phrase", id: "big_loss_1", target: "fabio", clubId: "c1", clubName: "Vasco", opponentName: "Bahia",
      home: true, score: { for: 0, against: 3 },
    });
    expect(parseTauntMeta(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
    expect(tauntFallbackBody(meta, "Three on the back.")).toBe("Three on the back. · Vasco 0–3 Bahia");
    expect(tauntFallbackBody({ ...meta, kind: "reaction", id: "laugh" }, null)).toBe("laughs · Vasco 0–3 Bahia");
  });
  test("from a live score carries live and the minute", () => {
    const live = { ...result, status: "live", minute: 67, lastGoal: null, events: 3, updatedAt: 1, fixtureId: "f" } as unknown as LiveScoreView;
    expect(tauntMeta({ kind: "reaction", id: "fire", from: live, live: true })).toMatchObject({ live: true, minute: 67 });
  });
  test("parseTauntMeta refuses junk", () => {
    expect(parseTauntMeta(null)).toBeNull();
    expect(parseTauntMeta({ kind: "phrase", id: "x" })).toBeNull();
    expect(parseTauntMeta({ kind: "shout", id: "x", target: "a", clubId: "c", clubName: "C", opponentName: "O", home: true, score: { for: 1, against: 0 } })).toBeNull();
  });
});

test("phrase tone: cheering a win, teasing a loss, neutral on a draw", () => {
  expect(tauntTone("big_win_2")).toBe("cheer");
  expect(tauntTone("blown_lead_1")).toBe("tease");
  expect(tauntTone("draw_3")).toBe("neutral");
});
