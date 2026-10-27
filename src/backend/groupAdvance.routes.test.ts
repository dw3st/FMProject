import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { setKickScheduler } from "@/backend/groupAdvance";
import { callApi } from "@/backend/worlds/worldTestUtils";
import { fakeWorld } from "@/backend/testing/worldFixtures";

const D = "2027-03-10";

describe("group advance routes", () => {
  const created: string[] = [];
  const kicks: string[] = [];
  let token = "";
  let multi = "";
  let solo = "";
  let lobby = "";
  beforeAll(async () => {
    setKickScheduler((id) => kicks.push(id));
    const login = devAutoLogin("ga-routes@test.local");
    token = login.session.token;
    multi = await fakeWorld({ seatIds: ["a", "b"], date: D });
    solo = await fakeWorld({ seatIds: ["s"], date: D, world: null, mode: "solo" });
    lobby = await fakeWorld({ seatIds: ["l"], date: D, world: { phase: "lobby" } });
    created.push(multi, solo, lobby);
    addSaveMember(multi, login.user.id, "a", "owner");
    addSaveMember(solo, login.user.id, "s", "owner");
    addSaveMember(lobby, login.user.id, "l", "owner");
  });
  afterEach(() => { kicks.length = 0; });
  afterAll(async () => {
    setKickScheduler(null);
    for (const id of created) {
      deleteSaveMembers(id);
      await saveService.deleteSave(id);
    }
  }, 60_000);

  const api = (method: "GET" | "POST" | "DELETE", route: string, saveId: string, body?: unknown, tok: string | null = token) =>
    callApi(method, `/api/worlds/:saveId/${route}`, tok, { params: { saveId }, body });

  test("solo answers 409 notMulti, lobby 409 lobby, a stranger 404", async () => {
    expect((await api("POST", "ready", solo, { until: "tomorrow" })).json.error).toBe("notMulti");
    const l = await api("POST", "ready", lobby, { until: "tomorrow" });
    expect(l.status).toBe(409);
    expect(l.json.error).toBe("lobby");
    const stranger = devAutoLogin("ga-routes-stranger@test.local").session.token;
    expect((await api("POST", "ready", multi, { until: "tomorrow" }, stranger)).status).toBe(404);
    expect((await api("POST", "ready", multi, { until: "tomorrow" }, null)).status).toBe(401);
  });

  test("ready tomorrow is stored and kicks the world; null unmarks", async () => {
    const res = await api("POST", "ready", multi, { until: "tomorrow" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ readyUntil: "2027-03-11" });
    expect((await saveService.getSeat(multi, "a"))!.readyUntil).toBe("2027-03-11");
    expect(kicks).toEqual([multi]);
    expect((await api("POST", "ready", multi, { until: null })).json.readyUntil).toBeNull();
  });

  test("a real future date is stored; next_match without a game is tomorrow", async () => {
    expect((await api("POST", "ready", multi, { until: "2027-03-14" })).json.readyUntil).toBe("2027-03-14");
    expect((await api("POST", "ready", multi, { until: "next_match" })).json.readyUntil).toBe("2027-03-11");
  });

  test("invalid dates 400, nothing kicked", async () => {
    for (const until of ["2027-03-10", "2027-02-30", "later", undefined]) {
      const res = await api("POST", "ready", multi, { until });
      expect(res.status).toBe(400);
      expect(res.json.error).toBe("invalidDate");
    }
    expect(kicks).toEqual([]);
  });

  test("match-decision: wrong shape 400; another day 409 dayClosed; no game today 400 notYourMatch", async () => {
    const decide = (body: unknown) => api("POST", "match-decision", multi, body);
    expect((await decide({ date: D, fixtureId: "x", mode: "live" })).status).toBe(400);
    const other = await decide({ date: "2027-03-11", fixtureId: "x", mode: "simulate" });
    expect(other.status).toBe(409);
    expect(other.json.error).toBe("dayClosed");
    const none = await decide({ date: D, fixtureId: "x", mode: "simulate" });
    expect(none.status).toBe(400);
    expect(none.json.error).toBe("notYourMatch");
    expect(kicks).toEqual([]);
  });

  test("live-recording: invalid 400, wrong fixture 400, other day 409", async () => {
    const send = (body: unknown) => api("POST", "live-recording", multi, body);
    expect((await send({ date: D, fixtureId: "x", recording: { nope: 1 } })).json.error).toBe("invalidRecording");
    const rec = {
      fixtureId: "y", score: { home: 0, away: 0 }, teamStats: { home: {}, away: {} },
      playerStats: {}, playerRatings: {}, playerEnergy: {}, substitutions: [], durationMs: 1,
    };
    expect((await send({ date: D, fixtureId: "x", recording: rec })).json.error).toBe("notYourMatch");
    const okShape = { ...rec, fixtureId: "x" };
    expect((await send({ date: "2027-03-11", fixtureId: "x", recording: okShape })).status).toBe(409);
    expect((await send({ date: D, fixtureId: "x", recording: okShape })).json.error).toBe("notYourMatch");
    expect((await api("GET", "live-recording", multi)).status).toBe(404);
  });

  test("GET advance: the seat's view, no ids, no deadline while nobody is late", async () => {
    const res = await api("GET", "advance", multi);
    expect(res.status).toBe(200);
    expect(res.json.currentDate).toBe(D);
    expect(res.json.members).toHaveLength(2);
    expect(res.json.members.filter((m: { me: boolean }) => m.me)).toHaveLength(1);
    expect(JSON.stringify(res.json)).not.toContain("@");
    expect(res.json.waitingFor).toEqual(["Manager b"]);
    expect(res.json.deadlineAt).toBeNull();
    await saveService.updateSeat(multi, "a", { readyUntil: "2027-03-12" });
    await saveService.updateSeat(multi, "b", { readyUntil: "2027-03-12" });
    const ready = (await api("GET", "advance", multi)).json;
    expect(ready.waitingFor).toEqual([]);
    expect(ready.deadlineAt).toBeNull();
  });

  test("the deadline shows only while someone is late", async () => {
    const meta = (await saveService.getMeta(multi))!;
    await saveService.updateMeta(multi, { world: { ...meta.world!, advance: { running: false, waitingSince: "2026-10-15T12:00:00.000Z", target: D } } });
    expect((await api("GET", "advance", multi)).json.deadlineAt).toBeNull();
    await saveService.updateSeat(multi, "b", { readyUntil: null });
    const view = (await api("GET", "advance", multi)).json;
    expect(view.waitingFor).toEqual(["Manager b"]);
    expect(view.deadlineAt).toBe("2026-10-16T12:00:00.000Z");
  });

  test("summary: GET (days and one aggregate) then DELETE clears", async () => {
    expect((await api("GET", "summary", multi)).json).toEqual({ days: [], aggregate: null });
    await saveService.appendPendingDay(multi, "a", { date: D, newDate: "2027-03-11", seat: { jobOffers: 1 } }, 10);
    await saveService.appendPendingDay(multi, "a", { date: "2027-03-11", newDate: "2027-03-12", seat: { achievements: 2 } }, 10);
    const got = (await api("GET", "summary", multi)).json;
    expect(got.days).toHaveLength(2);
    expect(got.aggregate.range).toEqual({ from: D, to: "2027-03-11", days: 2 });
    expect(got.aggregate.log.achievements).toBe(2);
    expect(got.aggregate.notices).toMatchObject({ jobOffers: 1, readyCleared: true });
    expect((await api("DELETE", "summary", multi)).status).toBe(200);
    expect(await saveService.getPendingSummary(multi, "a")).toEqual([]);
  });

  test("GET advance shows the executor's failure as a code with the next retry; retry resets the count and kicks", async () => {
    const meta = (await saveService.getMeta(multi))!;
    const failed = { running: false, waitingSince: null, target: D, error: "dayFailed", errorAt: "2026-10-15T12:00:00.000Z", errorTries: 2 };
    await saveService.updateMeta(multi, { world: { ...meta.world!, advance: failed } });
    const view = (await api("GET", "advance", multi)).json;
    expect(view).toMatchObject({ error: "dayFailed", errorTries: 2, nextRetryAt: "2026-10-15T12:15:00.000Z", gaveUp: false });
    const early = await api("POST", "advance/retry", multi);
    expect(early.status).toBe(409);
    expect(early.json.error).toBe("notGaveUp");
    expect((await saveService.getMeta(multi))!.world!.advance!.errorTries).toBe(2);
    expect(kicks).toEqual([]);

    await saveService.updateMeta(multi, { world: { ...meta.world!, advance: { ...failed, errorTries: 5 } } });
    expect((await api("GET", "advance", multi)).json).toMatchObject({ errorTries: 5, nextRetryAt: null, gaveUp: true });

    const retry = await api("POST", "advance/retry", multi);
    expect(retry.status).toBe(200);
    expect((await saveService.getMeta(multi))!.world!.advance!.errorTries).toBe(0);
    expect(kicks).toEqual([multi]);
    expect((await api("GET", "advance", multi)).json).toMatchObject({ error: "dayFailed", gaveUp: false });

    await saveService.updateMeta(multi, { world: { ...meta.world!, advance: { running: false, waitingSince: null, target: D } } });
    const none = await api("POST", "advance/retry", multi);
    expect(none.status).toBe(409);
    expect(none.json.error).toBe("noError");
    expect((await api("GET", "advance", multi)).json).toMatchObject({ error: null, errorTries: 0, nextRetryAt: null, gaveUp: false });
    expect((await api("POST", "advance/retry", solo)).json.error).toBe("notMulti");
    expect((await api("POST", "advance/retry", lobby)).json.error).toBe("lobby");
    expect((await api("GET", "advance/retry", multi)).status).toBe(405);
  });

  test("the single-seat advance routes refuse a group world", async () => {
    const day = await callApi("POST", "/api/advance-day/:saveId", token, { params: { saveId: multi } });
    expect(day.status).toBe(409);
    expect(day.json.error).toBe("groupAdvance");
    const until = await callApi("POST", "/api/saves/:saveId/advance-until", token, { params: { saveId: multi } });
    expect(until.status).toBe(409);
    expect(until.json.error).toBe("groupAdvance");
  });
});

describe("group advance routes: the seat has a game today", () => {
  const kicks: string[] = [];
  let token = "";
  let id = "";
  let fixture: Record<string, unknown> = {};
  const spies: { mockRestore(): void }[] = [];
  const rec = (over: Record<string, unknown> = {}) => ({
    fixtureId: "fx1", score: { home: 1, away: 0 }, teamStats: { home: {}, away: {} },
    playerStats: {}, playerRatings: {}, playerEnergy: {}, substitutions: [], durationMs: 1, ...over,
  });
  const api = (method: "GET" | "POST", route: string, body?: unknown) =>
    callApi(method, "/api/worlds/:saveId/" + route, token, { params: { saveId: id }, body });

  beforeAll(async () => {
    setKickScheduler((sid) => kicks.push(sid));
    const login = devAutoLogin("ga-routes-game@test.local");
    token = login.session.token;
    id = await fakeWorld({ seatIds: ["a", "b"], date: D });
    addSaveMember(id, login.user.id, "a", "owner");
    fixture = { id: "fx1", competition: "premier_league", round: 1, date: D, home: "club-a", away: "club-x", played: false };
    spies.push(spyOn(saveService, "getFixturesForDate").mockImplementation(async () => [fixture] as never));
    spies.push(spyOn(saveService, "getSquadById").mockImplementation(
      async (_s: string, sid: string) => ({ id: sid, name: sid, players: [], youth: [] }) as never,
    ));
  });
  afterEach(() => { kicks.length = 0; });
  afterAll(async () => {
    setKickScheduler(null);
    for (const sp of spies) sp.mockRestore();
    deleteSaveMembers(id);
    await saveService.deleteSave(id);
  }, 60_000);

  test("match-decision: stores the decision, readyUntil >= D+1, drops a live recording, kicks", async () => {
    await saveService.writeLiveRecording(id, "a", { date: D, fixtureId: "fx1", recording: rec() as never });
    const res = await api("POST", "match-decision", { date: D, fixtureId: "fx1", mode: "simulate" });
    expect(res.status).toBe(200);
    const seat = (await saveService.getSeat(id, "a"))!;
    expect(seat.matchDecision).toEqual({ date: D, fixtureId: "fx1", mode: "simulate" });
    expect(seat.readyUntil! >= "2027-03-11").toBe(true);
    expect(await saveService.getLiveRecording(id, "a")).toBeNull();
    expect(kicks).toEqual([id]);
    expect((await api("POST", "match-decision", { date: D, fixtureId: "other", mode: "simulate" })).json.error).toBe("notYourMatch");
  });

  test("match-decision undo: clears a simulate decision of today and its D+1 ready; nothing to undo is 409", async () => {
    await saveService.updateSeat(id, "a", { readyUntil: null, matchDecision: undefined });
    expect((await api("POST", "match-decision", { date: D, fixtureId: "fx1", mode: "undo" })).json.error).toBe("noDecision");
    expect((await api("POST", "match-decision", { date: D, fixtureId: "fx1", mode: "simulate" })).status).toBe(200);
    const res = await api("POST", "match-decision", { date: D, fixtureId: "fx1", mode: "undo" });
    expect(res.status).toBe(200);
    const seat = (await saveService.getSeat(id, "a"))!;
    expect(seat.matchDecision ?? null).toBeNull();
    expect(seat.readyUntil ?? null).toBeNull();
  });

  test("live-recording: stores the file and the live decision, kicks; GET builds the event", async () => {
    const res = await api("POST", "live-recording", { date: D, fixtureId: "fx1", recording: rec() });
    expect(res.status).toBe(200);
    const seat = (await saveService.getSeat(id, "a"))!;
    expect(seat.matchDecision).toEqual({ date: D, fixtureId: "fx1", mode: "live" });
    expect((await saveService.getLiveRecording(id, "a"))!.fixtureId).toBe("fx1");
    expect(kicks).toEqual([id]);
    const got = await api("GET", "live-recording");
    expect(got.status).toBe(200);
    expect(got.json.event.fixtureId).toBe("fx1");
    expect(got.json.event.score).toEqual({ home: 1, away: 0 });
  });

  test("GET live-recording of an earlier date is 404", async () => {
    await saveService.writeLiveRecording(id, "a", { date: "2027-03-09", fixtureId: "fx1", recording: rec() as never });
    expect((await api("GET", "live-recording")).status).toBe(404);
  });

  test("a knockout level without a shootout winner is 400 noWinner", async () => {
    fixture = { ...fixture, knockout: true };
    const res = await api("POST", "live-recording", { date: D, fixtureId: "fx1", recording: rec({ score: { home: 1, away: 1 } }) });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("noWinner");
    fixture = { ...fixture, knockout: undefined };
  });

  test("a game against another seat is 409 seatOpponent", async () => {
    fixture = { ...fixture, away: "club-b" };
    const res = await api("POST", "live-recording", { date: D, fixtureId: "fx1", recording: rec() });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("seatOpponent");
  });
});
