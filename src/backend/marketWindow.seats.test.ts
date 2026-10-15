import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { loadWindowContext, seatWindowRef } from "@/backend/marketWindowWorld";

describe("transfer windows per seat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("the seat's window follows its club's country, with the career grace", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const index = await saveService.getSquadIndex(meta.id);
    const w = await loadWindowContext(meta, index, meta.currentDate, [seatWindowRef(meta)]);
    const mine = w.seat(meta.seatId);
    expect(mine.country).toBe(w.countryOfLeague("premier_league"));
    // new career: 30-day arrival grace (`transfer-windows.md`)
    expect(mine.today.open).toBe(true);
    expect(w.seat("not-a-seat").today.open).toBe(true);
  }, 300_000);
});
