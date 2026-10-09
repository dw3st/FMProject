/**
 * Registration lists in a real save (`.claude/rules/game/registration.md`): competitions of a club, first list,
 * frozen list with the deadline closed, AI refresh with it open, the human club's morning step.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import {
  humanRegistrationDay, matchRegistration, refreshAiRegistrations, registrationDayCtx,
} from "@/backend/registrationWorld";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import type { Squad } from "@/types/playerTypes";

const HUMAN = "33";

describe("registrationWorld", () => {
  let saveId = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const ctxOn = async (date?: string) => {
    const meta = (await saveService.getMeta(saveId))!;
    return registrationDayCtx(saveService, saveId, meta, await saveService.getSquadIndex(saveId), date);
  };

  test("competitions of a club: league, cup, maybe continental, never youth", async () => {
    const dctx = await ctxOn();
    const human = (await saveService.getSquadById(saveId, HUMAN))!;
    const infos = await dctx.infosFor(human, "premier_league");
    const slugs = infos.map((i) => i.slug);
    expect(slugs[0]).toBe("premier_league");
    expect(slugs).toContain("cup_england");
    expect(slugs.some(isYouthCompSlug)).toBe(false);
    expect(infos.find((i) => i.slug === "premier_league")!.rule.id).toBe("premier_league");
    expect(infos.find((i) => i.slug === "cup_england")!.rule.id).toBe("premier_league");
    for (const i of infos) expect(i.season.length).toBeGreaterThan(3);
    expect(await dctx.infoFor(human, "premier_league", "u21_england")).toBeNull();
  });

  test("first list on need, frozen when closed, AI refresh when open", async () => {
    const closed = await ctxOn("2027-03-10");
    const index = await saveService.getSquadIndex(saveId);
    const aiId = index.inLeague("premier_league").map((t) => t.squadId).find((id) => id !== HUMAN)!;
    const ai = (await saveService.getSquadById(saveId, aiId))!;
    const m = (await matchRegistration(closed, ai, "premier_league", "premier_league"))!;
    expect(m.changed).toBe(true);
    expect(m.reg.ids.size).toBeGreaterThanOrEqual(18);
    expect([...m.reg.ids].every((id) => ai.players.some((p) => p.id === id))).toBe(true);

    const extra = { ...ai.players[0]!, id: "reg_test_new", overallAvg: 9.5 };
    const signed: Squad = { ...m.squad, players: [...m.squad.players, extra] };
    expect(await refreshAiRegistrations(closed, [{ squad: signed, leagueSlug: "premier_league" }])).toEqual([]);
    const again = (await matchRegistration(closed, signed, "premier_league", "premier_league"))!;
    expect(again.changed).toBe(false);
    expect(again.reg.ids.has("reg_test_new")).toBe(false);

    const open = await ctxOn("2027-06-15");
    expect((await open.infoFor(signed, "premier_league", "premier_league"))!.status.open).toBe(true);
    const changed = await refreshAiRegistrations(open, [{ squad: signed, leagueSlug: "premier_league" }]);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.registrations!.premier_league!.ids).toContain("reg_test_new");
  });

  test("human morning step: lists for every competition", async () => {
    const dctx = await ctxOn();
    const human = (await saveService.getSquadById(saveId, HUMAN))!;
    const r = await humanRegistrationDay(dctx, human, "premier_league");
    expect(r.changed).toBe(true);
    expect(Object.keys(r.squad.registrations ?? {})).toContain("premier_league");
    expect(r.notices.some((n) => n.kind === "auto_list")).toBe(true);
    const again = await humanRegistrationDay(dctx, r.squad, "premier_league");
    expect(again.notices.filter((n) => n.kind === "auto_list")).toEqual([]);
  });
});
