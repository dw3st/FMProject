import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import {
  acceptLiveScore, clearLiveForDay, liveScoresOf, resetLiveScores, setLiveResolver, sweepLiveScores,
} from "@/backend/rivals/liveScores";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { ServerEvent } from "@/types/socialTypes";

const saveId = randomUUID();
const a = makeUser(uniqueNick());
const b = makeUser(uniqueNick());
addSaveMember(saveId, a.id, "a", "owner");
addSaveMember(saveId, b.id, "b", "member");

function setup() {
  const sent: { userId: string; event: ServerEvent }[] = [];
  const notify = (userId: string, event: ServerEvent) => sent.push({ userId, event });
  setLiveResolver(async (sid, userId, fixtureId) => (sid === saveId && userId === a.id && fixtureId === "f1"
    ? {
      base: { seatId: "a", nickname: a.nickname!, clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia",
        home: true, fixtureId: "f1", date: "2027-03-10" },
      scorers: ["Silva"],
    }
    : null));
  return { sent, notify };
}

afterEach(() => resetLiveScores());

describe("live scores", () => {
  test("a member's frame goes to the other members, with goal on a goal", async () => {
    const { sent, notify } = setup();
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(true);
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: "Silva" }, notify, 2)).toBe(true);
    expect(sent.every((s) => s.userId === b.id)).toBe(true);
    const last = sent.at(-1)!.event as Extract<ServerEvent, { type: "friend_live" }>;
    expect(last).toMatchObject({ type: "friend_live", saveId, seatId: "a", goal: true });
    expect(last.live?.lastGoal).toEqual({ minute: 12, side: "for", scorer: "Silva" });
    expect(liveScoresOf(saveId, 3).map((l) => l.score.for)).toEqual([1]);
  });

  test("a stranger, another fixture or a falling score are ignored", async () => {
    const { sent, notify } = setup();
    expect(await acceptLiveScore(b.id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(false);
    expect(await acceptLiveScore(makeUser().id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(false);
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "zz", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(false);
    await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "goal", minute: 5, score: { for: 1, against: 0 } }, notify, 1);
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "half", minute: 45, score: { for: 0, against: 0 } }, notify, 2)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  test("a resumed match (start at the current minute and score) rebuilds a dropped game", async () => {
    const { sent, notify } = setup();
    await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "goal", minute: 20, score: { for: 1, against: 0 } }, notify, 0);
    sweepLiveScores(RIVALS.LIVE_DROP_MS + 1, notify);
    expect(liveScoresOf(saveId, RIVALS.LIVE_DROP_MS + 1)).toEqual([]);
    // Before the fix only the next goal brought it back: a clock frame alone is refused on a dropped game.
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "minute", minute: 60, score: { for: 1, against: 0 } }, notify, RIVALS.LIVE_DROP_MS + 2)).toBe(false);
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "start", minute: 60, score: { for: 1, against: 0 } }, notify, RIVALS.LIVE_DROP_MS + 2)).toBe(true);
    expect(liveScoresOf(saveId, RIVALS.LIVE_DROP_MS + 3)[0]).toMatchObject({ status: "live", minute: 60, score: { for: 1, against: 0 } });
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "minute", minute: 65, score: { for: 1, against: 0 } }, notify, RIVALS.LIVE_DROP_MS + 4)).toBe(true);
    expect(sent.at(-1)!.userId).toBe(b.id);
  });

  test("the day running clears the game; the sweep marks stale then drops", async () => {
    const { sent, notify } = setup();
    await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 0);
    sweepLiveScores(RIVALS.LIVE_STALE_MS + 1, notify);
    expect(liveScoresOf(saveId, RIVALS.LIVE_STALE_MS + 1)[0]!.status).toBe("stale");
    clearLiveForDay(saveId, "2027-03-10", notify);
    expect(liveScoresOf(saveId, RIVALS.LIVE_STALE_MS + 2)).toEqual([]);
    expect(sent.at(-1)!.event).toEqual({ type: "friend_live", saveId, seatId: "a", live: null });
  });
});
