import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { devAutoLogin } from "@/backend/auth/AuthService";

const isMonday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

describe("development history in the day advance (12.19)", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("a Monday snapshots the human club's OVRs; AI clubs get nothing", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user } = devAutoLogin("devhistory-day@test.local");
    await ownSolo(saveId, user.id);
    let monday = "";
    for (let i = 0; i < 8; i++) {
      const date = (await saveService.getMeta(saveId))!.currentDate!;
      const out = await advanceOneDay(saveService, saveId, {});
      expect(out.ok).toBe(true);
      if (isMonday(date)) { monday = date; break; }
    }
    expect(monday).not.toBe("");
    const human = await saveService.getSquadById(saveId, "33");
    expect(human!.players.every((p) => p.devHistory?.at(-1)?.date === monday)).toBe(true);
    for (const p of human!.players) {
      for (const e of p.devLog ?? []) expect(["match", "training", "age"]).toContain(e.source);
    }
    const ai = await saveService.getSquadById(saveId, "40");
    expect(ai!.players.every((p) => p.devHistory === undefined && p.devLog === undefined)).toBe(true);
  }, 300_000);
});
