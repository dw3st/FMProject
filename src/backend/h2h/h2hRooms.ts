/**
 * Live match between two managers, main process side (multiplayer part 7, spec 2026-10-27-multiplayer-h2h-live §2).
 *
 * Rooms live in memory, keyed `saveId:fixtureId`: the pure room (`h2hRules.ts`), the sockets that joined it (a user
 * may have several tabs; only the joined sockets get the match), the match engine (one Bun Worker per match,
 * `h2hWorker.ts`) and what the browsers need on a (re)join (the latest state and statistics).
 *
 * Writes to the save (the restart marker `world.h2hLive`, the recording and both decisions at full time, the invite
 * message) run under the save lock. The callers that already hold it (the match-decision route, the deadline
 * assistant, the server resume) use the lock-free helpers at the bottom.
 */
import { saveService as defaultService, type SaveService, type SeatMeta } from "@/backend/SaveService";
import { withSaveLock } from "@/backend/saveLock";
import { memberBySeat, memberOf } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { notifyUser, type SocialSocket } from "@/backend/social/realtime";
import { matchSetupFor } from "@/backend/matchSetup";
import { scheduleKick, seatMatchOn } from "@/backend/groupAdvance";
import { knockoutRecordingDecided, validatePlayedMatch } from "@/backend/playedMatchValidation";
import { pushServerLiveScore, setServerOwnedLive } from "@/backend/rivals/liveScores";
import { logError } from "@/Logger";
import { addDays } from "@/Domain/dates";
import { isGroupWorld, laterDate } from "@/Domain/groupAdvance/groupAdvance";
import { H2H } from "@/Domain/h2h/h2hConfig";
import {
  canPause, canResume, closeRoom as closeRoomState, endPause, finishRoom, joinRoom, leaveRoom, newRoom, pauseExpired,
  roomView, setReady, startPause, type H2HRoom,
} from "@/Domain/h2h/h2hRules";
import { eligibleLivePlayers, type LiveMatchInput, type LiveSideInput } from "@/Domain/match/liveMatchSetup";
import { buildPlayedMatchRecording } from "@/Domain/advanceDay/buildPlayedMatchRecording";
import { buildH2HMessage } from "@/Domain/inbox/worldAdvanceMessage";
import { squadFamiliarityLevels } from "@/Domain/familiarity/familiarity";
import { staffEffectsOf } from "@/Domain/staff/staff";
import { importStatsState } from "@/GameEngine/Domain/Statistics";
import { importRatings } from "@/GameEngine/Domain/PlayerRating";
import { isLivePhase, matchMinute } from "@/GameEngine/Domain/gameState";
import { DEFAULT_MENTALITY, type TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { Formation, GamePlayer, GameState, PendingPenalty } from "@/GameEngine/types";
import { aiDive, aiKick, resolveKick, type GoalArea, type KickInput, type PenaltyChoice } from "@/Domain/penalty/penaltyKick";
import type { Squad } from "@/types/playerTypes";
import type { H2HLiveEntry } from "@/types/multiplayerTypes";
import type { LiveBase, LivePhase } from "@/types/rivalsTypes";
import type { ClientEvent, ServerEvent } from "@/types/socialTypes";
import type {
  H2HCloseReason, H2HCommand, H2HSide, H2HStatsPayload, H2HWirePlayer, H2HWireState, H2HWireStats, WorkerIn, WorkerOut,
} from "@/types/h2hTypes";

// ── Engine (a Bun Worker; tests run the match in-process) ────────────────────

export interface H2HEngine {
  post(msg: WorkerIn): void;
  terminate(): void;
}
export type H2HSpawner = (onMessage: (m: WorkerOut) => void, onError: (e: unknown) => void) => H2HEngine;

const workerSpawner: H2HSpawner = (onMessage, onError) => {
  const w = new Worker(new URL("./h2hWorker.ts", import.meta.url));
  w.onmessage = (e: MessageEvent<WorkerOut>) => onMessage(e.data);
  w.onerror = (e) => onError(e);
  return { post: (m) => w.postMessage(m), terminate: () => w.terminate() };
};

let spawner: H2HSpawner = workerSpawner;
let notify: (userId: string, event: ServerEvent) => void = (u, e) => notifyUser(u, e);
const service: SaveService = defaultService;

let clock: () => number = () => Date.now();

/** Tests only: a fake clock for the pauses. `null` restores `Date.now`. */
export function setH2HClock(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}

/** Tests only: run the pause expiry check now (the timer does it in play). */
export function tickH2HPause(saveId: string, fixtureId: string): void {
  const rec = rooms.get(roomKey(saveId, fixtureId));
  if (rec && pauseExpired(rec.room, clock())) resumeMatch(rec);
}

/** Tests only: run the match in-process. `null` restores the Bun Worker. */
export function setH2HSpawner(fn: H2HSpawner | null): void {
  spawner = fn ?? workerSpawner;
}
/** Tests only: catch the per-user events. `null` restores `notifyUser`. */
export function setH2HNotifier(fn: ((userId: string, event: ServerEvent) => void) | null): void {
  notify = fn ?? ((u, e) => notifyUser(u, e));
}

// ── Rooms ────────────────────────────────────────────────────────────────────

const SIDES: H2HSide[] = ["A", "B"];
/** Full statistics store to the browsers at most this often (the light part goes with every state). */
const SNAPSHOT_EVERY_MS = 3000;

interface Rec {
  key: string;
  room: H2HRoom;
  fixture: Fixture;
  users: Record<H2HSide, string>;
  sockets: Map<SocialSocket, H2HSide>;
  engine: H2HEngine | null;
  /** A banned manager watches from the stands: his side stays on the assistant even when connected. */
  banned: Record<H2HSide, boolean>;
  inviteSent: boolean;
  starting: boolean;
  finishing: boolean;
  pauseTimer: ReturnType<typeof setTimeout> | null;
  /** What a (re)joining socket gets: the full wire state (benches included) and statistics (snapshot included). */
  lastState: H2HWireState | null;
  lastStats: H2HWireStats | null;
  benchSig: { A: string; B: string };
  lastSnapshotAt: number;
  /** Rivals: the friends' live score of both seats (part 6), sent by the server. */
  live: { bases: Record<H2HSide, LiveBase>; scorers: Set<string>; lastMinute: number } | null;
  /** Engine id → name (scorers), from the latest state. */
  names: Map<number, string>;
  /** Each manager kicks and saves his penalties in 2D (chosen in the preview, sent with `h2h_ready`). */
  penalty2d: Record<H2HSide, boolean>;
  /** The penalty waiting for both choices (2D): the assistant fills a side that is automatic or too slow. */
  penalty: PenaltyRound | null;
}

interface PenaltyRound {
  pending: PendingPenalty;
  kick: KickInput | null;
  dive: GoalArea | null;
  timer: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
}

const rooms = new Map<string, Rec>();
const socketRoom = new WeakMap<SocialSocket, string>();

const roomKey = (saveId: string, fixtureId: string) => `${saveId}:${fixtureId}`;

/** Tests only: a side's 2D penalty choice, as `h2h_ready` would set it in the lobby. */
export function setH2HPenalty2d(saveId: string, fixtureId: string, side: H2HSide, on: boolean): void {
  const rec = rooms.get(roomKey(saveId, fixtureId));
  if (rec) rec.penalty2d = { ...rec.penalty2d, [side]: on };
}

/** Tests only. */
export function resetH2HRooms(): void {
  for (const rec of rooms.values()) {
    rec.engine?.terminate();
    if (rec.pauseTimer) clearTimeout(rec.pauseTimer);
    setServerOwnedLive(rec.room.saveId, rec.room.fixtureId, false);
  }
  rooms.clear();
  spawner = workerSpawner;
  notify = (u, e) => notifyUser(u, e);
  clock = () => Date.now();
}

/** The room of a game, for tests and the screens. */
export function h2hRoomOf(saveId: string, fixtureId: string): H2HRoom | null {
  return rooms.get(roomKey(saveId, fixtureId))?.room ?? null;
}

/** Whether a live match of this game runs on the server now. */
export function isH2HLive(saveId: string, fixtureId: string): boolean {
  return rooms.get(roomKey(saveId, fixtureId))?.room.phase === "live";
}

function sideOfSocket(rec: Rec, ws: SocialSocket): H2HSide | null {
  return rec.sockets.get(ws) ?? null;
}

function sendRaw(ws: SocialSocket, json: string): void {
  try {
    ws.send(json);
  } catch {
    // closed socket: the close handler removes it
  }
}

/** One serialization for every joined socket of the room. */
function toSockets(rec: Rec, event: ServerEvent): void {
  if (rec.sockets.size === 0) return;
  const json = JSON.stringify(event);
  for (const ws of rec.sockets.keys()) sendRaw(ws, json);
}

/** The room to both managers (every tab), each with his own side. */
function broadcastRoom(rec: Rec): void {
  const room = roomView(rec.room);
  for (const side of SIDES) notify(rec.users[side], { type: "h2h_room", room, mySide: side });
}

function pausedEvent(rec: Rec): ServerEvent {
  return {
    type: "h2h_paused", saveId: rec.room.saveId, fixtureId: rec.room.fixtureId,
    by: rec.room.pause?.by ?? null, until: rec.room.pause?.until ?? null,
    left: { A: rec.room.sides.A.pausesLeft, B: rec.room.sides.B.pausesLeft },
  };
}

function toUsers(rec: Rec, event: ServerEvent): void {
  for (const side of SIDES) notify(rec.users[side], event);
}

function dropRoom(rec: Rec): void {
  clearPenalty(rec);
  rec.engine?.terminate();
  rec.engine = null;
  if (rec.pauseTimer) clearTimeout(rec.pauseTimer);
  rec.pauseTimer = null;
  setServerOwnedLive(rec.room.saveId, rec.room.fixtureId, false);
  if (rooms.get(rec.key) === rec) rooms.delete(rec.key);
}

// ── Wire state (what the browsers get) ───────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function roundStats<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === "number" ? r3(v) : v;
  return out as T;
}

/** A player without the engine-only fields, numbers rounded (a player goes from ~2.2 KB to ~0.9 KB). */
export function wirePlayer(p: GamePlayer): H2HWirePlayer {
  const { fit: _f, baseStats: _b, decisionMemory: _d, engine: _e, bounds: _bo, fatigueBaselineEnergy: _fb, ...rest } = p;
  return {
    ...rest,
    ...(p.fit ? { fit: { aptitudes: p.fit.aptitudes } } : {}),
    x: r2(p.x),
    y: r2(p.y),
    energy: r2(p.energy),
    startEnergy: r2(p.startEnergy),
    targetPosition: { x: r2(p.targetPosition.x), y: r2(p.targetPosition.y) },
    runtimeStats: { withBall: roundStats(p.runtimeStats.withBall), withoutBall: roundStats(p.runtimeStats.withoutBall) },
  };
}

/** The wire state; `benches` false leaves the benches out (unchanged since the last state). */
export function wireState(state: GameState, benches: boolean): H2HWireState {
  const { players, benchA, benchB, throughBallCellsCache: _c, ...rest } = state;
  return {
    ...rest,
    players: players.map(wirePlayer),
    ...(benches ? { benchA: benchA.map(wirePlayer), benchB: benchB.map(wirePlayer) } : {}),
  };
}

function wireStats(stats: H2HStatsPayload, snapshot: boolean): H2HWireStats {
  return { teams: stats.teams, goals: stats.goals, ratings: stats.ratings, ...(snapshot ? { snapshot: stats.snapshot } : {}) };
}

// ── Engine output ────────────────────────────────────────────────────────────

function onState(rec: Rec, state: GameState, stats: H2HStatsPayload, now = clock()): void {
  const full = wireState(state, true);
  for (const p of [...state.players, ...state.benchA, ...state.benchB]) rec.names.set(p.id, p.name);
  const sig = { A: JSON.stringify(full.benchA), B: JSON.stringify(full.benchB) };
  const benches = sig.A !== rec.benchSig.A || sig.B !== rec.benchSig.B;
  rec.benchSig = sig;
  const snapshot = now - rec.lastSnapshotAt >= SNAPSHOT_EVERY_MS;
  if (snapshot) rec.lastSnapshotAt = now;
  rec.lastState = full;
  rec.lastStats = wireStats(stats, true);
  const out: H2HWireState = benches ? full : wireState(state, false);
  toSockets(rec, {
    type: "h2h_state", saveId: rec.room.saveId, fixtureId: rec.room.fixtureId, state: out, stats: wireStats(stats, snapshot),
  });
}

function liveFrame(rec: Rec, phase: LivePhase, minute: number, score: { A: number; B: number }, extra?: { scorer?: string; team?: H2HSide }) {
  if (!rec.live) return;
  for (const side of SIDES) {
    const mine = side === "A" ? score.A : score.B;
    const theirs = side === "A" ? score.B : score.A;
    pushServerLiveScore(rec.live.bases[side], rec.live.scorers, {
      saveId: rec.room.saveId, fixtureId: rec.room.fixtureId, phase, minute: Math.max(0, Math.min(130, minute)),
      score: { for: mine, against: theirs },
      ...(extra?.scorer ? { scorer: extra.scorer } : {}),
      ...(phase === "red" && extra?.team ? { side: extra.team === side ? ("for" as const) : ("against" as const) } : {}),
    }, notify, undefined, new Set([rec.room.sides.A.seatId, rec.room.sides.B.seatId]));
  }
}

function onEvent(rec: Rec, name: string, payload: unknown): void {
  toSockets(rec, { type: "h2h_event", saveId: rec.room.saveId, fixtureId: rec.room.fixtureId, name, payload });
  const p = payload as Record<string, unknown>;
  const score = (p.score as { A: number; B: number } | undefined) ?? rec.lastState?.score ?? { A: 0, B: 0 };
  const minute = typeof p.minute === "number" ? p.minute : 0;
  if (name === "goalScored") liveFrame(rec, "goal", minute, score, { scorer: rec.names.get(p.scorerId as number) });
  else if (name === "goalDisallowed") liveFrame(rec, "disallowed", minute, score);
  else if (name === "halfTime") liveFrame(rec, "half", 45, score);
  else if (name === "penaltyPending") startPenaltyRound(rec, payload as PendingPenalty);
  else if (name === "card" && p.card === "red") {
    liveFrame(rec, "red", minute, rec.lastState?.score ?? { A: 0, B: 0 }, { scorer: p.playerName as string, team: p.team as H2HSide });
  }
}

function onFrame(rec: Rec, m: Extract<WorkerOut, { type: "frame" }>): void {
  const { type: _t, ...frame } = m;
  toSockets(rec, { type: "h2h_frame", saveId: rec.room.saveId, fixtureId: rec.room.fixtureId, ...frame });
  // The friends' clock: a `minute` frame every LIVE_MINUTE_STEP minutes of play.
  if (rec.live && isLivePhase(m.phase) && m.minute - rec.live.lastMinute >= 5) {
    rec.live.lastMinute = m.minute;
    liveFrame(rec, "minute", m.minute, m.score);
  }
}

function onEngineMessage(rec: Rec, m: WorkerOut): void {
  if (rooms.get(rec.key) !== rec || rec.room.phase !== "live") return;
  if (m.type === "frame") onFrame(rec, m);
  else if (m.type === "event") onEvent(rec, m.name, m.payload);
  else if (m.type === "state") onState(rec, m.state, m.stats);
  else if (m.type === "done") void finishMatch(rec, m.state, m.stats);
}

// ── Joining, readiness, commands, pauses ─────────────────────────────────────

interface JoinContext {
  meta: SeatMeta;
  side: H2HSide;
  fixture: Fixture;
  seats: Record<H2HSide, string>;
  users: Record<H2HSide, string>;
}

/**
 * Who may open the room: a member whose club plays another seat's club today (the world's date), the game not decided
 * by either seat yet. Null otherwise (a refused join is silent, like the other socket events).
 */
async function joinContext(userId: string, saveId: string, fixtureId: string): Promise<JoinContext | null> {
  const member = memberOf(saveId, userId);
  if (!member) return null;
  const world = await service.getMeta(saveId);
  if (!world || !isGroupWorld(world) || world.world?.phase !== "running" || !world.currentDate) return null;
  const meta = await service.getSeatMeta(saveId, member.seatId);
  if (!meta?.clubId || meta.unemployed) return null;
  const date = world.currentDate;
  const fixture = await seatMatchOn(service, saveId, member.seatId, date);
  if (!fixture || fixture.id !== fixtureId || (fixture.home !== meta.clubId && fixture.away !== meta.clubId)) return null;
  const oppClub = fixture.home === meta.clubId ? fixture.away : fixture.home;
  const oppSeat = await service.seatOfClub(saveId, oppClub);
  if (!oppSeat || oppSeat === member.seatId) return null;
  const oppUser = memberBySeat(saveId, oppSeat)?.userId;
  if (!oppUser) return null;
  const opp = await service.getSeat(saveId, oppSeat);
  if (meta.matchDecision?.date === date || opp?.matchDecision?.date === date) return null;
  const side: H2HSide = fixture.home === meta.clubId ? "A" : "B";
  const other: H2HSide = side === "A" ? "B" : "A";
  return {
    meta, side, fixture,
    seats: { [side]: member.seatId, [other]: oppSeat } as Record<H2HSide, string>,
    users: { [side]: userId, [other]: oppUser } as Record<H2HSide, string>,
  };
}

async function sideIdentity(saveId: string, seatId: string, userId: string) {
  const seat = await service.getSeat(saveId, seatId);
  return {
    seatId,
    nickname: getSocialUser(userId)?.nickname ?? null,
    clubId: seat?.clubId ?? "",
    clubName: seat?.clubName ?? "",
  };
}

async function join(ws: SocialSocket, saveId: string, fixtureId: string): Promise<void> {
  const { userId } = ws.data;
  const key = roomKey(saveId, fixtureId);
  let rec = rooms.get(key);
  let side: H2HSide;
  if (rec) {
    const s = SIDES.find((x) => rec!.users[x] === userId);
    if (!s || rec.room.phase === "done" || rec.room.phase === "closed") return;
    side = s;
  } else {
    const ctx = await joinContext(userId, saveId, fixtureId);
    if (!ctx) return;
    // A concurrent join may have created it while we read.
    rec = rooms.get(key);
    if (!rec) {
      const [a, b] = await Promise.all([
        sideIdentity(saveId, ctx.seats.A, ctx.users.A), sideIdentity(saveId, ctx.seats.B, ctx.users.B),
      ]);
      rec = rooms.get(key) ?? {
        key,
        room: newRoom({ saveId, fixtureId, date: ctx.fixture.date, sides: { A: a, B: b } }),
        fixture: ctx.fixture,
        users: ctx.users,
        sockets: new Map(),
        engine: null,
        banned: { A: false, B: false },
        inviteSent: false,
        starting: false,
        finishing: false,
        pauseTimer: null,
        lastState: null,
        lastStats: null,
        benchSig: { A: "", B: "" },
        lastSnapshotAt: 0,
        live: null,
        names: new Map(),
        penalty2d: { A: false, B: false },
        penalty: null,
      };
      rooms.set(key, rec);
    }
    side = ctx.side;
    if (rec.users[side] !== userId) return;
  }
  const prevKey = socketRoom.get(ws);
  if (prevKey && prevKey !== key) leaveSocket(ws);
  rec.sockets.set(ws, side);
  socketRoom.set(ws, key);
  const wasConnected = rec.room.sides[side].connected;
  rec.room = joinRoom(rec.room, side).room;
  if (rec.room.phase === "live") {
    // Back from a drop: he gets the whole state first (benches, full statistics), then his manager takes over
    // again (a banned one stays in the stands).
    if (rec.lastState && rec.lastStats) {
      sendRaw(ws, JSON.stringify({
        type: "h2h_state", saveId, fixtureId, state: rec.lastState, stats: rec.lastStats,
      } satisfies ServerEvent));
    }
    if (rec.room.pause) sendRaw(ws, JSON.stringify(pausedEvent(rec)));
    if (!wasConnected && !rec.banned[side]) rec.engine?.post({ type: "auto", side, on: false });
  }
  broadcastRoom(rec);
  const other: H2HSide = side === "A" ? "B" : "A";
  if (!rec.inviteSent && rec.room.phase === "lobby" && rec.room.sides[other].status === "away") {
    rec.inviteSent = true;
    await invite(rec, side, other);
  }
}

/**
 * A tab of `userId` said hello in `saveId`: every open lobby of that world where the other manager waits for him gets
 * its pop-up again (the first one only reached the tabs online when the room opened). No inbox message.
 */
export function resendH2HInvites(userId: string, saveId: string): void {
  for (const rec of rooms.values()) {
    if (rec.room.saveId !== saveId || rec.room.phase !== "lobby") continue;
    for (const to of ["A", "B"] as const) {
      const from: H2HSide = to === "A" ? "B" : "A";
      if (rec.users[to] !== userId || rec.room.sides[to].status !== "away" || rec.room.sides[from].status === "away") continue;
      const fromSide = rec.room.sides[from];
      notify(userId, { type: "h2h_invite", saveId, fixtureId: rec.room.fixtureId, from: fromSide.nickname ?? fromSide.clubName });
    }
  }
}

/** The other manager: a pop-up on every tab and one message in his inbox (once per room). */
async function invite(rec: Rec, from: H2HSide, to: H2HSide): Promise<void> {
  const { saveId, fixtureId, date } = rec.room;
  const fromSide = rec.room.sides[from];
  notify(rec.users[to], { type: "h2h_invite", saveId, fixtureId, from: fromSide.nickname ?? fromSide.clubName });
  try {
    await withSaveLock(saveId, async () => {
      const seat = await service.getSeat(saveId, fromSide.seatId);
      await service.appendInbox(saveId, buildH2HMessage({
        kind: "h2h_invite", date, fixtureId, managerName: seat?.manager?.name ?? fromSide.nickname ?? "", clubName: fromSide.clubName,
      }), rec.room.sides[to].seatId);
    });
  } catch (e) {
    logError("world", `save ${saveId}: h2h invite message failed`, e);
  }
}

/** A socket leaves its room (`h2h_leave` or a closed socket). */
function leaveSocket(ws: SocialSocket): void {
  const key = socketRoom.get(ws);
  socketRoom.delete(ws);
  if (!key) return;
  const rec = rooms.get(key);
  if (!rec) return;
  const side = sideOfSocket(rec, ws);
  rec.sockets.delete(ws);
  if (!side || [...rec.sockets.values()].includes(side)) return;
  rec.room = leaveRoom(rec.room, side).room;
  if (rec.room.phase === "live") {
    // Nobody of that side left: the assistant takes over at once (the match never stops).
    rec.engine?.post({ type: "auto", side, on: true });
  } else if (rec.room.phase === "lobby" && SIDES.every((s) => rec.room.sides[s].status === "away")) {
    dropRoom(rec);
    return;
  }
  broadcastRoom(rec);
}

function ready(ws: SocialSocket, penalty2d: boolean): void {
  const rec = recOf(ws);
  const side = rec && sideOfSocket(rec, ws);
  if (!rec || !side || rec.starting) return;
  if (rec.room.phase === "lobby") rec.penalty2d = { ...rec.penalty2d, [side]: penalty2d };
  const change = setReady(rec.room, side);
  if (change.start) {
    // Kept in the lobby until the match is built (a failure closes the room).
    rec.starting = true;
    rec.room = { ...change.room, phase: "lobby" };
    broadcastRoom(rec);
    void startMatch(rec).catch((e) => {
      logError("world", `save ${rec.room.saveId}: h2h start failed`, e);
      closeWith(rec, "failed");
    });
    return;
  }
  rec.room = change.room;
  broadcastRoom(rec);
}

function recOf(ws: SocialSocket): Rec | null {
  const key = socketRoom.get(ws);
  return key ? rooms.get(key) ?? null : null;
}

function command(ws: SocialSocket, cmd: H2HCommand): void {
  const rec = recOf(ws);
  const side = rec && sideOfSocket(rec, ws);
  if (!rec || !side || rec.room.phase !== "live" || rec.banned[side]) return;
  rec.engine?.post({ type: "cmd", side, cmd });
}

function armPauseTimer(rec: Rec): void {
  if (rec.pauseTimer) clearTimeout(rec.pauseTimer);
  rec.pauseTimer = null;
  if (!rec.room.pause) return;
  const until = rec.room.pause.until;
  rec.pauseTimer = setTimeout(() => {
    rec.pauseTimer = null;
    if (rooms.get(rec.key) !== rec || !rec.room.pause || rec.room.pause.until !== until) return;
    if (pauseExpired(rec.room, clock())) resumeMatch(rec);
    else armPauseTimer(rec);
  }, Math.max(0, until - clock()));
}

function resumeMatch(rec: Rec): void {
  rec.room = endPause(rec.room);
  armPauseTimer(rec);
  rec.engine?.post({ type: "resume" });
  toUsers(rec, pausedEvent(rec));
  broadcastRoom(rec);
}

function pause(ws: SocialSocket, now = clock()): void {
  const rec = recOf(ws);
  const side = rec && sideOfSocket(rec, ws);
  if (!rec || !side || !canPause(rec.room, side, now)) return;
  rec.room = startPause(rec.room, side, now);
  rec.engine?.post({ type: "pause" });
  armPauseTimer(rec);
  toUsers(rec, pausedEvent(rec));
  broadcastRoom(rec);
}

function resume(ws: SocialSocket, now = clock()): void {
  const rec = recOf(ws);
  const side = rec && sideOfSocket(rec, ws);
  if (!rec || !side || !canResume(rec.room, side, now)) return;
  resumeMatch(rec);
}

/** The `h2h_*` socket events (`realtime.ts` parsed and rate-limited them). */
export async function handleH2HEvent(
  ws: SocialSocket,
  event: Extract<ClientEvent, { type: `h2h_${string}` }>,
): Promise<void> {
  switch (event.type) {
    case "h2h_join": await join(ws, event.saveId, event.fixtureId); break;
    case "h2h_ready": ready(ws, event.penalty2d === true); break;
    case "h2h_penalty": penaltyChoice(ws, event.choice); break;
    case "h2h_cmd": command(ws, event.cmd); break;
    case "h2h_pause": pause(ws); break;
    case "h2h_resume": resume(ws); break;
    case "h2h_leave": leaveSocket(ws); break;
  }
}

/** A socket closed (`realtime.ts`). */
export function h2hSocketClosed(ws: SocialSocket): void {
  leaveSocket(ws);
}

// ── Start ────────────────────────────────────────────────────────────────────

interface SetupBody {
  mySquad: Squad;
  mySquadId: string;
  fixture: Fixture;
  myFormation: Formation;
  myLineup: string[];
  myTactics: TacticsSave;
  matchMarking?: { date: string; marks: { slot: number; targetId: string }[] } | null;
  registered?: { mine: string[]; opp: string[] } | null;
  managerBanned?: boolean;
  pitch?: { condition: number; turf?: "natural" | "hybrid" | "synthetic" } | null;
  weatherEffect?: { effective: LiveMatchInput["weather"] } | null;
  referee?: { id: string; name: string; country: string; strictness: number; quality?: number; var?: boolean } | null;
  h2h?: boolean;
}

/** One seat's side of the match, from its own match-setup (as `MatchScreen` builds the user's side). */
function sideInput(body: SetupBody, date: string): LiveSideInput {
  const tactics = body.myTactics;
  const mine = body.registered ? new Set(body.registered.mine) : null;
  return {
    players: eligibleLivePlayers(body.mySquad.players, date, mine),
    formation: body.myFormation,
    lineup: body.myLineup,
    tactics: {
      style: tactics.tactical_style,
      mentality: DEFAULT_MENTALITY,
      axesOverride: tactics.axesOverride,
      familiarity: squadFamiliarityLevels(body.mySquad, tactics.tactical_style),
    },
    staffInjuryMult: staffEffectsOf(body.mySquad).injuryMult,
    morale: "own",
    human: true,
    slotInstructions: tactics.slotInstructions,
    marks: (body.matchMarking?.marks ?? []).map((m) => ({ slot: m.slot, targetRosterId: m.targetId })),
    setPieceTakers: tactics.setPieceTakers,
    managerBanned: body.managerBanned === true,
    ...(body.mySquad.managerAttributes ? { managerDiscipline: body.mySquad.managerAttributes.discipline } : {}),
  };
}

/** The match input from both seats' match-setups (A = home). Shared data (pitch, weather, referee) from the home seat's. */
export function h2hMatchInput(home: SetupBody, away: SetupBody): LiveMatchInput {
  const fixture = home.fixture;
  const date = fixture.date;
  const ref = home.referee;
  return {
    A: sideInput(home, date),
    B: sideInput(away, date),
    date,
    knockout: fixture.knockout === true,
    ...(fixture.aggregate ? { aggregate: { A: fixture.aggregate.home, B: fixture.aggregate.away } } : {}),
    ...(home.pitch ? { pitch: { condition: home.pitch.condition, turf: home.pitch.turf } } : {}),
    ...(home.weatherEffect ? { weather: home.weatherEffect.effective } : {}),
    ...(ref ? { referee: {
      id: ref.id, name: ref.name, country: ref.country, strictness: ref.strictness,
      ...(typeof ref.quality === "number" ? { quality: ref.quality } : {}),
      ...(ref.var ? { var: true } : {}),
    } } : {}),
  };
}

async function seatSetup(saveId: string, seatId: string): Promise<SetupBody | null> {
  const meta = await service.getSeatMeta(saveId, seatId);
  if (!meta) return null;
  const r = await matchSetupFor(meta, { live: true, h2h: true });
  return r.ok ? (r.body as unknown as SetupBody) : null;
}

async function startMatch(rec: Rec): Promise<void> {
  const { saveId, fixtureId } = rec.room;
  // match-setup takes the save lock itself (the referee appointment): read both sides before locking.
  const [home, away] = await Promise.all([seatSetup(saveId, rec.room.sides.A.seatId), seatSetup(saveId, rec.room.sides.B.seatId)]);
  if (!home || !away || !home.h2h || !away.h2h || home.fixture.id !== fixtureId || away.fixture.id !== fixtureId) {
    logError("world", `save ${saveId}: h2h ${fixtureId} has no match-setup for both seats`);
    closeWith(rec, "failed");
    return;
  }
  const input = h2hMatchInput(home, away);
  for (const side of SIDES) if (rec.penalty2d[side]) input[side].penalty2d = true;
  const ok = await withSaveLock(saveId, async () => {
    const world = await service.getMeta(saveId);
    if (!world?.world || world.currentDate !== rec.room.date) return false;
    for (const side of SIDES) {
      const seat = await service.getSeat(saveId, rec.room.sides[side].seatId);
      if (seat?.matchDecision?.date === rec.room.date) return false;
    }
    const entry: H2HLiveEntry = { fixtureId, date: rec.room.date, seats: [rec.room.sides.A.seatId, rec.room.sides.B.seatId] };
    const list = (world.world.h2hLive ?? []).filter((e) => e.fixtureId !== fixtureId);
    await service.updateMeta(saveId, { world: { ...world.world, h2hLive: [...list, entry] } });
    return true;
  });
  if (rooms.get(rec.key) !== rec) return;
  if (!ok) {
    closeWith(rec, "failed");
    return;
  }
  rec.banned = { A: input.A.managerBanned === true, B: input.B.managerBanned === true };
  rec.room = { ...rec.room, phase: "live" };
  rec.starting = false;
  rec.engine = spawner(
    (m) => onEngineMessage(rec, m),
    (e) => {
      logError("world", `save ${saveId}: h2h worker of ${fixtureId} failed`, e);
      void failLive(rec);
    },
  );
  rec.engine.post({ type: "init", input });
  for (const side of SIDES) if (!rec.room.sides[side].connected) rec.engine.post({ type: "auto", side, on: true });
  // Rivals: the server sends both seats' live score (the browsers' frames for this game are ignored).
  const [homeSq, awaySq] = [home.mySquad, away.mySquad];
  const agg = rec.fixture.aggregate;
  const base = (side: H2HSide): LiveBase => {
    const me = rec.room.sides[side];
    const them = rec.room.sides[side === "A" ? "B" : "A"];
    return {
      seatId: me.seatId, nickname: me.nickname ?? me.clubName, clubId: me.clubId, clubName: me.clubName,
      opponentId: them.clubId, opponentName: them.clubName, home: side === "A", fixtureId, date: rec.room.date,
      ...(agg ? { aggregate: side === "A" ? { for: agg.home, against: agg.away } : { for: agg.away, against: agg.home } } : {}),
    };
  };
  rec.live = {
    bases: { A: base("A"), B: base("B") },
    scorers: new Set([...homeSq.players, ...awaySq.players].map((p) => p.name)),
    lastMinute: 0,
  };
  setServerOwnedLive(saveId, fixtureId, true);
  liveFrame(rec, "start", 0, { A: 0, B: 0 });
  broadcastRoom(rec);
}

// ── End ──────────────────────────────────────────────────────────────────────

/** Removes this game from `world.h2hLive` (caller holds the save lock). */
export async function removeH2HLiveEntry(svc: SaveService, saveId: string, fixtureId: string): Promise<void> {
  const meta = await svc.getMeta(saveId);
  const list = meta?.world?.h2hLive;
  if (!meta?.world || !list?.some((e) => e.fixtureId === fixtureId)) return;
  const rest = list.filter((e) => e.fixtureId !== fixtureId);
  const { h2hLive: _drop, ...world } = meta.world;
  await svc.updateMeta(saveId, { world: rest.length > 0 ? { ...world, h2hLive: rest } : world });
}

// ── 2D penalties ─────────────────────────────────────────────────────────────

/** A manager who answers his own penalties: chose 2D, is in the room and not banned. */
function choosesPenalty(rec: Rec, side: H2HSide): boolean {
  return rec.penalty2d[side] && !rec.banned[side] && [...rec.sockets.values()].includes(side);
}

function clearPenalty(rec: Rec): void {
  if (rec.penalty?.timer) clearTimeout(rec.penalty.timer);
  rec.penalty = null;
}

function startPenaltyRound(rec: Rec, pending: PendingPenalty): void {
  clearPenalty(rec);
  const keeperSide: H2HSide = pending.team === "A" ? "B" : "A";
  const round: PenaltyRound = {
    pending,
    kick: choosesPenalty(rec, pending.team) ? null : aiKick(Math.random),
    dive: choosesPenalty(rec, keeperSide) ? null : aiDive(Math.random),
    timer: null,
    resolved: false,
  };
  rec.penalty = round;
  round.timer = setTimeout(() => {
    if (rec.penalty !== round || round.resolved) return;
    round.kick ??= aiKick(Math.random);
    round.dive ??= aiDive(Math.random);
    resolvePenaltyRound(rec);
  }, H2H.PENALTY_CHOICE_S * 1000);
  if (round.kick && round.dive) resolvePenaltyRound(rec);
}

function penaltyChoice(ws: SocialSocket, choice: PenaltyChoice): void {
  const rec = recOf(ws);
  const side = rec && sideOfSocket(rec, ws);
  const round = rec?.penalty;
  if (!rec || !side || !round || round.resolved || rec.room.phase !== "live") return;
  if ("kick" in choice) {
    if (side !== round.pending.team || round.kick) return;
    round.kick = choice.kick;
  } else {
    if (side === round.pending.team || round.dive) return;
    round.dive = choice.dive;
  }
  if (round.kick && round.dive) resolvePenaltyRound(rec);
}

/** Both choices in: the kick is resolved here, both screens get the result, the match moves on after the animation. */
function resolvePenaltyRound(rec: Rec): void {
  const round = rec.penalty;
  if (!round || round.resolved || !round.kick || !round.dive) return;
  round.resolved = true;
  if (round.timer) clearTimeout(round.timer);
  round.timer = null;
  const players = rec.lastState?.players ?? [];
  const taker = players.find((p) => p.id === round.pending.takerId);
  const keeper = round.pending.keeperId === null ? null : players.find((p) => p.id === round.pending.keeperId) ?? null;
  const outcome = resolveKick(round.kick, round.dive, {
    accuracy: taker?.runtimeStats.withBall.shootAccuracy ?? 0.5,
    keeper: round.pending.keeperId === null ? null
      : { reflex: keeper?.runtimeStats.withoutBall.gkReflex ?? 0.5, diving: keeper?.runtimeStats.withoutBall.gkDiving ?? 0.5 },
  }, Math.random);
  toSockets(rec, { type: "h2h_penalty_result", saveId: rec.room.saveId, fixtureId: rec.room.fixtureId, outcome });
  round.timer = setTimeout(() => {
    if (rec.penalty !== round || rooms.get(rec.key) !== rec) return;
    rec.penalty = null;
    rec.engine?.post({ type: "penalty", outcome: { scored: outcome.scored, result: outcome.result, chance: outcome.chance } });
  }, H2H.PENALTY_APPLY_MS);
}

/** Closes the room in memory and tells both managers (no save write). */
function closeWith(rec: Rec, reason: H2HCloseReason): void {
  if (rooms.get(rec.key) !== rec) return;
  rec.room = closeRoomState(rec.room);
  dropRoom(rec);
  toUsers(rec, { type: "h2h_closed", saveId: rec.room.saveId, fixtureId: rec.room.fixtureId, reason });
}

/** The worker died during the match: nothing recorded, the game is to decide again. */
async function failLive(rec: Rec): Promise<void> {
  if (rooms.get(rec.key) !== rec) return;
  const { saveId, fixtureId } = rec.room;
  closeWith(rec, "failed");
  await withSaveLock(saveId, () => removeH2HLiveEntry(service, saveId, fixtureId)).catch(() => undefined);
}

/**
 * Full time: the recording is built here from the worker's final state and statistics (home = A), kept as the home
 * seat's live recording, and both seats get the `live` decision. The day plays that recording.
 */
async function finishMatch(rec: Rec, state: GameState, stats: H2HStatsPayload): Promise<void> {
  if (rec.finishing) return;
  rec.finishing = true;
  const { saveId, fixtureId, date } = rec.room;
  rec.room = finishRoom(rec.room);
  rec.engine?.terminate();
  rec.engine = null;
  clearPenalty(rec);
  if (rec.pauseTimer) clearTimeout(rec.pauseTimer);
  rec.pauseTimer = null;
  liveFrame(rec, "end", matchMinute(state), state.score);
  let stored = false;
  try {
    stored = await withSaveLock(saveId, async () => {
      const world = await service.getMeta(saveId);
      const homeSeatId = rec.room.sides.A.seatId;
      const awaySeatId = rec.room.sides.B.seatId;
      const [homeSeat, awaySeat] = [await service.getSeat(saveId, homeSeatId), await service.getSeat(saveId, awaySeatId)];
      const settled = world?.currentDate !== date || homeSeat?.matchDecision?.date === date || awaySeat?.matchDecision?.date === date;
      if (settled) {
        logError("world", `save ${saveId}: h2h ${fixtureId} ended after the game was settled; result dropped`);
        await removeH2HLiveEntry(service, saveId, fixtureId);
        return false;
      }
      const fixture = rec.fixture;
      const [homeSquad, awaySquad] = await Promise.all([
        service.getSquadById(saveId, fixture.home), service.getSquadById(saveId, fixture.away),
      ]);
      if (!homeSquad || !awaySquad) throw new Error("squads missing");
      // Synchronous from here: the stores hold this match until the recording is built.
      importStatsState(stats.snapshot);
      importRatings(stats.ratings);
      const recording = validatePlayedMatch(buildPlayedMatchRecording(state, fixture, fixture.home, homeSquad, awaySquad));
      if (!recording || !knockoutRecordingDecided(fixture, recording)) throw new Error("invalid recording");
      await service.writeLiveRecording(saveId, homeSeatId, { date, fixtureId, recording });
      for (const [seatId, seat] of [[homeSeatId, homeSeat], [awaySeatId, awaySeat]] as const) {
        await service.updateSeat(saveId, seatId, {
          matchDecision: { date, fixtureId, mode: "live" },
          readyUntil: laterDate(seat?.readyUntil, addDays(date, 1)),
        });
      }
      await removeH2HLiveEntry(service, saveId, fixtureId);
      return true;
    });
  } catch (e) {
    logError("world", `save ${saveId}: h2h ${fixtureId} result not stored`, e);
    await withSaveLock(saveId, () => removeH2HLiveEntry(service, saveId, fixtureId)).catch(() => undefined);
  }
  dropRoom(rec);
  toUsers(rec, stored
    ? { type: "h2h_done", saveId, fixtureId }
    : { type: "h2h_closed", saveId, fixtureId, reason: "failed" });
  if (stored) scheduleKick(saveId);
}

// ── Helpers for callers that hold the save lock ──────────────────────────────

/**
 * "Simulate" for a game between two seats, by either of them or by the deadline assistant: the room (if any) closes
 * for both, and every seat of the game without a decision for that day gets `simulate`. Caller holds the save lock.
 */
export async function simulateSeatGame(svc: SaveService, saveId: string, date: string, fixture: Fixture): Promise<void> {
  const rec = rooms.get(roomKey(saveId, fixture.id));
  if (rec && rec.room.phase !== "done") closeWith(rec, "simulated");
  for (const club of [fixture.home, fixture.away]) {
    const seatId = await svc.seatOfClub(saveId, club);
    if (!seatId) continue;
    const seat = await svc.getSeat(saveId, seatId);
    if (seat?.matchDecision?.date === date) continue;
    await svc.updateSeat(saveId, seatId, { matchDecision: { date, fixtureId: fixture.id, mode: "simulate" } });
  }
  await removeH2HLiveEntry(svc, saveId, fixture.id);
}

/**
 * Server start: the live matches cut by the restart are lost (nothing was recorded). The marker goes and both seats
 * are told; the game is to decide again. Caller holds the save lock. A room still alive in this process is kept.
 */
export async function clearLostH2H(svc: SaveService, saveId: string): Promise<number> {
  const meta = await svc.getMeta(saveId);
  const list = meta?.world?.h2hLive;
  if (!meta?.world || !list || list.length === 0) return 0;
  const lost = list.filter((e) => !rooms.has(roomKey(saveId, e.fixtureId)));
  if (lost.length === 0) return 0;
  for (const e of lost) {
    for (const seatId of e.seats) {
      const other = e.seats.find((s) => s !== seatId)!;
      const otherSeat = await svc.getSeat(saveId, other);
      await svc.appendInbox(saveId, buildH2HMessage({
        kind: "h2h_lost", date: e.date, fixtureId: e.fixtureId,
        managerName: otherSeat?.manager?.name ?? "", clubName: otherSeat?.clubName ?? "",
      }), seatId);
    }
  }
  const rest = list.filter((e) => rooms.has(roomKey(saveId, e.fixtureId)));
  const { h2hLive: _drop, ...world } = meta.world;
  await svc.updateMeta(saveId, { world: rest.length > 0 ? { ...world, h2hLive: rest } : world });
  return lost.length;
}

/** Tests only: the configured pause length, for timeouts. */
export const H2H_PAUSE_MS = H2H.PAUSE_SECONDS * 1000;
