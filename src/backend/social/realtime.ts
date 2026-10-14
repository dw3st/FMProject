// Friends and chat in real time (`.claude/rules/social.md`). In memory, per process: the open sockets of each
// user, and the last status sent to friends. Sending a message is HTTP; the socket only delivers.
import type { ServerWebSocket } from "bun";
import { getAuth } from "@/backend/auth/middleware";
import { isPresent, onlineCount, recordPresence } from "@/backend/presence";
import { saveService } from "@/backend/SaveService";
import { canWrite, resolveRoom, roomParamFor, roomRecipients } from "@/backend/social/roomAccess";
import { friendIds, getSocialUser, isBlocked, isWorldMember, type ChatMessageRow } from "@/backend/social/socialStore";
import { isSaveIdShape } from "@/Domain/social/rooms";
import type { ClientEvent, FriendStatus, ServerEvent } from "@/types/socialTypes";

export interface WsData {
  userId: string;
  /** The save open in this tab (`hello`), when the user owns it or is a member. */
  saveId: string | null;
  /** That save's club, for the "playing" status. */
  clubName: string | null;
}

/** The part of a Bun socket this module uses (a fake in unit tests). */
export interface SocialSocket {
  data: WsData;
  send(message: string): unknown;
}

const MAX_CLIENT_FRAME = 2048;
const sockets = new Map<string, Set<SocialSocket>>();
/** userId → "status|club" last sent to friends (absent = offline). */
const lastStatus = new Map<string, string>();

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

export function connectionCount(userId: string): number {
  return sockets.get(userId)?.size ?? 0;
}

/** online = seen in the last 2.5 minutes; playing = online with a save of theirs open in some tab. */
export function statusOf(userId: string, now: number): { status: FriendStatus; club: string | null } {
  if (!isPresent(userId, now)) return { status: "offline", club: null };
  for (const ws of sockets.get(userId) ?? []) {
    if (ws.data.clubName) return { status: "playing", club: ws.data.clubName };
  }
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
  if (e.type === "hello") return { type: "hello", saveId: typeof e.saveId === "string" ? e.saveId : null };
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
  if (!event) return;
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
  recordPresence(userId, now);
  publishStatus(userId, now);
  sendTo(ws, { type: "pong", online: onlineCount(now) });
}

export function onSocketOpen(ws: SocialSocket): void {
  const { userId } = ws.data;
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(ws);
  const now = Date.now();
  recordPresence(userId, now);
  publishStatus(userId, now);
}

export function onSocketClose(ws: SocialSocket): void {
  const { userId } = ws.data;
  const set = sockets.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) sockets.delete(userId);
  }
  publishStatus(userId, Date.now());
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
  if (server.upgrade(req, { data: { userId: auth.userId, saveId: null, clubName: null } })) return undefined;
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
