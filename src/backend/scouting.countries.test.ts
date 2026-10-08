import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
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

describe("routes: the scouts' country knowledge", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("scouting view, player country, staff, pool and the countries route", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("scout-countries@test.local");
    const other = devAutoLogin("scout-countries-other@test.local");
    recordSaveOwnership(saveId, user.id);
    const call = (path: string, token: string, params: Record<string, string> = {}, query = "") => {
      const handler = apiRoutes[path as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      let url = path.replace(":saveId", saveId);
      for (const [k, v] of Object.entries(params)) url = url.replace(`:${k}`, v);
      return handler(Object.assign(
        new Request(`http://localhost${url}${query}`, { headers: { cookie: `fs_session=${token}` } }),
        { params: { saveId, ...params } },
      ));
    };

    const club = (await saveService.getSquadById(saveId, "33"))!;
    const chief = headOf(club, "scout")!;
    await saveService.saveSquadById(saveId, {
      ...club,
      staff: {
        ...club.staff!,
        members: club.staff!.members.map((m) => (m.id === chief.id
          ? { ...m, nationality: "England", countryKnowledge: { Brazil: { k: 95, last: meta.currentDate! } } }
          : m)),
      },
    });

    // GET /scouting: nationality, strong country, countries (> 0) and continent means.
    const view = await (await call("/api/saves/:saveId/scouting", session.token)).json() as any;
    const s0 = view.scouts[0];
    expect(s0.nationality).toBe("England");
    expect(s0.strongCountry).toEqual({ country: "Brazil", k: 95 });
    expect(s0.countries.England).toBe(90);
    expect(s0.countries.Spain).toBe(40);
    expect(s0.countries.Brazil).toBe(95);
    expect(Object.values(s0.countries).every((k) => (k as number) > 0)).toBe(true);
    expect(s0.continents.Europe).toBeGreaterThanOrEqual(40);
    expect(s0.continents["South America"]).toBeGreaterThan(0);
    expect(s0.member).toBeUndefined();

    // GET /scouting/player/:id: the country of his club's league.
    const index = await saveService.getSquadIndex(saveId);
    const spanish = (await saveService.getSquadById(saveId, index.inLeague("la_liga")[0]!.squadId))!;
    const pv = await (await call("/api/saves/:saveId/scouting/player/:playerId", session.token, { playerId: spanish.players[0]!.id }, `?squad=${spanish.id}`)).json() as any;
    expect(pv.country).toBe("Spain");

    // GET /staff: scouts carry strongCountry, the others never.
    const staff = await (await call("/api/saves/:saveId/staff", session.token)).json() as any;
    for (const m of staff.members) {
      if (m.role === "scout" || m.role === "fieldScout") expect(m.strongCountry).toBeDefined();
      else expect(m.strongCountry).toBeUndefined();
    }

    // GET /staff/pool: scouts in the pool too.
    const pool = await (await call("/api/saves/:saveId/staff/pool", session.token, {}, "?role=fieldScout")).json() as any;
    expect(pool.items.length).toBeGreaterThan(0);
    expect(pool.items.every((m: any) => m.strongCountry && m.strongCountry.k >= 90)).toBe(true);

    // GET /staff/:memberId/countries.
    const COUNTRIES = "/api/saves/:saveId/staff/:memberId/countries";
    const mine = await call(COUNTRIES, session.token, { memberId: chief.id });
    expect(mine.status).toBe(200);
    const body = await mine.json() as any;
    expect(body.countries).toHaveLength(60);
    const brazil = body.countries.find((c: any) => c.country === "Brazil");
    expect(brazil).toMatchObject({ k: 95, band: "full", native: false, last: meta.currentDate });
    expect(body.countries.find((c: any) => c.country === "England")).toMatchObject({ k: 90, native: true });
    const fromPool = await call(COUNTRIES, session.token, { memberId: pool.items[0].id });
    expect(fromPool.status).toBe(200);
    expect(((await fromPool.json()) as any).countries.some((c: any) => c.native && c.k === 90)).toBe(true);
    expect((await call(COUNTRIES, session.token, { memberId: "nobody" })).status).toBe(404);
    const coach = club.staff!.members.find((m) => m.role === "coach")!;
    const notScout = await call(COUNTRIES, session.token, { memberId: coach.id });
    expect(notScout.status).toBe(400);
    expect(((await notScout.json()) as any).error).toBe("notAScout");
    expect((await call(COUNTRIES, other.session.token, { memberId: chief.id })).status).toBe(404);
  }, 240_000);
});
