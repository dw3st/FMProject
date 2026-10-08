import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { FACILITY_ITEMS, conditionOf, wearFor } from "@/Domain/facilities/facilityItems";
import { matchPitchCondition } from "@/Domain/facilities/pitch";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { FacilityInboxMessage } from "@/types/inboxTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * Living facilities in the day pipeline (`docs/superpowers/specs/2026-10-08-living-facilities-design.md`):
 * the human club's items wear every day, crossing 40% / 15% sends `worn` / `condemned`, every match is
 * played on the home club's pitch (human: its stadium pitch; AI: tier × season), and an unemployed
 * manager has nothing to wear.
 */
describe("facilities in advanceOneDay", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  const human = async () => (await saveService.getSquadById(saveId, "33"))!;
  const writeHuman = async (squad: Squad) => {
    const entry = (await saveService.getSquadIndex(saveId)).byId("33")!;
    await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem, squad);
  };
  const facilityNews = async () => (await saveService.getInbox(saveId))
    .filter((m): m is FacilityInboxMessage => m.category === "facilities");

  test("wear, warnings, the pitch of every match, nothing when unemployed", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    // Sacking disabled for the 30 days (a bad start must not end the test early).
    await saveService.updateMeta(saveId, { sackingEnabled: false });

    const start = (await human()).facilities!;
    let humanHomeChecked = false;
    let aiHomeChecked = false;
    for (let d = 0; d < 30; d++) {
      const m = (await saveService.getMeta(saveId))!;
      const date = m.currentDate!;
      // Pitch conditions expected today, from the squads before the day runs.
      const before = await human();
      const out = await advanceOneDay(saveService, saveId);
      expect(out.ok).toBe(true);
      const log = await saveService.getDayLog(saveId, date);
      const matches = (log?.events ?? []).filter((e): e is MatchEvent => (e as MatchEvent).kind === "match");
      for (const e of matches) {
        expect(e.pitchCondition).toBeGreaterThanOrEqual(0);
        expect(e.pitchCondition).toBeLessThanOrEqual(100);
        if (e.home === "33" && !humanHomeChecked) {
          expect(e.pitchCondition!).toBeCloseTo(conditionOf(before.facilities!.items.stadiumPitch), 6);
          humanHomeChecked = true;
        }
        if (e.home !== "33" && e.competition === "premier_league" && !aiHomeChecked) {
          const home = (await saveService.getSquadById(saveId, e.home))!;
          const window = (m.activeLeagues ?? []).find((l) => l.leagueSlug === "premier_league");
          expect(e.pitchCondition!).toBeCloseTo(matchPitchCondition(home, {}, window, date), 6);
          expect(home.facilities).toBeUndefined();
          aiHomeChecked = true;
        }
      }
    }
    expect(humanHomeChecked).toBe(true);
    expect(aiHomeChecked).toBe(true);

    // Every item wore (none went up) and stays in 0..100.
    const after = (await human()).facilities!;
    for (const id of FACILITY_ITEMS) {
      const c = conditionOf(after.items[id]);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(100);
      expect(c).toBeLessThan(conditionOf(start.items[id]));
    }

    // Stadium pitch just above 40%: the next day sends `worn`.
    let sq = await human();
    await writeHuman({
      ...sq, facilities: { ...sq.facilities!, items: { ...sq.facilities!.items, stadiumPitch: { level: 6, wear: wearFor(40.05) } } },
    });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const worn = (await facilityNews()).filter((n) => n.kind === "worn");
    expect(worn.some((n) => n.item === "stadiumPitch")).toBe(true);
    expect((await human()).facilities!.items.stadiumPitch.alert).toBe(40);

    // Just above 15% (already warned at 40%): the next day condemns it.
    sq = await human();
    await writeHuman({
      ...sq, facilities: { ...sq.facilities!, items: { ...sq.facilities!.items, stadiumPitch: { level: 6, wear: wearFor(15.02), alert: 40 } } },
    });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    expect((await facilityNews()).some((n) => n.kind === "condemned" && n.item === "stadiumPitch")).toBe(true);
    expect((await human()).facilities!.items.stadiumPitch.condemned).toBe(true);

    // Sacked: the club becomes AI without facilities; the next days wear nothing and send nothing.
    const m2 = (await saveService.getMeta(saveId))!;
    await saveService.updateMeta(saveId, { sackingEnabled: true, board: { ...m2.board!, board: 5 } });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    expect((await saveService.getMeta(saveId))!.unemployed).toBeDefined();
    expect((await human()).facilities).toBeUndefined();
    const newsBefore = (await facilityNews()).length;
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    expect((await facilityNews()).length).toBe(newsBefore);
  }, 300_000);
});
