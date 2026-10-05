import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { advanceOneDay, getLeagueData, getPyramids } from "@/backend/advanceDay";
import { createAiManagerDesk, createManagerTracker } from "@/backend/managerWorld";
import { getCountries } from "@/backend/continentalWorld";
import { managerInvariantBreaks } from "@/Domain/managers/aiManagers";

/**
 * AI managers on a real save (`.claude/rules/game/managers.md` → "Técnicos da IA"): a sacking opens a
 * vacancy with an interim, the vacancy hires on its day, one manager per club throughout; the day
 * advance writes the vacancies and the human manager's weekly wage.
 */
describe("AI managers: vacancies and hirings on a save", () => {
  let meta: SaveMeta;
  let saveId = "";

  beforeAll(async () => {
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
  }, 120_000);

  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("every manager starts with a passage; a sacked club gets an interim, then hires", async () => {
    const start = await saveService.getManagers(saveId);
    expect(start.every((m) => (m.clubs ?? []).length === 1)).toBe(true);
    const index = await saveService.getSquadIndex(saveId);
    const club = index.inLeague("premier_league").find((t) => t.squadId !== meta.clubId)!.squadId;
    const date = meta.currentDate!;

    const tracker = createManagerTracker({ service: saveService, saveId, getIndex: () => index, catalog: getLeagueData, pyramids: getPyramids });
    const desk = createAiManagerDesk({
      service: saveService, saveId, date, tracker, getIndex: () => index, catalog: getLeagueData, countries: getCountries,
      humanClubId: meta.clubId, playerLeague: "premier_league",
    });
    const before = (await tracker.list()).find((m) => m.squadId === club)!;
    // A sacking (as the Monday review does) and a vacancy due today.
    await tracker.apply((ms) => ms.map((m) => (m.squadId === club ? { ...m } : m)));
    const { sackManager } = await import("@/Domain/managers/aiManagers");
    await tracker.apply((ms) => sackManager(ms, { squadId: club, clubName: index.byId(club)!.name, date }));
    desk.openVacancy(club, "2026-07-01");
    expect((await tracker.list()).find((m) => m.squadId === club)!.interim).toBe(true);
    expect((await tracker.list()).find((m) => m.id === before.id)).toMatchObject({ squadId: "", freeSince: date });

    await desk.hireDue(meta.activeLeagues ?? []);
    const after = await tracker.list();
    const hired = after.find((m) => m.squadId === club)!;
    expect(hired.interim).toBeUndefined();
    expect(hired.hiredOn).toBe(date);
    expect(desk.vacancies()[club]).toBeUndefined();
    expect(desk.news().some((n) => n.kind === "hired" && n.squadId === club)).toBe(true);
    const breaks = managerInvariantBreaks(after, (await saveService.getAllSquads(saveId)).map((s) => s.id));
    expect(breaks).toEqual({ missing: [], doubled: [] });
  }, 120_000);

  test("the day advance: the manager's wage on Monday, vacancies in the meta", async () => {
    // Move to a Monday.
    let date = meta.currentDate!;
    while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) {
      const out = await advanceOneDay(saveService, saveId);
      expect(out.ok).toBe(true);
      date = (await saveService.getMeta(saveId))!.currentDate!;
    }
    await saveService.updateMeta(saveId, { managerVacancies: { x_missing_club: { since: date, hireOn: date } } });
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const m = (await saveService.getMeta(saveId))!;
    expect(m.managerVacancies?.x_missing_club).toBeUndefined();
    expect(m.managerEarnings).toBe(m.managerContract!.wage);
    const year = (await saveService.getLeagueMeta(saveId, m.leagueSlug))!.year;
    const ledger = await saveService.getLedger(saveId, year);
    expect(ledger.filter((e) => e.kind === "manager" && e.date === date).map((e) => e.amount)).toEqual([-m.managerContract!.wage]);
  }, 240_000);
});
