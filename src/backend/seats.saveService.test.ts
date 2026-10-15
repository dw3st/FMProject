import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";

describe("SaveService: world meta + seats", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("createSave writes a solo world with one seat and returns the merged meta", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    expect(meta.seatId).toBeTruthy();
    expect(meta.clubId).toBe("33");
    expect(meta.mode).toBe("solo");
    expect(meta.seats).toEqual([meta.seatId]);

    // On disk: the world meta has no club, the seat has it.
    const dal = new FileSystemDAL();
    const world = (await dal.readMeta(meta.id))!;
    expect("clubId" in world).toBe(false);
    expect("board" in world).toBe(false);
    expect(world.currentDate).toBe(meta.currentDate);
    const seat = (await dal.readSeat(meta.id, meta.seatId))!;
    expect(seat.clubId).toBe("33");
    expect(seat.board?.objective).toBeTruthy();
    expect(seat.managerContract?.squadId).toBe("33");

    // API of the seat
    expect((await saveService.getSeat(meta.id, meta.seatId))?.clubName).toBe("Test");
    expect((await saveService.getSeatMeta(meta.id, meta.seatId))?.clubId).toBe("33");
    expect((await saveService.listSeats(meta.id)).map((s) => s.seatId)).toEqual([meta.seatId]);
    expect([...(await saveService.humanClubIds(meta.id))]).toEqual(["33"]);
    expect(await saveService.seatOfClub(meta.id, "33")).toBe(meta.seatId);
    expect(await saveService.seatOfClub(meta.id, "34")).toBeNull();

    // updateSeat writes only the seat; the world meta keeps its date.
    await saveService.updateSeat(meta.id, meta.seatId, { formation: "4-4-2" });
    expect((await dal.readSeat(meta.id, meta.seatId))?.formation).toBe("4-4-2");
    expect((await saveService.getWorldMeta(meta.id))?.currentDate).toBe(meta.currentDate);
  }, 300_000);

  test("transition: getMeta merges the first seat and updateMeta splits the patch", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const merged = (await saveService.getMeta(meta.id))!;
    expect(merged.clubId).toBe("33");
    await saveService.updateMeta(meta.id, { training_intensity: "heavy", freeAgentsRetiredYear: 2030 });
    const dal = new FileSystemDAL();
    expect((await dal.readSeat(meta.id, meta.seatId))?.training_intensity).toBe("heavy");
    expect((await dal.readMeta(meta.id))?.freeAgentsRetiredYear).toBe(2030);
    expect("training_intensity" in (await dal.readMeta(meta.id))!).toBe(false);
  }, 300_000);
});
