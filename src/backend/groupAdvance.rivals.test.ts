import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { runBufferedDay } from "@/backend/advanceDay";
import { kickWorld, waitWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { addDays } from "@/Domain/dates";
import type { ServerEvent } from "@/types/socialTypes";

const D = "2027-03-10";
const created: string[] = [];
afterAll(async () => {
  for (const id of created) { await waitWorld(id); deleteSaveMembers(id); await saveService.deleteSave(id); }
}, 60_000);

describe("group advance: rivals results", () => {
  test("after a day every member gets world_results and the feed has the games", async () => {
    const id = await fakeWorld({ seatIds: ["a", "b"], date: D, seats: { a: { readyUntil: "2027-03-11" }, b: { readyUntil: "2027-03-11" } } });
    created.push(id);
    const ua = makeUser(uniqueNick());
    const ub = makeUser(uniqueNick());
    addSaveMember(id, ua.id, "a", "owner");
    addSaveMember(id, ub.id, "b", "member");
    const events: { userId: string; event: ServerEvent }[] = [];
    const deps: GroupAdvanceDeps = {
      service: saveService,
      now: () => Date.now(),
      notify: (userId, event) => events.push({ userId, event }),
      matchDates: async () => [],
      matchOn: async () => null,
      runDay: async (saveId, _recs, beforeFlush) => {
        const date = (await saveService.getMeta(saveId))!.currentDate!;
        const outcome = {
          ok: true as const, seats: {},
          payload: {
            newDate: addDays(date, 1),
            events: [{ kind: "match", fixtureId: "f1", competition: "premier_league", round: 1, home: "club-a", away: "club-b",
              score: { home: 0, away: 3 }, playerNames: {}, goals: [] }],
          },
        };
        // Like the real day: the feed is written by the hook before the meta.
        await beforeFlush?.(saveService, outcome);
        await saveService.updateMeta(saveId, { currentDate: addDays(date, 1) });
        return outcome;
      },
    };
    await kickWorld(id, deps);
    const results = events.filter((e) => e.event.type === "world_results");
    expect(new Set(results.map((e) => e.userId))).toEqual(new Set([ua.id, ub.id]));
    const ev = results[0]!.event as Extract<ServerEvent, { type: "world_results" }>;
    expect(ev.results.map((r) => [r.seatId, r.score.for, r.score.against])).toEqual([["a", 0, 3], ["b", 3, 0]]);
    expect((await saveService.getRivalsFeed(id)).map((r) => r.seatId).sort()).toEqual(["a", "b"]);
  });

  test("the day running clears the live scores of that day", async () => {
    const { acceptLiveScore, liveScoresOf, setLiveResolver, resetLiveScores } = await import("@/backend/rivals/liveScores");
    const id = await fakeWorld({ seatIds: ["a", "b"], date: D, seats: { a: { readyUntil: "2027-03-11" }, b: { readyUntil: "2027-03-11" } } });
    created.push(id);
    const ua = makeUser(uniqueNick());
    const ub = makeUser(uniqueNick());
    addSaveMember(id, ua.id, "a", "owner");
    addSaveMember(id, ub.id, "b", "member");
    setLiveResolver(async () => ({
      base: { seatId: "a", nickname: "a", clubId: "club-a", clubName: "A", opponentId: "x", opponentName: "X", home: true, fixtureId: "f1", date: D },
      scorers: [],
    }));
    await acceptLiveScore(ua.id, { saveId: id, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, () => {});
    expect(liveScoresOf(id)).toHaveLength(1);
    const notified: ServerEvent[] = [];
    await kickWorld(id, {
      service: saveService, now: () => Date.now(), notify: (_u, e) => notified.push(e),
      matchDates: async () => [], matchOn: async () => null,
      runDay: async (saveId) => {
        const date = (await saveService.getMeta(saveId))!.currentDate!;
        await saveService.updateMeta(saveId, { currentDate: addDays(date, 1) });
        return { ok: true, seats: {}, payload: { newDate: addDays(date, 1) } };
      },
    });
    expect(liveScoresOf(id)).toEqual([]);
    expect(notified).toContainEqual({ type: "friend_live", saveId: id, seatId: "a", live: null });
    resetLiveScores();
  });

  test("the feed is part of the day's write: a failing feed write leaves the day (and the feed) unwritten", async () => {
    const id = await fakeWorld({ seatIds: ["a"], date: D });
    created.push(id);
    const row = {
      id: `${D}:premier_league:f1:a`, date: D, seatId: "a", nickname: "a", clubId: "club-a", clubName: "A",
      opponentId: "club-x", opponentName: "X", home: true, competition: "premier_league", fixtureId: "f1",
      score: { for: 1, against: 0 }, situations: ["win"],
    } as unknown as import("@/types/rivalsTypes").SeatResult;
    // Before the fix the feed was written after the flush: a crash between the two lost the day's results.
    const failed = await runBufferedDay(id, {}, {}, async (day) => {
      await day.writeRivalsFeed(id, [row]);
      throw new Error("disk full");
    });
    expect(failed.ok).toBe(false);
    expect((await saveService.getMeta(id))!.currentDate).toBe(D);
    expect(await saveService.getRivalsFeed(id)).toEqual([]);
    const ran = await runBufferedDay(id, {}, {}, async (day) => { await day.writeRivalsFeed(id, [row]); });
    expect(ran.ok).toBe(true);
    expect((await saveService.getMeta(id))!.currentDate).toBe(addDays(D, 1));
    expect((await saveService.getRivalsFeed(id)).map((r) => r.id)).toEqual([row.id]);
  }, 60_000);
});
