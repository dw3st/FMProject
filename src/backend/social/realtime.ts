// Friends and chat in real time (`.claude/rules/social.md`). In memory, per process: the open sockets of each
// user, and the last status sent to friends. Sending a message is HTTP; the socket only delivers.
import { relayFromPlayer, watchJoin, watchLeave, watchResendOn, watchSocketClosed } from "@/backend/watch/watchRooms";
import { WATCH, WATCH_EVENTS } from "@/Domain/watch/watchConfig";
import { parsePenaltyChoice } from "@/Domain/penalty/penaltyKick";
import type { ServerWebSocket } from "bun";
import { readSessionCookie } from "@/backend/auth/cookie";
import { getAuth } from "@/backend/auth/middleware";
import { isPresent, onlineCount, recordPresence } from "@/backend/presence";
import { saveService } from "@/backend/SaveService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { canWrite, resolveRoom, roomParamFor, roomRecipients } from "@/backend/social/roomAccess";
import { chatMessageView, friendIds, getSocialUser, isBlocked, isWorldMember, type ChatMessageRow } from "@/backend/social/socialStore";
import { isSaveIdShape } from "@/Domain/social/rooms";
import { acceptLiveScore } from "@/backend/rivals/liveScores";
import { parseLiveFrame } from "@/Domain/rivals/liveScore";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import { H2H } from "@/Domain/h2h/h2hConfig";
import { parseH2HCommand } from "@/Domain/h2h/h2hRules";
import { handleH2HEvent, h2hSocketClosed, resendH2HInvites } from "@/backend/h2h/h2hRooms";
import type { ClientEvent, FriendStatus, ServerEvent } from "@/types/socialTypes";

export interface WsData {
  userId: string;
  /** The session token the socket opened with (server only): logout closes these sockets. */
  session: string;
  /** The save open in this tab (`hello`), when the user owns it or is a member. */
  saveId: string | null;
  /** That save's club, for the "playing" status. */
  clubName: string | null;
}

/** The part of a Bun socket this module uses (a fake in unit tests). */
export interface SocialSocket {
  data: WsData;
  send(message: string): unknown;
  close(code?: number, reason?: string): unknown;
}

const MAX_CLIENT_FRAME = 2048;
/** Live match commands (part 7) may be larger than the social events, never above `H2H.MAX_FRAME_BYTES`. */
const H2H_CONTROL_PER_MINUTE = 30;
/** Per socket: at most this many `hello` / `ping` per minute and one `typing` per room every 2 s (excess ignored). */
const HELLO_PER_MINUTE = 5;
const PING_PER_MINUTE = 10;
const TYPING_GAP_MS = 2_000;
const MINUTE_MS = 60_000;

interface SocketLimits {
  hello: number[];
  ping: number[];
  live: number[];
  /** `h2h_cmd` (per `H2H.CMD_WINDOW_MS`) and the other `h2h_*` events (per minute). */
  h2hCmd: number[];
  h2h: number[];
  /** Watching (spectator joins/leaves per minute) and the friend's relays (per second). */
  watch: number[];
  relayFrame: number[];
  relayState: number[];
  relayEvent: number[];
  typing: Map<string, number>;
}

const limits = new WeakMap<SocialSocket, SocketLimits>();

/** Whether this client event fits the socket's limits (and counts it when it does). */
function withinLimits(ws: SocialSocket, event: ClientEvent, now: number): boolean {
  let l = limits.get(ws);
  if (!l) {
    l = { hello: [], ping: [], live: [], h2hCmd: [], h2h: [], watch: [], relayFrame: [], relayState: [], relayEvent: [], typing: new Map() };
    limits.set(ws, l);
  }
  if (event.type === "typing") {
    const last = l.typing.get(event.room);
    if (last !== undefined && now - last < TYPING_GAP_MS) return false;
    if (l.typing.size > 50) l.typing.clear();
    l.typing.set(event.room, now);
    return true;
  }
  const key = event.type === "live_score" ? "live"
    : event.type === "h2h_cmd" ? "h2hCmd"
      : event.type.startsWith("h2h_") ? "h2h"
        : event.type === "watch_join" || event.type === "watch_leave" ? "watch"
          : event.type === "relay_frame" ? "relayFrame"
            : event.type === "relay_state" ? "relayState"
              : event.type === "relay_event" ? "relayEvent"
                : event.type as "hello" | "ping";
  const max = key === "hello" ? HELLO_PER_MINUTE : key === "live" ? RIVALS.LIVE_PER_MINUTE
    : key === "h2hCmd" ? H2H.CMD_MAX : key === "h2h" || key === "watch" ? H2H_CONTROL_PER_MINUTE
      : key === "relayFrame" ? WATCH.FRAMES_PER_SEC : key === "relayState" ? WATCH.STATES_PER_SEC
        : key === "relayEvent" ? WATCH.EVENTS_PER_SEC : PING_PER_MINUTE;
  const window = key === "h2hCmd" ? H2H.CMD_WINDOW_MS : key.startsWith("relay") ? 1_000 : MINUTE_MS;
  const recent = l[key].filter((t) => now - t < window);
  if (recent.length >= max) {
    l[key] = recent;
    return false;
  }
  recent.push(now);
  l[key] = recent;
  return true;
}
const sockets = new Map<string, Set<SocialSocket>>();
/** userId → "status|club" last sent to friends (absent = offline). */
const lastStatus = new Map<string, string>();
/**
 * A socket that showed a club closed: the user still counts as playing that club during the grace period, and the
 * status is published only when it ends — a reload (close then open) never makes the status blink.
 */
const DEFAULT_CLOSE_GRACE_MS = 15_000;
let closeGraceMs = DEFAULT_CLOSE_GRACE_MS;
const lingering = new Map<string, { club: string; until: number; timer: ReturnType<typeof setTimeout> }>();

/** Tests only: a shorter grace period. `null` restores the default. */
export function setCloseGraceMs(ms: number | null): void {
  closeGraceMs = ms ?? DEFAULT_CLOSE_GRACE_MS;
}

/** The club the user manages in a world: his own seat's (`.claude/rules/game/multiplayer.md`). */
type ClubNameResolver = (saveId: string, userId: string) => Promise<string | null>;

const defaultClubName: ClubNameResolver = async (saveId, userId) => {
  try {
    const member = memberOf(saveId, userId);
    const meta = member ? await saveService.getSeatMeta(saveId, member.seatId) : null;
    return meta && meta.clubId ? meta.clubName : null;
  } catch {
    return null;
  }
};

let clubNameOf: ClubNameResolver = defaultClubName;

/** Tests only: answer the club name without a save on disk. `null` restores the default. */
export function setClubNameResolver(fn: ClubNameResolver | null): void {
  clubNameOf = fn ?? defaultClubName;
}

/** Tests only. */
export function resetRealtime(): void {
  sockets.clear();
  lastStatus.clear();
  for (const l of lingering.values()) clearTimeout(l.timer);
  lingering.clear();
  closeGraceMs = DEFAULT_CLOSE_GRACE_MS;
  clubNameOf = defaultClubName;
}

function sendTo(ws: SocialSocket, event: ServerEvent): void {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // closed socket: the close handler removes it
  }
}

export function notifyUser(userId: string, event: ServerEvent): void {
  for (const ws of sockets.get(userId) ?? []) sendTo(ws, event);
}

export function notifyFriendUpdate(userIds: string[]): void {
  for (const id of userIds) notifyUser(id, { type: "friend_update" });
}

/** Logout: closes every socket opened with this session (the close handler then removes them). */
export function closeSessionSockets(session: string): void {
  for (const set of sockets.values()) {
    for (const ws of [...set]) {
      if (ws.data.session !== session) continue;
      try {
        ws.close(4001, "logout");
      } catch {
        // already closing
      }
    }
  }
}

export function connectionCount(userId: string): number {
  return sockets.get(userId)?.size ?? 0;
}

/**
 * online = seen in the last 2.5 minutes (a visible page's ping); playing = online with a save of theirs open in
 * some tab, or in a tab closed less than the grace period ago.
 */
export function statusOf(userId: string, now: number): { status: FriendStatus; club: string | null } {
  if (!isPresent(userId, now)) return { status: "offline", club: null };
  for (const ws of sockets.get(userId) ?? []) {
    if (ws.data.clubName) return { status: "playing", club: ws.data.clubName };
  }
  const l = lingering.get(userId);
  if (l && l.until > now) return { status: "playing", club: l.club };
  return { status: "online", club: null };
}

/** Sends the user's status to their friends when it changed since the last time. */
export function publishStatus(userId: string, now: number): void {
  const s = statusOf(userId, now);
  const key = `${s.status}|${s.club ?? ""}`;
  if ((lastStatus.get(userId) ?? "offline|") === key) return;
  if (s.status === "offline") lastStatus.delete(userId);
  else lastStatus.set(userId, key);
  const nickname = getSocialUser(userId)?.nickname;
  if (!nickname) return;
  for (const friend of friendIds(userId)) notifyUser(friend, { type: "presence", nickname, ...s });
}

/** Run every 30 s: whoever left the presence window goes offline for their friends. */
export function sweepStatuses(now: number): void {
  for (const userId of [...lastStatus.keys()]) publishStatus(userId, now);
}

/** A stored message to every member of its room, each under their own room name, except who blocked the sender. */
export function deliverMessage(row: ChatMessageRow): void {
  for (const userId of roomRecipients(row.room)) {
    if (userId !== row.fromUser && isBlocked(userId, row.fromUser)) continue;
    const room = roomParamFor(userId, row.room);
    if (!room) continue;
    notifyUser(userId, {
      type: "message",
      room,
      message: chatMessageView(row, userId),
    });
  }
}

function parseClientEvent(raw: unknown): ClientEvent | null {
  if (typeof raw !== "string") return null;
  // A relayed match state (players and benches) is the one large client frame.
  const cap = raw.startsWith('{"type":"relay_state"') ? WATCH.STATE_MAX_BYTES : H2H.MAX_FRAME_BYTES;
  if (raw.length > cap) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (typeof e.type === "string" && e.type.startsWith("h2h_")) return parseH2HEvent(e);
  if (typeof e.type === "string" && (e.type.startsWith("watch_") || e.type.startsWith("relay_"))) return parseWatchEvent(e);
  // Social events stay small.
  if (raw.length > MAX_CLIENT_FRAME) return null;
  if (e.type === "ping") return { type: "ping" };
  if (e.type === "hello") {
    return { type: "hello", saveId: typeof e.saveId === "string" ? e.saveId : null, hidden: e.hidden === true };
  }
  if (e.type === "typing" && typeof e.room === "string") return { type: "typing", room: e.room };
  if (e.type === "live_score") {
    const frame = parseLiveFrame(e);
    return frame ? { type: "live_score", ...frame } : null;
  }
  return null;
}

type H2HClientEvent = Extract<ClientEvent, { type: `h2h_${string}` }>;
function isH2HEvent(e: ClientEvent): e is H2HClientEvent {
  return e.type.startsWith("h2h_");
}

const SAVE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FIXTURE_ID_MAX = 128;

/** Live match between two managers (part 7): strict shapes, extra keys refused. */
function parseH2HEvent(e: Record<string, unknown>): ClientEvent | null {
  const only = (...keys: string[]) => Object.keys(e).every((k) => k === "type" || keys.includes(k));
  switch (e.type) {
    case "h2h_join":
      if (!only("saveId", "fixtureId") || typeof e.saveId !== "string" || !SAVE_ID_RE.test(e.saveId)) return null;
      if (typeof e.fixtureId !== "string" || e.fixtureId.length === 0 || e.fixtureId.length > FIXTURE_ID_MAX) return null;
      return { type: "h2h_join", saveId: e.saveId, fixtureId: e.fixtureId };
    case "h2h_cmd": {
      if (!only("cmd")) return null;
      const cmd = parseH2HCommand(e.cmd);
      return cmd ? { type: "h2h_cmd", cmd } : null;
    }
    case "h2h_ready":
      if (!only("penalty2d") || (e.penalty2d !== undefined && typeof e.penalty2d !== "boolean")) return null;
      return e.penalty2d === true ? { type: "h2h_ready", penalty2d: true } : { type: "h2h_ready" };
    case "h2h_penalty": {
      if (!only("choice")) return null;
      const choice = parsePenaltyChoice(e.choice);
      return choice ? { type: "h2h_penalty", choice } : null;
    }
    case "h2h_pause":
    case "h2h_resume":
    case "h2h_leave":
      return only() ? { type: e.type } : null;
    default:
      return null;
  }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** Watching a friend's live match: strict shapes for the small events; the relayed state is only shape-checked. */
function parseWatchEvent(e: Record<string, unknown>): ClientEvent | null {
  const only = (...keys: string[]) => Object.keys(e).every((k) => k === "type" || keys.includes(k));
  if (e.type === "watch_leave") return only() ? { type: "watch_leave" } : null;
  if (e.type === "watch_join") {
    if (!only("saveId", "seatId") || typeof e.saveId !== "string" || !SAVE_ID_RE.test(e.saveId)) return null;
    if (typeof e.seatId !== "string" || !SAVE_ID_RE.test(e.seatId)) return null;
    return { type: "watch_join", saveId: e.saveId, seatId: e.seatId };
  }
  if (typeof e.saveId !== "string" || !SAVE_ID_RE.test(e.saveId)) return null;
  if (typeof e.fixtureId !== "string" || e.fixtureId.length === 0 || e.fixtureId.length > FIXTURE_ID_MAX) return null;
  const at = { saveId: e.saveId, fixtureId: e.fixtureId };
  if (e.type === "relay_frame") {
    const score = e.score as Record<string, unknown> | undefined;
    const players = e.players;
    if (!isNum(e.t) || !isPair(e.ball) || !isNum(e.minute) || typeof e.phase !== "string") return null;
    if (!score || !isNum(score.A) || !isNum(score.B)) return null;
    if (!Array.isArray(players) || players.length > 30) return null;
    if (!players.every((p) => Array.isArray(p) && p.length === 3 && p.every(isNum))) return null;
    return {
      type: "relay_frame", ...at, t: e.t, ball: e.ball, minute: e.minute, phase: e.phase as never,
      score: { A: score.A, B: score.B }, players: players as [number, number, number][],
    };
  }
  if (e.type === "relay_state") {
    const state = e.state as Record<string, unknown> | undefined;
    const stats = e.stats as Record<string, unknown> | undefined;
    if (!state || typeof state !== "object" || !Array.isArray(state.players)) return null;
    if (!stats || typeof stats !== "object" || !stats.teams || !Array.isArray(stats.goals) || !Array.isArray(stats.ratings)) return null;
    return { type: "relay_state", ...at, state: state as never, stats: { teams: stats.teams as never, goals: stats.goals as never, ratings: stats.ratings as never } };
  }
  if (e.type === "relay_event") {
    if (typeof e.name !== "string" || !WATCH_EVENTS.has(e.name)) return null;
    return { type: "relay_event", ...at, name: e.name, payload: e.payload ?? null };
  }
  return null;
}

function relayTyping(userId: string, rawRoom: string): void {
  const me = getSocialUser(userId);
  if (!me?.nickname) return;
  const room = resolveRoom(userId, rawRoom);
  if (!room || !canWrite(userId, room)) return;
  for (const id of roomRecipients(room.roomId)) {
    if (id === userId || isBlocked(id, userId)) continue;
    const param = roomParamFor(id, room.roomId);
    if (param) notifyUser(id, { type: "typing", room: param, from: me.nickname });
  }
}

export async function handleClientEvent(ws: SocialSocket, raw: unknown): Promise<void> {
  const event = parseClientEvent(raw);
  if (!event || !withinLimits(ws, event, Date.now())) return;
  const { userId } = ws.data;
  if (event.type === "typing") {
    relayTyping(userId, event.room);
    return;
  }
  if (isH2HEvent(event)) {
    await handleH2HEvent(ws, event);
    return;
  }
  if (event.type === "watch_join") {
    await watchJoin(ws, event.saveId, event.seatId);
    return;
  }
  if (event.type === "watch_leave") {
    watchLeave(ws);
    return;
  }
  if (event.type === "relay_frame" || event.type === "relay_state" || event.type === "relay_event") {
    const { type, saveId, fixtureId, ...rest } = event;
    relayFromPlayer(ws, saveId, fixtureId, { kind: type === "relay_frame" ? "frame" : type === "relay_state" ? "state" : "event", ...rest } as never);
    return;
  }
  if (event.type === "live_score") {
    // Rivals (part 6): a friend's live score. Never a pong, never presence; a refused frame is silent.
    const { type: _type, ...frame } = event;
    await acceptLiveScore(userId, frame, notifyUser);
    return;
  }
  if (event.type === "hello") {
    ws.data.saveId = null;
    ws.data.clubName = null;
    if (event.saveId && isSaveIdShape(event.saveId) && isWorldMember(userId, event.saveId)) {
      ws.data.saveId = event.saveId;
      ws.data.clubName = await clubNameOf(event.saveId, userId);
      // A live match room between two managers (part 7) waiting for him: the invite comes back on this tab.
      resendH2HInvites(userId, event.saveId);
      // Someone watches his live match: this tab relays it again.
      watchResendOn(userId, event.saveId);
    }
  }
  const now = Date.now();
  // A hidden tab's hello (a reconnect in the background) does not mark presence; its next visible ping will.
  if (event.type === "ping" || !event.hidden) recordPresence(userId, now);
  publishStatus(userId, now);
  sendTo(ws, { type: "pong", online: onlineCount(now) });
}

/** No presence on open (a hidden tab reconnecting must not show the user online): the hello or the ping marks it. */
export function onSocketOpen(ws: SocialSocket): void {
  const { userId } = ws.data;
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(ws);
}

export function onSocketClose(ws: SocialSocket): void {
  const { userId, clubName } = ws.data;
  h2hSocketClosed(ws);
  watchSocketClosed(ws);
  const set = sockets.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) sockets.delete(userId);
  }
  // Closing a socket without a club changes nothing (presence follows the pings). One with a club waits for the
  // grace period, then publishes whatever the status is by then (nothing when a reload brought the club back).
  if (!clubName) return;
  const previous = lingering.get(userId);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => {
    lingering.delete(userId);
    publishStatus(userId, Date.now());
  }, closeGraceMs);
  lingering.set(userId, { club: clubName, until: Date.now() + closeGraceMs, timer });
}

function sameSite(req: Request, origin: string): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [req.headers.get("host"), req.headers.get("x-forwarded-host")];
  try {
    hosts.push(new URL(req.url).host);
  } catch {
    // keep the headers only
  }
  return hosts.some((h) => h !== null && h === originHost);
}

/**
 * `GET /api/ws`: authenticated by the session cookie (401 without one). A browser always sends `Origin` on a
 * WebSocket handshake; another site is refused (403) so a page elsewhere cannot ride the cookie.
 */
export function handleSocialUpgrade(
  req: Request,
  server: { upgrade(req: Request, options: { data: WsData }): boolean },
): Response | undefined {
  const auth = getAuth(req);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && !sameSite(req, origin)) return Response.json({ error: "forbidden" }, { status: 403 });
  const session = readSessionCookie(req) ?? "";
  if (server.upgrade(req, { data: { userId: auth.userId, session, saveId: null, clubName: null } })) return undefined;
  return Response.json({ error: "upgrade failed" }, { status: 400 });
}

/** `websocket` of `Bun.serve` (`src/index.ts`). */
export const socialWebSocket = {
  data: {} as WsData,
  // A relayed match state is the largest client frame; `parseClientEvent` keeps every other one small.
  maxPayloadLength: WATCH.STATE_MAX_BYTES,
  idleTimeout: 120,
  sendPings: true,
  open(ws: ServerWebSocket<WsData>) {
    onSocketOpen(ws);
  },
  message(ws: ServerWebSocket<WsData>, message: string | Uint8Array) {
    void handleClientEvent(ws, typeof message === "string" ? message : null);
  },
  close(ws: ServerWebSocket<WsData>) {
    onSocketClose(ws);
  },
};
