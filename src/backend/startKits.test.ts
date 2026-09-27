import { describe, expect, test, afterAll } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { applyKit, listStartKits } from "@/backend/startKits";

describe("applyKit — wage factor preservation (H1)", () => {
  let saveId = "";

  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("every squad keeps the fresh save's wageFactor after a kit overwrites it", async () => {
    const kits = await listStartKits();
    expect(kits.length).toBeGreaterThan(0); // this test needs a real kit on disk

    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const before = await saveService.listSquadFiles(saveId);
    expect(before.length).toBeGreaterThan(0);
    const preKit = new Map(before.map((f) => [f.squad.id, { factor: f.squad.wageFactor, basis: f.squad.wageRevenueBasis }]));
    // Sanity: createSave computed a real, numeric factor + basis for every squad — otherwise this
    // test can't tell the fix apart from a no-op.
    for (const { factor, basis } of preKit.values()) {
      expect(typeof factor).toBe("number");
      expect(typeof basis).toBe("number");
    }

    await applyKit(kits[0]!, saveId);

    const after = await saveService.listSquadFiles(saveId);
    expect(after.length).toBeGreaterThan(0);
    for (const f of after) {
      const pre = preKit.get(f.squad.id)!;
      expect(typeof f.squad.wageFactor).toBe("number");
      expect(f.squad.wageFactor).toBe(pre.factor);
      expect(f.squad.wageRevenueBasis).toBe(pre.basis);
    }
  }, 300_000);
});
