import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers, listSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { acceptLiveScore, resetLiveScores, setLiveResolver } from "@/backend/rivals/liveScores";
import { call, result } from "@/backend/rivals/rivalsTestUtils";
import type { ResultsPage, RivalsView } from "@/types/rivalsTypes";

const created: string[] = [];
afterAll(async () => {
  resetLiveScores();
  for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id); }
});

async function league() {
  const id = await fakeWorld({ seatIds: ["a", "b"], date: "2027-03-10" });
  created.push(id);
  const ua = makeUser(uniqueNick());
  const ub = makeUser(uniqueNick());
  addSaveMember(id, ua.id, "a", "owner");
  addSaveMember(id, ub.id, "b", "member");
  await saveService.writeRivalsFeed(id, [result("b", "2027-03-09", 0, 3), result("a", "2027-03-09", 2, 0), result("b", "2027-03-08", 1, 1)]);
  return { id, ua, ub };
}

describe("rivals routes", () => {
  test("GET rivals: one row per member, form from the feed, live score", async () => {
    const { id, ua } = await league();
    setLiveResolver(async () => ({
      base: { seatId: "b", nickname: "b", clubId: "club-b", clubName: "Club b", opponentId: "x", opponentName: "X", home: true, fixtureId: "f", date: "2027-03-10" },
      scorers: [],
    }));
    const ub2 = listSaveMembers(id).find((m) => m.seatId === "b")!;
    await acceptLiveScore(ub2.userId, { saveId: id, fixtureId: "f", phase: "start", minute: 0, score: { for: 0, against: 0 } }, () => {});
    const res = await call("/api/worlds/:saveId/rivals", "GET", id, ua.token);
    expect(res.status).toBe(200);
    const view = (await res.json()) as RivalsView;
    const b = view.rows.find((r) => r.seatId === "b")!;
    expect(b.form).toEqual(["D", "L"]);
    expect(b.last?.score).toEqual({ for: 0, against: 3 });
    expect(b.live?.status).toBe("live");
    expect(view.rows.find((r) => r.seatId === "a")!.me).toBe(true);
    resetLiveScores();
  });

  test("GET results filters by seat and pages", async () => {
    const { id, ua } = await league();
    const res = await call("/api/worlds/:saveId/results", "GET", id, ua.token, "?seat=b&limit=1");
    const page = (await res.json()) as ResultsPage;
    expect(page.results.map((r) => r.seatId)).toEqual(["b"]);
    expect(page.hasMore).toBe(true);
    expect((await call("/api/worlds/:saveId/results", "GET", id, ua.token, "?limit=0")).status).toBe(400);
  });

  test("GET live lists the games in progress", async () => {
    const { id, ua } = await league();
    const res = await call("/api/worlds/:saveId/live", "GET", id, ua.token);
    expect(await res.json()).toEqual({ live: [] });
  });

  test("a stranger is 404; a solo save is 409", async () => {
    const { id } = await league();
    expect((await call("/api/worlds/:saveId/rivals", "GET", id, makeUser().token)).status).toBe(404);
    const solo = await fakeWorld({ seatIds: ["a"], date: "2027-03-10", world: null, mode: "solo" });
    created.push(solo);
    const u = makeUser(uniqueNick());
    addSaveMember(solo, u.id, "a", "owner");
    expect((await call("/api/worlds/:saveId/rivals", "GET", solo, u.token)).status).toBe(409);
  });
});
