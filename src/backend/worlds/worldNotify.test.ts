import { beforeEach, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import type { ServerEvent } from "@/types/socialTypes";

type FakeSocket = SocialSocket & { events: ServerEvent[] };
function fakeSocket(userId: string): FakeSocket {
  const events: ServerEvent[] = [];
  return { data: { userId, session: "s", saveId: null, clubName: null }, events, send(m: string) { events.push(JSON.parse(m)); }, close() {} } as FakeSocket;
}

beforeEach(() => resetRealtime());

test("notifyWorld reaches every member but the one left out, and nobody else", () => {
  const saveId = `w-${randomUUID()}`;
  const a = devAutoLogin(`wn-a-${randomUUID()}@test.local`).user;
  const b = devAutoLogin(`wn-b-${randomUUID()}@test.local`).user;
  const c = devAutoLogin(`wn-c-${randomUUID()}@test.local`).user;
  addSaveMember(saveId, a.id, "seat-a", "owner");
  addSaveMember(saveId, b.id, "seat-b", "member");
  const [wa, wb, wc] = [fakeSocket(a.id), fakeSocket(b.id), fakeSocket(c.id)];
  for (const w of [wa, wb, wc]) onSocketOpen(w);
  notifyWorld(saveId, { type: "world_members", saveId }, a.id);
  expect(wa.events).toEqual([]);
  expect(wb.events).toEqual([{ type: "world_members", saveId }]);
  expect(wc.events).toEqual([]);
});
