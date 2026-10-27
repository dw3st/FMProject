import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { runningWorld } from "@/backend/testing/worldFixtures";
import { callApi } from "@/backend/worlds/worldTestUtils";
import { addSeat } from "@/backend/seats";
import { kickWorld, setKickScheduler, waitWorld } from "@/backend/groupAdvance";
import { withSaveLock } from "@/backend/saveLock";
import { createH2HMatch, type H2HMatch } from "@/backend/h2h/h2hMatch";
import {
  clearLostH2H, h2hRoomOf, handleH2HEvent, h2hSocketClosed, resetH2HRooms, setH2HClock, setH2HNotifier, setH2HSpawner,
  tickH2HPause, wireState,
} from "@/backend/h2h/h2hRooms";
import { handleClientEvent, type SocialSocket } from "@/backend/social/realtime";
import { addDays } from "@/Domain/dates";
import { H2H } from "@/Domain/h2h/h2hConfig";
import type { Fixture } from "@/types/calendarTypes";
import type { ServerEvent } from "@/types/socialTypes";
import type { WorkerIn, WorkerOut } from "@/types/h2hTypes";

/** A socket of the social layer, in memory. */
function fakeSocket(userId: string): SocialSocket & { sent: ServerEvent[] } {
  const sent: ServerEvent[] = [];
  return {
    data: { userId, session: "s", saveId: null, clubName: null },
    send: (m: string) => { sent.push(JSON.parse(m) as ServerEvent); },
    close: () => undefined,
    sent,
  };
}

/** The match runs in this process at high speed; the test drives its clock. */
interface TestEngine {
  posted: WorkerIn[];
  match: H2HMatch | null;
  deliver: (m: WorkerOut) => void;
}
let engine: TestEngine | null = null;

function drive(ms: number, step = 1000): void {
  const e = engine!;
  for (let t = 0; t < ms && e.match && !e.match.done; t += step) for (const m of e.match.tick(step)) e.deliver(m);
}

function driveToEnd(): void {
  const e = engine!;
  e.match?.setSpeed(600);
  for (let i = 0; i < 20_000 && e.match && !e.match.done; i++) for (const m of e.match.tick(1000)) e.deliver(m);
}

async function until(cond: () => boolean | Promise<boolean>, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("h2h rooms (live match between two managers)", () => {
  let saveId = "";
  let seatA = "";
  let seatB = "";
  let match: Fixture;
  let a: ReturnType<typeof devAutoLogin>;
  let b: ReturnType<typeof devAutoLogin>;
  const userEvents: { userId: string; event: ServerEvent }[] = [];
  const eventsOf = (userId: string, type: ServerEvent["type"]) =>
    userEvents.filter((e) => e.userId === userId && e.event.type === type).map((e) => e.event);
  let now = 1_000_000;

  beforeAll(async () => {
    setKickScheduler(() => {});
    setH2HNotifier((userId, event) => { userEvents.push({ userId, event }); });
    setH2HClock(() => now);
    setH2HSpawner((onMessage) => {
      const e: TestEngine = { posted: [], match: null, deliver: onMessage };
      engine = e;
      return {
        post: (m) => {
          e.posted.push(m);
          if (m.type === "init") {
            e.match = createH2HMatch(m.input);
            e.match.setSpeed(10);
          } else if (e.match && !e.match.done) {
            const out = m.type === "cmd" ? e.match.command(m.side, m.cmd)
              : m.type === "pause" ? e.match.setPaused(true)
                : m.type === "resume" ? e.match.setPaused(false)
                  : m.type === "auto" ? e.match.setAuto(m.side, m.on) : [];
            for (const o of out) onMessage(o);
          }
        },
        terminate: () => { e.match?.dispose(); e.match = null; },
      };
    });
    a = devAutoLogin("h2h-a@test.local");
    b = devAutoLogin("h2h-b@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    saveId = meta.id;
    seatA = await ownSolo(saveId, a.user.id);
    const all = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    // A home game of club 33 (seat A = home = engine side A).
    match = all
      .filter((f) => !f.played && f.home === "33" && f.date > addDays(meta.currentDate!, 3))
      .sort((x, y) => x.date.localeCompare(y.date))[0]!;
    seatB = (await addSeat(saveId, {
      userId: b.user.id, clubId: match.away,
      manager: { name: "Técnico B", nationalityIso: "br", backgroundId: "former-player" },
    })).seatId;
    await saveService.updateMeta(saveId, { currentDate: match.date, world: runningWorld(a.user.id) });
  }, 300_000);

  afterAll(async () => {
    resetH2HRooms();
    setKickScheduler(null);
    await waitWorld(saveId);
    deleteSaveMembers(saveId);
    await saveService.deleteSave(saveId);
  }, 120_000);

  const sockA = fakeSocket("");
  const sockB = fakeSocket("");
  beforeAll(() => {
    sockA.data.userId = a.user.id;
    sockB.data.userId = b.user.id;
  });

  test("join: the room opens and the other manager is invited (pop-up and one inbox message)", async () => {
    await handleH2HEvent(sockA, { type: "h2h_join", saveId, fixtureId: match.id });
    const room = h2hRoomOf(saveId, match.id)!;
    expect(room.phase).toBe("lobby");
    expect(room.sides.A.seatId).toBe(seatA);
    expect(room.sides.A.status).toBe("in");
    expect(room.sides.B.status).toBe("away");
    expect(eventsOf(b.user.id, "h2h_invite")).toHaveLength(1);
    const inbox = await saveService.getInbox(saveId, seatB);
    expect(inbox.filter((m) => m.category === "world" && m.kind === "h2h_invite")).toHaveLength(1);
    // A second tab of A: no second invite.
    await handleH2HEvent(fakeSocket(a.user.id), { type: "h2h_join", saveId, fixtureId: match.id });
    expect(eventsOf(b.user.id, "h2h_invite")).toHaveLength(1);
  }, 60_000);

  test("a stranger cannot join, an unjoined socket cannot command", async () => {
    const stranger = devAutoLogin("h2h-stranger@test.local");
    await handleH2HEvent(fakeSocket(stranger.user.id), { type: "h2h_join", saveId, fixtureId: match.id });
    expect(h2hRoomOf(saveId, match.id)!.sides.B.status).toBe("away");
    // Strict parsing on the socket: an unknown key drops the frame.
    await handleClientEvent(sockB, JSON.stringify({ type: "h2h_join", saveId, fixtureId: match.id, extra: 1 }));
    expect(h2hRoomOf(saveId, match.id)!.sides.B.status).toBe("away");
  });

  test("simulate by either seat closes the room for both", async () => {
    await handleH2HEvent(sockB, { type: "h2h_join", saveId, fixtureId: match.id });
    expect(h2hRoomOf(saveId, match.id)!.sides.B.status).toBe("in");
    const res = await callApi("POST", "/api/worlds/:saveId/match-decision", b.session.token, {
      params: { saveId }, body: { date: match.date, fixtureId: match.id, mode: "simulate" },
    });
    expect(res.status).toBe(200);
    expect(h2hRoomOf(saveId, match.id)).toBeNull();
    expect(eventsOf(a.user.id, "h2h_closed").at(-1)).toMatchObject({ reason: "simulated" });
    expect(eventsOf(b.user.id, "h2h_closed").at(-1)).toMatchObject({ reason: "simulated" });
    expect((await saveService.getSeat(saveId, seatA))!.matchDecision).toMatchObject({ mode: "simulate", fixtureId: match.id });
    expect((await saveService.getSeat(saveId, seatB))!.matchDecision).toMatchObject({ mode: "simulate", fixtureId: match.id });
    // Decided: no room any more.
    await handleH2HEvent(sockA, { type: "h2h_join", saveId, fixtureId: match.id });
    expect(h2hRoomOf(saveId, match.id)).toBeNull();
    // Both undo: the game is to decide again.
    for (const tok of [a.session.token, b.session.token]) {
      const undo = await callApi("POST", "/api/worlds/:saveId/match-decision", tok, {
        params: { saveId }, body: { date: match.date, fixtureId: match.id, mode: "undo" },
      });
      expect(undo.status).toBe(200);
    }
  }, 60_000);

  test("both ready: the match starts on the server", async () => {
    await handleH2HEvent(sockA, { type: "h2h_join", saveId, fixtureId: match.id });
    await handleH2HEvent(sockB, { type: "h2h_join", saveId, fixtureId: match.id });
    await handleH2HEvent(sockA, { type: "h2h_ready" });
    expect(h2hRoomOf(saveId, match.id)!.phase).toBe("lobby");
    await handleH2HEvent(sockB, { type: "h2h_ready" });
    await until(() => h2hRoomOf(saveId, match.id)?.phase === "live");
    expect(engine!.match).not.toBeNull();
    expect((await saveService.getMeta(saveId))!.world!.h2hLive).toEqual([{ fixtureId: match.id, date: match.date, seats: [seatA, seatB] }]);
    drive(500, 50);
    expect(sockA.sent.some((e) => e.type === "h2h_frame")).toBe(true);
    expect(sockB.sent.some((e) => e.type === "h2h_state")).toBe(true);
  }, 120_000);

  test("each socket commands only its own side", async () => {
    const before = engine!.posted.length;
    await handleH2HEvent(sockB, { type: "h2h_cmd", cmd: { kind: "mentality", mentality: "attacking" } });
    await handleH2HEvent(fakeSocket(a.user.id), { type: "h2h_cmd", cmd: { kind: "mentality", mentality: "defensive" } });
    const cmds = engine!.posted.slice(before).filter((m) => m.type === "cmd");
    expect(cmds).toEqual([{ type: "cmd", side: "B", cmd: { kind: "mentality", mentality: "attacking" } }]);
  });

  test("pauses: three per manager, only who paused resumes early, a pause runs out", async () => {
    await handleH2HEvent(sockA, { type: "h2h_pause" });
    expect(engine!.match!.paused).toBe(true);
    expect(h2hRoomOf(saveId, match.id)!.pause).toMatchObject({ by: "A" });
    await handleH2HEvent(sockB, { type: "h2h_resume" });
    expect(engine!.match!.paused).toBe(true);
    await handleH2HEvent(sockB, { type: "h2h_pause" });
    expect(h2hRoomOf(saveId, match.id)!.pause!.by).toBe("A");
    await handleH2HEvent(sockA, { type: "h2h_resume" });
    expect(engine!.match!.paused).toBe(false);
    await handleH2HEvent(sockA, { type: "h2h_pause" });
    now += H2H.PAUSE_SECONDS * 1000;
    tickH2HPause(saveId, match.id);
    expect(engine!.match!.paused).toBe(false);
    expect(h2hRoomOf(saveId, match.id)!.pause).toBeNull();
    await handleH2HEvent(sockA, { type: "h2h_pause" });
    await handleH2HEvent(sockA, { type: "h2h_resume" });
    expect(h2hRoomOf(saveId, match.id)!.sides.A.pausesLeft).toBe(0);
    await handleH2HEvent(sockA, { type: "h2h_pause" });
    expect(h2hRoomOf(saveId, match.id)!.pause).toBeNull();
    expect(eventsOf(b.user.id, "h2h_paused").length).toBeGreaterThan(0);
  });

  test("a drop hands the side to the assistant; the rejoin takes it back with the full state", async () => {
    h2hSocketClosed(sockB);
    expect(h2hRoomOf(saveId, match.id)!.sides.B.connected).toBe(false);
    expect(engine!.match!.state.autoSubs?.B).toBe(true);
    drive(200, 50);
    const back = fakeSocket(b.user.id);
    await handleH2HEvent(back, { type: "h2h_join", saveId, fixtureId: match.id });
    expect(engine!.match!.state.autoSubs?.B).toBeUndefined();
    const first = back.sent.find((e) => e.type === "h2h_state");
    expect(first && first.type === "h2h_state" && first.state.benchB !== undefined && first.stats.snapshot !== undefined).toBe(true);
    // Slimmed for the socket.
    const full = JSON.stringify(engine!.match!.state).length;
    const wire = JSON.stringify(wireState(engine!.match!.state, true)).length;
    expect(wire).toBeLessThan(full * 0.6);
  });

  test("full time: the recording is stored, both decide live, the day plays it", async () => {
    driveToEnd();
    await until(() => h2hRoomOf(saveId, match.id) === null);
    expect(eventsOf(a.user.id, "h2h_done")).toHaveLength(1);
    expect(eventsOf(b.user.id, "h2h_done")).toHaveLength(1);
    const file = (await saveService.getLiveRecording(saveId, seatA))!;
    expect(file.fixtureId).toBe(match.id);
    expect(await saveService.getLiveRecording(saveId, seatB)).toBeNull();
    expect((await saveService.getSeat(saveId, seatA))!.matchDecision).toMatchObject({ mode: "live" });
    expect((await saveService.getSeat(saveId, seatB))!.matchDecision).toMatchObject({ mode: "live" });
    expect((await saveService.getMeta(saveId))!.world!.h2hLive).toBeUndefined();
    // The away seat reads the provisional result too.
    const prov = await callApi("GET", "/api/worlds/:saveId/live-recording", b.session.token, { params: { saveId } });
    expect(prov.status).toBe(200);
    const score = file.recording.score;
    await saveService.updateSeat(saveId, seatA, { readyUntil: addDays(match.date, 1) });
    await saveService.updateSeat(saveId, seatB, { readyUntil: addDays(match.date, 1) });
    const run = await kickWorld(saveId);
    expect(run.error).toBeUndefined();
    const played = (await saveService.getAllFixturesForLeague(saveId, "premier_league")).find((f) => f.id === match.id)!;
    expect(played.played).toBe(true);
    expect(played.result).toEqual(score);
  }, 300_000);

  test("server restart: a live match left in the marker is lost and both seats are told", async () => {
    const meta = (await saveService.getMeta(saveId))!;
    await saveService.updateMeta(saveId, {
      world: { ...meta.world!, h2hLive: [{ fixtureId: "lost-fixture", date: meta.currentDate!, seats: [seatA, seatB] }] },
    });
    const n = await withSaveLock(saveId, () => clearLostH2H(saveService, saveId));
    expect(n).toBe(1);
    expect((await saveService.getMeta(saveId))!.world!.h2hLive).toBeUndefined();
    for (const seat of [seatA, seatB]) {
      const inbox = await saveService.getInbox(saveId, seat);
      expect(inbox.some((m) => m.category === "world" && m.kind === "h2h_lost")).toBe(true);
    }
  });
});
