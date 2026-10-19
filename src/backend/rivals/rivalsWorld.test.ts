import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { appendRivalsFeed, recordDayResults } from "@/backend/rivals/rivalsWorld";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id); }
});

const day = [{ kind: "match", fixtureId: "f1", competition: "premier_league", round: 1, home: "club-a", away: "club-b",
  score: { home: 2, away: 0 }, playerNames: {}, goals: [] }];

describe("rivals world", () => {
  test("records the human clubs' games once, with the nicknames", async () => {
    // Seat c has no club (unemployed): its games never enter the feed.
    const id = await fakeWorld({ seatIds: ["a", "b", "c"], date: "2027-03-10", seats: { c: { clubId: "" } } });
    created.push(id);
    const ua = makeUser(uniqueNick());
    addSaveMember(id, ua.id, "a", "owner");
    const seats = (await saveService.listSeats(id)).map(({ seatId, seat }) => ({ seatId, seat }));
    const first = await recordDayResults(saveService, id, "2027-03-10", day, seats);
    expect(first.map((r) => [r.seatId, r.nickname, r.score.for])).toEqual([["a", ua.nickname!, 2], ["b", "Manager b", 0]]);
    const again = await recordDayResults(saveService, id, "2027-03-10", day, seats);
    expect(again).toHaveLength(2);
    expect(await saveService.getRivalsFeed(id)).toHaveLength(2);
  });

  test("appendRivalsFeed with nothing writes nothing", async () => {
    const id = await fakeWorld({ seatIds: ["a"], date: "2027-03-10" });
    created.push(id);
    await appendRivalsFeed(saveService, id, []);
    expect(await saveService.getRivalsFeed(id)).toEqual([]);
  });
});
