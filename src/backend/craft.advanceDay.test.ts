import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { soloSeatId } from "@/backend/testing/seatFixtures";
import { MATERIALS } from "@/Domain/craft/craftConfig";
import { addMaterials, componentTotal } from "@/Domain/craft/stock";
import { enqueue, newCraft } from "@/Domain/craft/workshop";
import type { CraftStock } from "@/types/craftTypes";
import type { FacilityInboxMessage } from "@/types/inboxTypes";
import type { Squad } from "@/types/playerTypes";

/** The workshop in the day pipeline (spec 2026-11-18-club-craft): the board's monthly materials and the queue. */
describe("craft in advanceOneDay", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  const human = async () => (await saveService.getSquadById(saveId, "33"))!;
  const writeHuman = async (squad: Squad) => {
    const entry = (await saveService.getSquadIndex(saveId)).byId("33")!;
    await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem, squad);
  };
  const materialUnits = (s: CraftStock) => MATERIALS.reduce((n, m) => n + s.materials[m].standard + s.materials[m].good, 0);

  test("the 1st of the month brings the board's materials and the queue finishes on its day", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const seatId = await soloSeatId(saveId);
    await saveService.updateSeat(saveId, seatId, { sackingEnabled: false });
    const seat = (await saveService.getSeat(saveId, seatId))!;
    await saveService.updateSeat(saveId, seatId, { board: { ...seat.board!, board: 85 } });
    await saveService.updateMeta(saveId, { currentDate: "2026-10-31" });

    const squad = await human();
    let craft = { ...newCraft(), stock: addMaterials(newCraft().stock, "standard", { steel: 15, concrete: 5 }) };
    const r = enqueue(craft, { component: "beam", qty: 5 }, { saveId, foremanStars: 3, foremanSpeed: 1 });
    if ("error" in r) throw new Error(r.error);
    craft = r.craft;
    await writeHuman({ ...squad, facilities: { ...squad.facilities!, craft } });
    const before = materialUnits(craft.stock);

    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true); // 2026-10-31
    expect((await human()).facilities!.craft!.queue[0]!.startedOn).toBe("2026-10-31");
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true); // 2026-11-01
    const first = (await human()).facilities!.craft!;
    expect(first.allowanceMonth).toBe("2026-11");
    expect(materialUnits(first.stock)).toBeGreaterThan(before);

    for (let d = 0; d < 6 && (await human()).facilities!.craft!.queue.length > 0; d++) {
      expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    }
    const done = (await human()).facilities!.craft!;
    expect(done.queue).toEqual([]);
    expect(componentTotal(done.stock, "beam")).toBe(5);

    const news = (await saveService.getInbox(saveId, seatId)).filter((m): m is FacilityInboxMessage => m.category === "facilities");
    expect(news.some((m) => m.kind === "craft_allowance" && (m.cost ?? 0) > 0)).toBe(true);
    expect(news.some((m) => m.kind === "craft_done" && m.components?.beam === 5)).toBe(true);
  }, 300_000);
});
