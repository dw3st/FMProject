import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";

describe("createSave generates national cups", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("England cup exists with a drawn first stage", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 1,
    });
    saveId = meta.id;
    const cup = await saveService.getLeagueMeta(saveId, "cup_england");
    expect(cup?.kind).toBe("cup");
    expect(cup!.cup!.stages[0]!.drawn).toBe(true);
    const r1 = await saveService.getRound(saveId, "cup_england", 1);
    expect(r1!.fixtures.length).toBeGreaterThan(0);
    // cups are not league states
    expect((meta.activeLeagues ?? []).some((l) => l.leagueSlug.startsWith("cup_"))).toBe(false);
  }, 120_000);
});
