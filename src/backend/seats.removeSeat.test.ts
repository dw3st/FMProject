import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat, removeSeat, SeatError } from "@/backend/seats";
import { seatManagerId } from "@/Domain/seats/seats";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

describe("removeSeat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("the club goes back to the AI with an interim and a vacancy; the seat's files and member row go", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await ownSolo(meta.id, devAutoLogin("rmseat-owner@test.local").user.id);
    const friend = devAutoLogin("rmseat-friend@test.local");
    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId;
    const b = await addSeat(meta.id, { userId: friend.user.id, clubId: clubB, manager: { name: "Bia", nationalityIso: "br", backgroundId: "analyst" } });

    const removed = await removeSeat(meta.id, b.seatId);
    expect(removed).toMatchObject({ userId: friend.user.id, managerName: "Bia", clubId: clubB, leagueSlug: "premier_league" });

    const world = (await saveService.getMeta(meta.id))!;
    expect(world.seats).toEqual([meta.seatId]);
    expect(world.mode).toBe("multi");
    expect(world.managerVacancies?.[clubB]?.since).toBe(world.currentDate);
    expect(memberOf(meta.id, friend.user.id)).toBeNull();
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${meta.id}/seats/${b.seatId}/seat.json`).exists()).toBe(false);
    expect([...(await saveService.humanClubIds(meta.id))]).toEqual(["33"]);

    const squad = (await saveService.getSquadById(meta.id, clubB))!;
    expect(squad.staff).toBeUndefined();
    expect(squad.financialTier).toBeDefined();

    const managers = await saveService.getManagers(meta.id);
    const me = managers.find((m) => m.id === seatManagerId(b.seatId))!;
    expect(me.squadId).toBe("");
    expect(me.clubs?.at(-1)).toMatchObject({ squadId: clubB, left: "left_world" });
    expect(managers.filter((m) => m.squadId === clubB).map((m) => !!m.interim)).toEqual([true]);

    let err: unknown = null;
    try { await removeSeat(meta.id, b.seatId); } catch (e) { err = e; }
    expect(err instanceof SeatError && err.code).toBe("notFound");
  }, 300_000);
});
