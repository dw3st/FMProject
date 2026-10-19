import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { chatMessageView, listMessages } from "@/backend/social/socialStore";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { worldRoomId } from "@/Domain/social/rooms";
import { call, result } from "@/backend/rivals/rivalsTestUtils";

const created: string[] = [];
afterAll(async () => { for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id); } });
beforeEach(() => resetSocialRateLimit());

async function league(phase: "running" | "lobby" = "running") {
  const id = await fakeWorld({ seatIds: ["a", "b"], date: "2027-03-10", world: { phase } });
  created.push(id);
  const ua = makeUser(uniqueNick());
  const ub = makeUser(uniqueNick());
  addSaveMember(id, ua.id, "a", "owner");
  addSaveMember(id, ub.id, "b", "member");
  const rb = result("b", "2027-03-09", 0, 3);
  const ra = result("a", "2027-03-09", 2, 0);
  await saveService.writeRivalsFeed(id, [rb, ra]);
  return { id, ua, ub, rb, ra };
}

const PATH = "/api/worlds/:saveId/taunts";

describe("POST taunts", () => {
  test("a phrase of the result's situations goes to the world room with its meta", async () => {
    const { id, ua, rb } = await league();
    const res = await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "phrase", id: "home_loss_1" });
    expect(res.status).toBe(200);
    const rows = listMessages(worldRoomId(id), ua.id, { limit: 10 });
    expect(rows).toHaveLength(1);
    const view = chatMessageView(rows[0]!, ua.id);
    expect(view.taunt).toMatchObject({ kind: "phrase", id: "home_loss_1", target: "b", score: { for: 0, against: 3 } });
    expect(view.body).toContain("Club b 0–3 X");
  });

  test("a reaction to a result works; 400 self / invalidTaunt / invalidBody; 404 unknown target", async () => {
    const { id, ua, ra, rb } = await league();
    expect((await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "reaction", id: "laugh" })).status).toBe(200);
    const self = await call(PATH, "POST", id, ua.token, "", { target: { result: ra.id }, kind: "reaction", id: "fire" });
    expect([self.status, (await self.json()).error]).toEqual([400, "self"]);
    const wrong = await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "phrase", id: "big_win_1" });
    expect([wrong.status, (await wrong.json()).error]).toEqual([400, "invalidTaunt"]);
    expect((await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "phrase", id: "free text" })).status).toBe(400);
    expect((await call(PATH, "POST", id, ua.token, "", { target: {}, kind: "reaction", id: "fire" })).status).toBe(400);
    expect((await call(PATH, "POST", id, ua.token, "", { target: { result: "nope" }, kind: "reaction", id: "fire" })).status).toBe(404);
  });

  test("409 lobby, 404 stranger, 429 over the chat rate", async () => {
    const lobby = await league("lobby");
    expect((await call(PATH, "POST", lobby.id, lobby.ua.token, "", { target: { result: lobby.rb.id }, kind: "reaction", id: "fire" })).status).toBe(409);
    const { id, ua, rb } = await league();
    expect((await call(PATH, "POST", id, makeUser().token, "", { target: { result: rb.id }, kind: "reaction", id: "fire" })).status).toBe(404);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "reaction", id: "fire" })).status;
    expect(last).toBe(429);
  });
});
