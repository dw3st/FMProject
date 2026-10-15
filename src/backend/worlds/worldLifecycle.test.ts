import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { announceMemberChange, createWorldState, deleteWorld, worldView } from "@/backend/worlds/worldLifecycle";
import { worldCodeOf, worldIdByCode } from "@/backend/worlds/worldStore";

describe("world lifecycle", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("state, view, announcement and deletion", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
      manager: { name: "Ana", nationalityIso: "br", backgroundId: "analyst" },
    });
    created.push(meta.id);
    const owner = devAutoLogin("wl-owner@test.local");
    await ownSolo(meta.id, owner.user.id);
    const world = await createWorldState(meta.id, owner.user.id);
    expect(world).toMatchObject({ phase: "lobby", deadlineHours: 24, createdBy: owner.user.id });
    expect(worldIdByCode(world.inviteCode)).toBe(meta.id);
    expect((await saveService.getMeta(meta.id))?.mode).toBe("multi");

    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").find((e) => e.squadId !== "33")!;
    const b = await addSeat(meta.id, { userId: devAutoLogin("wl-friend@test.local").user.id, clubId: clubB.squadId, manager: { name: "Bia", nationalityIso: "es", backgroundId: "analyst" } });
    await announceMemberChange(meta.id, {
      seatId: b.seatId, event: "joined", managerName: "Bia", clubId: clubB.squadId, clubName: b.seat.clubName, leagueSlug: "premier_league",
    });
    const ownerInbox = await saveService.getInbox(meta.id, meta.seatId);
    expect(ownerInbox.some((m) => m.category === "world" && m.kind === "member_joined")).toBe(true);
    const friendInbox = await saveService.getInbox(meta.id, b.seatId);
    expect(friendInbox.some((m) => m.category === "world")).toBe(false);
    const news = await saveService.getNewsMonth(meta.id, meta.currentDate!.slice(0, 7));
    expect(news.some((n) => n.kind === "world_member")).toBe(true);

    const view = (await worldView(meta.id, { seatId: meta.seatId, role: "owner" }))!;
    expect(view).toMatchObject({ phase: "lobby", max: 8, myRole: "owner", mySeatId: meta.seatId });
    expect(view.members.map((m) => [m.managerName, m.role])).toEqual([["Ana", "owner"], ["Bia", "member"]]);

    await deleteWorld(meta.id, owner.user.id);
    expect(await saveService.getMeta(meta.id)).toBeNull();
    expect(listSaveMembers(meta.id)).toEqual([]);
    expect(worldCodeOf(meta.id)).toBeNull();
  }, 300_000);
});
