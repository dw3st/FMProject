import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { devAutoLogin } from "@/backend/auth/AuthService";

const isMonday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

describe("standing bars in the day advance (9.2)", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("a Monday writes the bars to every squad, the human club included", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user } = devAutoLogin("standing-day@test.local");
    await ownSolo(saveId, user.id);
    for (let i = 0; i < 8; i++) {
      const date = (await saveService.getMeta(saveId))!.currentDate!;
      const out = await advanceOneDay(saveService, saveId, {});
      expect(out.ok).toBe(true);
      if (isMonday(date)) break;
    }
    const human = await saveService.getSquadById(saveId, "33");
    expect(human!.players.every((p) => p.standing !== undefined)).toBe(true);
    const ai = await saveService.getSquadById(saveId, "40");
    expect(ai!.players.some((p) => p.standing && p.standing.club >= 6)).toBe(true);
  }, 300_000);
});
