import { ownSolo } from "@/backend/testing/seatFixtures";
import { soloRecording } from "@/backend/testing/seatFixtures";
/**
 * The human manager at a national team (Etapa 41b, `.claude/rules/game/national-teams.md`): an offer accepted by the
 * route, the call-up notice and his own call-up, his game played in the full engine (and from a live recording),
 * match-setup for the national game, and the resignation.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, runBufferedDay } from "@/backend/advanceDay";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { withOffer } from "@/backend/nationalWorld";
import { nationalMatchSetup, playerNationalCalendar } from "@/backend/nationalCoachWorld";
import { simulateRecording } from "@/Domain/advanceDay/matches";
import { currentNationalTeam } from "@/Domain/national/nationalCoach";
import type { NationalCoachInboxMessage } from "@/types/inboxTypes";

const HUMAN = "33";
const TEAM = "nat_wales";

describe("the human manager at a national team", () => {
  let saveId = "";
  let seatId = "";
  let token = "";
  const call = (key: string, path: string, init: RequestInit = {}, params: Record<string, string> = {}) => {
    const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    const headers = { cookie: `fs_session=${token}`, "content-type": "application/json" };
    return handler(Object.assign(new Request(`http://localhost${path}`, { ...init, headers }), { params: { saveId, ...params } }));
  };
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    seatId = meta.seatId;
    const { user, session } = devAutoLogin("national-coach@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
  }, 240_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("an offer is accepted by the route: the team is his, its coach goes, the club stays", async () => {
    await saveService.updateMeta(saveId, { currentDate: "2026-08-24" });
    let state = (await saveService.getNationalState(saveId))!;
    const oldCoach = state.teams[TEAM]!.managerId;
    state = { ...state, vacancies: { ...state.vacancies, [TEAM]: { since: "2026-08-24", hireOn: "2026-08-30" } } };
    state = withOffer(state, seatId, { id: "natjob_test", teamId: TEAM, nation: "Wales", date: "2026-08-24", expires: "2026-09-07", prestige: 0.5, rank: 40, wage: 30_000 });
    expect(state.vacancies[TEAM]!.hireOn).toBe("2026-09-08");
    await saveService.writeNationalState(saveId, state);

    const closed = await call("/api/saves/:saveId/national/coach/offers/:offerId", `/api/saves/${saveId}/national/coach/offers/nope`, { method: "POST", body: JSON.stringify({ accept: true }) }, { offerId: "nope" });
    expect(closed.status).toBe(409);
    const res = await call("/api/saves/:saveId/national/coach/offers/:offerId", `/api/saves/${saveId}/national/coach/offers/natjob_test`, { method: "POST", body: JSON.stringify({ accept: true }) }, { offerId: "natjob_test" });
    expect(res.status).toBe(200);
    state = (await saveService.getNationalState(saveId))!;
    expect(state.teams[TEAM]!.managerId).toBe(`seat:${seatId}`);
    expect(state.human?.[seatId]).toMatchObject({ teamId: TEAM, wage: 30_000 });
    expect(state.vacancies[TEAM]).toBeUndefined();
    const managers = await saveService.getManagers(saveId);
    const me = managers.find((m) => m.seatId === seatId)!;
    expect(me.squadId).toBe(HUMAN);
    expect(currentNationalTeam(me)).toBe(TEAM);
    expect(managers.find((m) => m.id === oldCoach)?.squadId ?? "").not.toBe(TEAM);
    expect(managers.filter((m) => m.squadId === TEAM)).toHaveLength(0);
  });

  test("the notice, the coach view and his call-up", async () => {
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const inbox = await saveService.getInbox(saveId);
    expect(inbox.some((m) => m.category === "national_coach" && (m as NationalCoachInboxMessage).kind === "callup_soon")).toBe(true);
    await saveService.updateMeta(saveId, { currentDate: "2026-08-31" });
    const view = (await (await call("/api/saves/:saveId/national/coach", `/api/saves/${saveId}/national/coach`)).json()) as any;
    expect(view.team.id).toBe(TEAM);
    expect(view.callUp.date).toBe("2026-08-31");
    expect(view.callUp.suggestion.length).toBeGreaterThan(5);
    expect(view.objectives.length).toBeGreaterThan(0);
    const bad = await call("/api/saves/:saveId/national/coach/callup", `/api/saves/${saveId}/national/coach/callup`, { method: "PUT", body: JSON.stringify({ players: ["x", "x"] }) });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).reason).toBe("duplicate");
    const chosen = view.callUp.suggestion.slice(0, Math.min(18, view.callUp.suggestion.length));
    const ok = await call("/api/saves/:saveId/national/coach/callup", `/api/saves/${saveId}/national/coach/callup`, { method: "PUT", body: JSON.stringify({ players: chosen }) });
    expect(ok.status).toBe(200);
    const tac = await call("/api/saves/:saveId/national/coach/tactics", `/api/saves/${saveId}/national/coach/tactics`, { method: "PUT", body: JSON.stringify({ formation: "4-4-2", tactical_style: "counter_attack", lineup: [] }) });
    expect(tac.status).toBe(200);
    expect((await call("/api/saves/:saveId/national/coach/tactics", `/api/saves/${saveId}/national/coach/tactics`, { method: "PUT", body: JSON.stringify({ formation: "9-9-9", tactical_style: "balanced" }) })).status).toBe(400);

    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const state = (await saveService.getNationalState(saveId))!;
    const cu = state.callUps[TEAM]!;
    expect(cu.players).toHaveLength(23);
    const real = cu.players.filter((p) => !p.generated).map((p) => p.id);
    expect(real.sort()).toEqual([...chosen].sort());
    expect(state.human?.[seatId]?.callUp).toBeUndefined();
  }, 240_000);

  test("his game: the calendar, match-setup, a live recording, then the engine", async () => {
    await saveService.updateMeta(saveId, { currentDate: "2026-09-03" });
    const cal = await playerNationalCalendar(saveService, saveId, seatId, HUMAN);
    const today = cal.fixtures.find((f) => f.date === "2026-09-03");
    expect(today).toBeDefined();
    expect(today!.home === HUMAN || today!.away === HUMAN).toBe(true);
    expect(today!.nationalTeam).toBe(TEAM);

    const setup = (await nationalMatchSetup(saveService, saveId, seatId, "2026-09-03"))!;
    expect(setup.teamId).toBe(TEAM);
    expect(setup.mySquad.players).toHaveLength(23);
    expect(setup.myFormation.id).toBe("4-4-2");
    expect(setup.myLineup.filter(Boolean)).toHaveLength(11);
    // A "live" recording of his game (the engine stands in for the screen).
    const homeIsMine = setup.fixture.home === TEAM;
    const { recording } = simulateRecording(setup.fixture, homeIsMine ? setup.mySquad : setup.opponentSquad, homeIsMine ? setup.opponentSquad : setup.mySquad, {
      homeFormation: homeIsMine ? setup.myFormation : setup.oppFormation, homeLineup: homeIsMine ? setup.myLineup : setup.oppLineup,
      awayFormation: homeIsMine ? setup.oppFormation : setup.myFormation, awayLineup: homeIsMine ? setup.oppLineup : setup.myLineup,
    });
    const out = await advanceOneDay(saveService, saveId, await soloRecording(saveId, recording));
    expect(out.ok).toBe(true);
    const log = (await saveService.getDayLog(saveId, "2026-09-03"))!;
    expect(log.nationalMatches?.[seatId]?.fixtureId).toBe(setup.fixture.id);
    expect(log.nationalMatches?.[seatId]?.score).toEqual(recording.score);
    const comp = (await saveService.getNationalComp(saveId, setup.fixture.competition))!;
    expect(comp.fixtures.find((f) => f.id === setup.fixture.id)?.result).toEqual(recording.score);

    // A recording of another fixture is refused (a buffered day: nothing written).
    await saveService.updateMeta(saveId, { currentDate: "2026-09-07" });
    const wrong = await runBufferedDay(saveId, await soloRecording(saveId, { ...recording, fixtureId: "nope" }));
    expect(wrong.ok).toBe(false);
    // Without a recording the engine plays it.
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const log2 = (await saveService.getDayLog(saveId, "2026-09-07"))!;
    if (cal.fixtures.some((f) => f.date === "2026-09-07")) expect(log2.nationalMatches?.[seatId]).toBeDefined();
  }, 240_000);

  test("resigning: an interim and an AI vacancy, the club untouched", async () => {
    const res = await call("/api/saves/:saveId/national/coach/resign", `/api/saves/${saveId}/national/coach/resign`, { method: "POST" });
    expect(res.status).toBe(200);
    const state = (await saveService.getNationalState(saveId))!;
    expect(state.human?.[seatId]).toBeUndefined();
    expect(state.teams[TEAM]!.managerId).not.toBe(`seat:${seatId}`);
    expect(state.vacancies[TEAM]).toBeDefined();
    const managers = await saveService.getManagers(saveId);
    expect(managers.filter((m) => m.squadId === TEAM)).toHaveLength(1);
    const me = managers.find((m) => m.seatId === seatId)!;
    expect(me.squadId).toBe(HUMAN);
    expect(currentNationalTeam(me)).toBeNull();
    expect((await call("/api/saves/:saveId/national/coach/resign", `/api/saves/${saveId}/national/coach/resign`, { method: "POST" })).status).toBe(409);
  });
});
