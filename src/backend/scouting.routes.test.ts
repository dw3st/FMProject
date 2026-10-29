import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { scoutingDay, loadViewer, ownSideOpponents, viewFor } from "@/backend/scoutingWorld";
import { searchScout, parseScoutQuery } from "@/backend/scoutSearch";
import { addDays } from "@/Domain/dates";
import { makeProfessional, signContract } from "@/Domain/staff/staff";
import { SCOUTING } from "@/Domain/scouting/scoutingConfig";
import { YOUTH } from "@/Domain/youth/youthConfig";
import { RECOMMENDATION_ORIGIN, type ScoutProspect } from "@/types/scoutingTypes";
import type { MatchEvent } from "@/types/dayLogTypes";

function nextMonday(date: string): string {
  let d = addDays(date, 1);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}

describe("scouting routes and the weekly step", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("missions, shortlist, prospects, field scouts, knowledge on the screens", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("scouting-route@test.local");
    const other = devAutoLogin("scouting-other@test.local");
    await ownSolo(saveId, user.id);

    const call = (path: string, method: string, token: string, body?: unknown, params: Record<string, string> = {}) => {
      const handler = apiRoutes[path as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${path.replace(":saveId", saveId)}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId, ...params } },
      ));
    };
    const MISSIONS = "/api/saves/:saveId/scouting/missions";

    // Owner only.
    expect((await call("/api/saves/:saveId/scouting", "GET", other.session.token)).status).toBe(404);
    const view = await (await call("/api/saves/:saveId/scouting", "GET", session.token)).json() as any;
    expect(view.employed).toBe(true);
    expect(view.scouts[0].id).toBe("chief");

    // Validation.
    expect((await call(MISSIONS, "POST", session.token, { scoutId: "chief", target: { kind: "country", country: "Atlantis" }, weeks: 4 })).status).toBe(400);
    expect((await call(MISSIONS, "POST", session.token, { scoutId: "chief", target: { kind: "country", country: "Spain" }, weeks: 5 })).status).toBe(400);
    expect((await call(MISSIONS, "POST", session.token, { scoutId: "chief", target: { kind: "continent", continent: "Europe" }, weeks: 4 })).status).toBe(400);

    // A field scout (put straight into the staff; hiring from the pool is covered by staff.routes.test.ts).
    const field = signContract(makeProfessional("test-field-scout", "fieldScout", 3), {
      date: "2027-02-05", seasonEnd: "2027-05-30", years: 1, clubFactor: 1,
    });
    const ownClub = (await saveService.getSquadById(saveId, "33"))!;
    await saveService.saveSquadById(saveId, { ...ownClub, staff: { ...ownClub.staff!, members: [...ownClub.staff!.members, field] } });

    // Missions: country (chief), youth (field scout); the chief is then busy.
    expect((await call(MISSIONS, "POST", session.token, { scoutId: "chief", target: { kind: "country", country: "Spain" }, weeks: 4 })).status).toBe(200);
    expect((await call(MISSIONS, "POST", session.token, { scoutId: "chief", target: { kind: "league", league: "la_liga" }, weeks: 4 })).status).toBe(409);
    expect((await call(MISSIONS, "POST", session.token, { scoutId: field.id, target: { kind: "youth", country: "Spain" }, weeks: 8 })).status).toBe(200);
    // A player mission on the club's own player is pointless (already known): 400.
    const ownPlayer = (await saveService.getSquadById(saveId, "33"))!.players[0]!;
    expect((await call(MISSIONS, "POST", session.token, { scoutId: "chief", target: { kind: "player", playerId: ownPlayer.id, squadId: "33" }, weeks: 3 })).status).toBe(400);

    // Shortlist a Spanish player.
    const index = await saveService.getSquadIndex(saveId);
    const spanish = index.inLeague("la_liga")[0]!;
    const spanishSquad = (await saveService.getSquadById(saveId, spanish.squadId))!;
    const target = spanishSquad.players[0]!;
    expect((await call("/api/saves/:saveId/scouting/shortlist", "POST", session.token, { playerId: target.id, squadId: spanishSquad.id, note: "watch" })).status).toBe(200);

    // Before any observation: unknown abroad, attributes hidden, wide range.
    let viewer = (await loadViewer(saveService, saveId, meta.seatId))!;
    const before = viewFor(viewer, target, "la_liga");
    expect(before.noise).toBeGreaterThan(0.5);

    // One Monday: knowledge grows, reports are written, travel is charged.
    const fresh = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    const monday = nextMonday(fresh.currentDate!);
    const day = await scoutingDay(saveService, saveId, meta.seatId, { date: monday, meta: fresh, matchEvents: [] });
    const state = await saveService.getScouting(saveId, meta.seatId);
    expect(Object.keys(state.knowledge).length).toBeGreaterThan(10);
    expect(state.reports.length).toBeGreaterThan(0);
    expect(day.entries.filter((e) => e.kind === "scouting")).toHaveLength(2);
    expect(day.entries.every((e) => e.amount < 0)).toBe(true);
    expect(day.messages.some((m) => m.kind === "report")).toBe(true);
    expect(state.missions.every((m) => m.weeksDone === 1)).toBe(true);
    expect(state.shortlist[0]!.status).toBeDefined();

    // The search blurs by knowledge: rows carry it, own players are exact.
    const res = (await searchScout(saveId, meta.seatId, parseScoutQuery({ filters: { league: "la_liga" }, pageSize: 200 })))!;
    expect(res.rows.every((r) => typeof r.knowledge === "number")).toBe(true);
    const own = (await searchScout(saveId, meta.seatId, parseScoutQuery({ filters: { league: "premier_league" }, pageSize: 200 })))!;
    expect(own.rows.filter((r) => r.squadId === "33").every((r) => r.knowledge === undefined)).toBe(true);
    const low = (await searchScout(saveId, meta.seatId, parseScoutQuery({ filters: { league: "la_liga", minKnowledge: 60 }, pageSize: 200 })))!;
    expect(low.rows.every((r) => (r.knowledge ?? 100) >= 60)).toBe(true);

    // Shortlist full.
    const s = await saveService.getScouting(saveId, meta.seatId);
    await saveService.writeScouting(saveId, {
      ...s,
      shortlist: Array.from({ length: SCOUTING.MAX_SHORTLIST }, (_, i) => ({ playerId: `x${i}`, name: "x", squadId: "", addedOn: monday })),
    }, meta.seatId);
    expect((await call("/api/saves/:saveId/scouting/shortlist", "POST", session.token, { playerId: target.id, squadId: spanishSquad.id })).status).toBe(409);

    // Reports (tester report): a player now at the club is dropped; one who left the observed club loses the link.
    const reportedOwn = (await saveService.getSquadById(saveId, "33"))!.players[0]!;
    const rep = (id: string, playerId: string, squadId: string) => ({ id, date: monday, playerId, name: id, squadId, club: "", league: "", gem: true });
    const withReports = await saveService.getScouting(saveId, meta.seatId);
    await saveService.writeScouting(saveId, {
      ...withReports,
      shortlist: [],
      reports: [rep("r_own", reportedOwn.id, spanishSquad.id), rep("r_there", target.id, spanishSquad.id), rep("r_moved", "nobody_here", spanishSquad.id)] as never,
    }, meta.seatId);
    const rv = await (await call("/api/saves/:saveId/scouting", "GET", session.token)).json() as { reports: { id: string; gone?: boolean }[] };
    expect(rv.reports.map((r) => r.id)).toEqual(["r_there", "r_moved"]);
    expect(rv.reports.find((r) => r.id === "r_there")!.gone).toBeUndefined();
    expect(rv.reports.find((r) => r.id === "r_moved")!.gone).toBe(true);

    // Prospects: an expired one is closed; a valid one joins the academy with a fee in the ledger.
    const base = (await saveService.getScouting(saveId, meta.seatId));
    const mk = (id: string, expires: string): ScoutProspect => ({
      player: { ...target, id, age: 16, squadId: "", contract: undefined }, country: "Spain", expires, reportId: "", fee: 120_000,
    });
    await saveService.writeScouting(saveId, { ...base, shortlist: [], prospects: [mk("pr_old", "2000-01-01"), mk("pr_ok", "2099-01-01")] }, meta.seatId);
    const SIGN = "/api/saves/:saveId/scouting/prospects/:prospectId/sign";
    expect((await call(SIGN, "POST", session.token, undefined, { prospectId: "pr_old" })).status).toBe(409);
    const budgetBefore = (await saveService.getSquadById(saveId, "33"))!.finances!.budget;
    expect((await call(SIGN, "POST", session.token, undefined, { prospectId: "pr_ok" })).status).toBe(200);
    const after = (await saveService.getSquadById(saveId, "33"))!;
    expect(after.youth!.some((p) => p.id === "pr_ok" && !!p.contract)).toBe(true);
    expect(after.youth!.find((p) => p.id === "pr_ok")!.academyOf).toBe(after.id);
    expect(after.finances!.budget).toBe(budgetBefore - 120_000);

    // Academy full.
    await saveService.saveSquadById(saveId, { ...after, youth: Array.from({ length: YOUTH.MAX_SIZE }, (_, i) => ({ ...target, id: `y${i}` })) });
    const st = await saveService.getScouting(saveId, meta.seatId);
    await saveService.writeScouting(saveId, { ...st, prospects: [mk("pr_two", "2099-01-01")] }, meta.seatId);
    // The screen never gets a prospect's exact attributes (only the report's seen ranges).
    const seenView = await (await call("/api/saves/:saveId/scouting", "GET", session.token)).json() as any;
    expect(seenView.prospects[0].player.id).toBe("pr_two");
    expect(seenView.prospects[0].player.stats).toBeUndefined();
    expect((await call(SIGN, "POST", session.token, undefined, { prospectId: "pr_two" })).status).toBe(400);

    // Firing the field scout cancels his mission.
    expect((await call("/api/saves/:saveId/staff/fire", "POST", session.token, { memberId: field.id })).status).toBe(200);
    expect((await saveService.getScouting(saveId, meta.seatId)).missions.some((m) => m.scoutId === field.id)).toBe(false);

    // Unemployed: no new missions.
    await saveService.updateSeat(saveId, meta.seatId, { clubId: "" });
    expect((await call(MISSIONS, "POST", session.token, { scoutId: "chief", target: { kind: "country", country: "Spain" }, weeks: 4 })).status).toBe(409);
    viewer = (await loadViewer(saveService, saveId, meta.seatId))!;
    expect(viewer.ownClubId).toBe("");
  }, 240_000);
});

describe("the chief's monthly recommendation (#100)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("with no missions, every pick has a report in the scouting centre, written once", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    let date = addDays(meta.currentDate!, 1);
    while (!date.endsWith("-01")) date = addDays(date, 1);
    const day = await scoutingDay(saveService, saveId, meta.seatId, { date, meta, matchEvents: [] });
    const rec = day.messages.find((m) => m.kind === "recommendation");
    expect(rec).toBeDefined();
    const state = await saveService.getScouting(saveId, meta.seatId);
    expect(rec!.players!.length).toBeGreaterThan(0);
    for (const p of rec!.players!) {
      const report = state.reports.find((r) => r.playerId === p.playerId);
      expect(report).toBeDefined();
      expect(report!.missionId).toBe(RECOMMENDATION_ORIGIN);
      expect(report!.id).toBe(p.reportId!);
      expect(p.grade).toBe(report!.grade);
      expect(p.squadId).toBe(report!.squadId);
      expect(state.knowledge[p.playerId]!.k).toBeGreaterThan(SCOUTING.IMPLICIT_OWN_LEAGUE);
    }
    expect(state.reports).toHaveLength(rec!.players!.length);
    // The same day again (a replayed day): same month, nothing new.
    const again = await scoutingDay(saveService, saveId, meta.seatId, { date, meta, matchEvents: [] });
    expect(again.messages.some((m) => m.kind === "recommendation")).toBe(false);
    expect((await saveService.getScouting(saveId, meta.seatId)).reports).toHaveLength(state.reports.length);
  }, 120_000);
});

/**
 * Issue #157: with the chief scout in charge of the missions, every Monday each free scout gets a
 * mission (one on youths), marked `byChief`, and one inbox summary; with the manager (default)
 * nothing. A scout whose mission the manager cancelled stays free for a week.
 */
describe("the chief scout plans the missions (#157)", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  }, 60_000);

  const setup = async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const field = signContract(makeProfessional("chief-plan-field", "fieldScout", 3), {
      date: meta.currentDate!, seasonEnd: "2027-05-30", years: 1, clubFactor: 1,
    });
    const own = (await saveService.getSquadById(meta.id, "33"))!;
    await saveService.saveSquadById(meta.id, { ...own, staff: { ...own.staff!, members: [...own.staff!.members, field] } });
    return { meta, field };
  };

  test("manager in charge (default): no mission created", async () => {
    const { meta } = await setup();
    const day = await scoutingDay(saveService, meta.id, meta.seatId, { date: nextMonday(meta.currentDate!), meta, matchEvents: [] });
    expect(day.messages.some((m) => m.kind === "chief_missions")).toBe(false);
    expect((await saveService.getScouting(meta.id, meta.seatId)).missions).toHaveLength(0);
  }, 120_000);

  test("chief in charge: the day advance through a Monday sends every free scout, one on youths", async () => {
    const { meta, field } = await setup();
    await saveService.updateSeat(meta.id, meta.seatId, { responsibilities: { contracts: "director", scouting: "chief" } });
    const { advanceOneDay } = await import("@/backend/advanceDay");
    let mondayDate = "";
    for (let i = 0; i < 8 && !mondayDate; i++) {
      const today = (await saveService.getMeta(meta.id))!.currentDate!;
      expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
      if (new Date(`${today}T12:00:00Z`).getUTCDay() === 1) mondayDate = today;
    }
    expect(mondayDate).not.toBe("");
    const state = await saveService.getScouting(meta.id, meta.seatId);
    expect(state.missions.map((m) => m.scoutId).sort()).toEqual(["chief", field.id].sort());
    for (const m of state.missions) {
      expect(m.byChief).toBe(true);
      expect(m.start).toBe(mondayDate);
      expect(m.target.kind).not.toBe("player");
    }
    expect(state.missions.filter((m) => m.target.kind === "youth")).toHaveLength(1);
    const region = state.missions.find((m) => m.target.kind !== "youth")!;
    expect(region.focus?.improves).toBe(true);
    const inbox = await saveService.getInbox(meta.id, meta.seatId);
    const summary = inbox.filter((m) => m.category === "scouting" && m.kind === "chief_missions");
    expect(summary).toHaveLength(1);
  }, 300_000);

  test("a mission the manager cancels is not recreated the next Monday", async () => {
    const { meta, field } = await setup();
    const monday = nextMonday(meta.currentDate!);
    const chiefMeta = { ...meta, responsibilities: { contracts: "director" as const, scouting: "chief" as const } };
    await scoutingDay(saveService, meta.id, meta.seatId, { date: monday, meta: chiefMeta, matchEvents: [] });
    const first = await saveService.getScouting(meta.id, meta.seatId);
    expect(first.missions).toHaveLength(2);
    // The manager cancels the field scout's mission (route) on Sunday: the scout goes on hold.
    const sunday = addDays(monday, 6);
    await saveService.updateMeta(meta.id, { currentDate: sunday });
    const cancelled = first.missions.find((m) => m.scoutId === field.id)!;
    const { user, session } = devAutoLogin("chief-plan@test.local");
    await ownSolo(meta.id, user.id);
    const handler = apiRoutes["/api/saves/:saveId/scouting/missions/:missionId"] as (r: Request) => Promise<Response>;
    const del = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${meta.id}/scouting/missions/${cancelled.id}`, {
        method: "DELETE", headers: { cookie: `fs_session=${session.token}` },
      }),
      { params: { saveId: meta.id, missionId: cancelled.id } },
    ));
    expect(del.status).toBe(200);
    expect((await saveService.getScouting(meta.id, meta.seatId)).chiefHold).toEqual({ [field.id]: sunday });
    await scoutingDay(saveService, meta.id, meta.seatId, { date: addDays(monday, 7), meta: chiefMeta, matchEvents: [] });
    expect((await saveService.getScouting(meta.id, meta.seatId)).missions.some((m) => m.scoutId === field.id)).toBe(false);
    // A week after the cancellation he is planned again.
    await scoutingDay(saveService, meta.id, meta.seatId, { date: addDays(monday, 14), meta: chiefMeta, matchEvents: [] });
    const later = await saveService.getScouting(meta.id, meta.seatId);
    expect(later.missions.some((m) => m.scoutId === field.id && m.byChief)).toBe(true);
    expect(later.chiefHold).toBeUndefined();
  }, 120_000);
});

describe("ownSideOpponents", () => {
  test("only the opponents who took the pitch, never the own side nor the unused bench", () => {
    const event = {
      kind: "match", home: "me", away: "them",
      playerTeams: { m1: "home", t1: "away", t2: "away", bench: "away" },
      playerStats: { m1: {}, t1: {} }, playerRatings: { m1: 6, t1: 6, t2: 7 },
    } as unknown as MatchEvent;
    expect(ownSideOpponents([event], "me").sort()).toEqual(["t1", "t2"]);
    expect(ownSideOpponents([event], "other")).toEqual([]);
  });
});
