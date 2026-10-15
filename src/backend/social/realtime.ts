// Friends and chat in real time (`.claude/rules/social.md`). In memory, per process: the open sockets of each
// user, and the last status sent to friends. Sending a message is HTTP; the socket only delivers.
import type { ServerWebSocket } from "bun";
import { readSessionCookie } from "@/backend/auth/cookie";
import { getAuth } from "@/backend/auth/middleware";
import { isPresent, onlineCount, recordPresence } from "@/backend/presence";
import { saveService } from "@/backend/SaveService";
import { canWrite, resolveRoom, roomParamFor, roomRecipients } from "@/backend/social/roomAccess";
import { friendIds, getSocialUser, isBlocked, isWorldMember, type ChatMessageRow } from "@/backend/social/socialStore";
import { isSaveIdShape } from "@/Domain/social/rooms";
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
/** Per socket: at most this many `hello` / `ping` per minute and one `typing` per room every 2 s (excess ignored). */
const HELLO_PER_MINUTE = 5;
const PING_PER_MINUTE = 10;
const TYPING_GAP_MS = 2_000;
const MINUTE_MS = 60_000;

interface SocketLimits {
  hello: number[];
  ping: number[];
  typing: Map<string, number>;
}

const limits = new WeakMap<SocialSocket, SocketLimits>();

/** Whether this client event fits the socket's limits (and counts it when it does). */
function withinLimits(ws: SocialSocket, event: ClientEvent, now: number): boolean {
  let l = limits.get(ws);
  if (!l) {
    l = { hello: [], ping: [], typing: new Map() };
    limits.set(ws, l);
  }
  if (event.type === "typing") {
    const last = l.typing.get(event.room);
    if (last !== undefined && now - last < TYPING_GAP_MS) return false;
    if (l.typing.size > 50) l.typing.clear();
    l.typing.set(event.room, now);
    return true;
  }
  const max = event.type === "hello" ? HELLO_PER_MINUTE : PING_PER_MINUTE;
  const recent = l[event.type].filter((t) => now - t < MINUTE_MS);
  if (recent.length >= max) {
    l[event.type] = recent;
    return false;
  }
  recent.push(now);
  l[event.type] = recent;
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

type ClubNameResolver = (saveId: string) => Promise<string | null>;

const defaultClubName: ClubNameResolver = async (saveId) => {
  try {
    const meta = await saveService.getMeta(saveId);
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
      message: { id: row.id, from: row.fromNickname ?? "", mine: userId === row.fromUser, body: row.body, at: row.createdAt },
    });
  }
}

function parseClientEvent(raw: unknown): ClientEvent | null {
  if (typeof raw !== "string" || raw.length > MAX_CLIENT_FRAME) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (e.type === "ping") return { type: "ping" };
  if (e.type === "hello") {
    return { type: "hello", saveId: typeof e.saveId === "string" ? e.saveId : null, hidden: e.hidden === true };
  }
  if (e.type === "typing" && typeof e.room === "string") return { type: "typing", room: e.room };
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
  if (event.type === "hello") {
    ws.data.saveId = null;
    ws.data.clubName = null;
    if (event.saveId && isSaveIdShape(event.saveId) && isWorldMember(userId, event.saveId)) {
      ws.data.saveId = event.saveId;
      ws.data.clubName = await clubNameOf(event.saveId);
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
  maxPayloadLength: 4096,
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
