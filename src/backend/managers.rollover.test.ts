import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";

/**
 * Manager ranking at a country rollover (`.claude/rules/game/managers.md`): England is forced to
 * end today, the human club wins round 1 big, so it finishes first and its manager scores the
 * league title; promoted clubs' managers score the promotion; everyone rolled gets a season.
 */
describe("manager ranking at the rollover", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("createSave builds one manager per club; rollover credits league title, promotions and seasons", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
      manager: { name: "Zé Tester", nationalityIso: "br", backgroundId: "former-player" },
    });
    saveId = meta.id;
    const today = meta.currentDate!;

    const initial = await saveService.getManagers(saveId);
    const squads = await saveService.getAllSquads(saveId);
    expect(initial).toHaveLength(squads.length);
    expect(new Set(initial.map((m) => m.id)).size).toBe(initial.length);
    expect(new Set(initial.map((m) => m.squadId)).size).toBe(initial.length);
    const mine = initial.filter((m) => m.isPlayer);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: "Zé Tester", squadId: "33", points: 0 });

    // The human club's round-1 fixture is already won 9-0, so it tops the table at the rollover.
    const r1 = (await saveService.getRound(saveId, "premier_league", 1))!;
    await saveService.writeRound(saveId, "premier_league", 1, {
      ...r1,
      fixtures: r1.fixtures.map((f) => (f.home === "33" || f.away === "33"
        ? { ...f, played: true, result: f.home === "33" ? { home: 9, away: 0 } : { home: 0, away: 9 } }
        : f)),
    });
    const active = (meta.activeLeagues ?? []).map((l) =>
      l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l);
    await saveService.updateMeta(saveId, { activeLeagues: active });

    const index = await saveService.getSquadIndex(saveId);
    const championshipIds = new Set(index.inLeague("of_championship").map((t) => t.squadId));
    const plIds = index.inLeague("premier_league").map((t) => t.squadId);

    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);

    const after = await saveService.getManagers(saveId);
    const me = after.find((m) => m.isPlayer)!;
    expect(me.seasons).toBe(1);
    const league = me.titles.find((t) => t.kind === "league");
    expect(league?.competition).toBe("premier_league");
    expect(league!.points).toBeGreaterThanOrEqual(20);
    expect(league!.points).toBeLessThanOrEqual(120);
    expect(me.points).toBe(me.titles.reduce((s, t) => s + t.points, 0));
    // The country weight is cached once per country per season in the meta.
    const w = (await saveService.getMeta(saveId))!.managerWeights?.England;
    expect(w?.season).toBe(league!.season);
    expect(league!.points).toBe(Math.round(100 * w!.weight));

    // Every Premier League manager got a season; promoted Championship clubs scored 20.
    // (A club may sack its manager at the rollover, Etapa 25: the season goes to the one in charge.)
    for (const id of plIds) {
      expect(after.some((m) => m.seasons === 1 && (m.squadId === id || (m.clubs ?? []).some((c) => c.squadId === id && c.to === today)))).toBe(true);
    }
    const index2 = await saveService.getSquadIndex(saveId);
    const promoted = [...championshipIds].filter((id) => index2.byId(id)?.leagueSlug === "premier_league");
    expect(promoted.length).toBeGreaterThan(0);
    for (const id of promoted) {
      const m = after.find((x) => x.squadId === id)!;
      expect(m.titles.some((t) => t.kind === "promotion" && t.points === 20 && t.competition === "of_championship")).toBe(true);
    }
    expect(after.every((m) => m.points >= 0)).toBe(true);
  }, 120_000);
});
