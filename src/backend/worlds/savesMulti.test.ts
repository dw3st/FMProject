import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld } from "@/backend/worlds/worldTestUtils";
import { worldCodeOf } from "@/backend/worlds/worldStore";
import type { ServerEvent } from "@/types/socialTypes";

beforeEach(() => resetRealtime());

describe("multiplayer saves", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id).catch(() => {}); }, 120_000);

  test("mode multi: lobby, invite code, not presimulated; the list shows members; delete warns the others", async () => {
    const owner = devAutoLogin("sm-owner@test.local");
    const res = await createMultiWorld(owner.session.token);
    expect(res.status).toBe(201);
    const saveId = res.json.id as string;
    created.push(saveId);
    expect(res.json.mode).toBe("multi");
    expect(res.json.world).toMatchObject({ phase: "lobby", deadlineHours: 24 });
    expect(worldCodeOf(saveId)).toBe(res.json.world.inviteCode);
    expect((await saveService.getMeta(saveId))?.presimulated).toBeUndefined();

    expect((await callApi("POST", "/api/saves", owner.session.token, { body: { ...res.json, mode: "duo" } })).status).toBe(400);

    const friend = devAutoLogin("sm-friend@test.local");
    const clubB = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId;
    await addSeat(saveId, { userId: friend.user.id, clubId: clubB, manager: { name: "Bia", nationalityIso: "es", backgroundId: "analyst" } });
    const list = await callApi("GET", "/api/saves", friend.session.token);
    expect(list.json.find((s: { id: string }) => s.id === saveId)).toMatchObject({ mode: "multi", role: "member", members: 2 });

    const events: ServerEvent[] = [];
    onSocketOpen({ data: { userId: friend.user.id, session: "s", saveId: null, clubName: null }, send: (m: string) => events.push(JSON.parse(m)), close() {} } as SocialSocket);
    expect((await callApi("DELETE", "/api/saves/:id", friend.session.token, { params: { id: saveId } })).status).toBe(403);
    expect((await callApi("DELETE", "/api/saves/:id", owner.session.token, { params: { id: saveId } })).status).toBe(200);
    expect(events).toContainEqual({ type: "world_deleted", saveId });
    expect(worldCodeOf(saveId)).toBeNull();
  }, 600_000);
});
