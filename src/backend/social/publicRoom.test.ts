import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { db } from "@/backend/db";
import { saveService } from "@/backend/SaveService";
import { setKickScheduler } from "@/backend/groupAdvance";
import { resetRealtime } from "@/backend/social/realtime";
import { callSocial } from "@/backend/social/socialRouteTestUtils";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { ensurePublicWorld } from "@/backend/worlds/publicWorld";
import { GAME_VERSION } from "@/Domain/saveVersion";

let saveId = "";

beforeAll(async () => {
  setKickScheduler(() => {});
  db.prepare("DELETE FROM public_editions").run();
  saveId = await ensurePublicWorld({ version: GAME_VERSION });
}, 600_000);

afterAll(async () => {
  setKickScheduler(null);
  await saveService.deleteSave(saveId).catch(() => {});
  db.prepare("DELETE FROM public_editions").run();
}, 120_000);

beforeEach(() => {
  resetRealtime();
  resetSocialRateLimit();
});

test("the public world's room refuses free text (part 5b); members still read it", async () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  addSaveMember(saveId, a.id, "seat-a", "member");
  addSaveMember(saveId, b.id, "seat-b", "member");
  const room = `world:${saveId}`;
  const sent = await callSocial("POST", "/api/social/rooms/:room/messages", a.token, { params: { room }, body: { body: "oi" } });
  expect(sent).toMatchObject({ status: 403, json: { error: "publicRoom" } });
  const read = await callSocial("GET", "/api/social/rooms/:room/messages", b.token, { params: { room } });
  expect(read.status).toBe(200);
  expect(read.json.messages).toEqual([]);
});
