import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { scoutingDay } from "@/backend/scoutingWorld";
import { addDays } from "@/Domain/dates";
import { headOf, makeProfessional, signContract } from "@/Domain/staff/staff";
import { countryKnowledgeOf } from "@/Domain/scouting/countryKnowledge";
import type { ScoutAssignment } from "@/types/scoutingTypes";

function nextMonday(date: string): string {
  let d = addDays(date, 1);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}

describe("missions teach the country to their leader", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("country and continent missions grow the leader's knowledge; a vacant chief stores nothing", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const start = meta.currentDate!;

    // An English chief and a Brazilian field scout.
    const club = (await saveService.getSquadById(saveId, "33"))!;
    const field = {
      ...signContract(makeProfessional("country-field", "fieldScout", 3), { date: start, seasonEnd: "2027-05-30", years: 1, clubFactor: 1 }),
      nationality: "Brazil",
    };
    const chiefId = headOf(club, "scout")!.id;
    await saveService.saveSquadById(saveId, {
      ...club,
      staff: {
        ...club.staff!,
        members: [...club.staff!.members.map((m) => (m.id === chiefId ? { ...m, nationality: "England" } : m)), field],
      },
    });

    const mission = (over: Partial<ScoutAssignment>): ScoutAssignment => ({
      id: "m", scoutId: "chief", target: { kind: "country", country: "Spain" }, start, weeks: 4, weeksDone: 0, observed: 0, ...over,
    });
    const state = await saveService.getScouting(saveId);
    await saveService.writeScouting(saveId, {
      ...state,
      missions: [
        mission({ id: "mc", target: { kind: "country", country: "Spain" } }),
        mission({ id: "mf", scoutId: field.id, target: { kind: "continent", continent: "South America" }, weeks: 8 }),
      ],
    });

    const monday = nextMonday(start);
    await scoutingDay(saveService, saveId, { date: monday, meta: (await saveService.getMeta(saveId))!, matchEvents: [] });
    const after = (await saveService.getSquadById(saveId, "33"))!;
    const chief = after.staff!.members.find((m) => m.id === chiefId)!;
    expect(chief.countryKnowledge?.Spain).toEqual({ k: 43.6, last: monday });

    const scout = after.staff!.members.find((m) => m.id === field.id)!;
    const learned = Object.entries(scout.countryKnowledge ?? {});
    expect(learned.length).toBeGreaterThan(0);
    for (const [country, e] of learned) {
      expect(e.last).toBe(monday);
      expect(e.k).toBe(country === "Brazil" ? 90.2 : 41.2);
    }
    // The own country never falls.
    expect(countryKnowledgeOf(scout, "Brazil", addDays(monday, 2000))).toBeGreaterThanOrEqual(90);

    // Vacant chief: the mission still works (neutral pace), nothing stored, no error.
    const noChief = (await saveService.getSquadById(saveId, "33"))!;
    await saveService.saveSquadById(saveId, {
      ...noChief, staff: { ...noChief.staff!, members: noChief.staff!.members.filter((m) => m.role !== "scout") },
    });
    const next = addDays(monday, 7);
    const before = await saveService.getScouting(saveId);
    await scoutingDay(saveService, saveId, { date: next, meta: (await saveService.getMeta(saveId))!, matchEvents: [] });
    const worked = (await saveService.getScouting(saveId)).missions.find((m) => m.id === "mc");
    expect(worked?.weeksDone ?? 4).toBeGreaterThan(before.missions.find((m) => m.id === "mc")!.weeksDone);
    const finalClub = (await saveService.getSquadById(saveId, "33"))!;
    expect(finalClub.staff!.members.some((m) => m.role === "scout")).toBe(false);

    // AI clubs never get a staff (nor country knowledge).
    const index = await saveService.getSquadIndex(saveId);
    for (const e of index.inLeague("la_liga").slice(0, 5)) {
      expect((await saveService.getSquadById(saveId, e.squadId))!.staff).toBeUndefined();
    }
  }, 240_000);
});
