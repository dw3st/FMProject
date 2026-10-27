import { isLiveScoreView } from "@/Domain/rivals/liveScore";
import { isSeatResult } from "@/Domain/rivals/results";
import { parseTauntMeta } from "@/Domain/rivals/taunts";
import { dmRoomParam } from "@/Domain/social/rooms";
import type { LiveScoreView, SeatResult, TauntMeta } from "@/types/rivalsTypes";
import type { ChatMessageView, FriendStatus, FriendView, FriendsResponse, ServerEvent, WorldRoomView } from "@/types/socialTypes";

export interface FriendGroups {
  playing: FriendView[];
  online: FriendView[];
  offline: FriendView[];
}

const byNickname = (a: FriendView, b: FriendView) => a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" });

export function groupFriends(friends: readonly FriendView[]): FriendGroups {
  const sorted = [...friends].sort(byNickname);
  return {
    playing: sorted.filter((f) => f.status === "playing"),
    online: sorted.filter((f) => f.status === "online"),
    offline: sorted.filter((f) => f.status === "offline"),
  };
}

export function onlineFriendCount(friends: readonly FriendView[]): number {
  return friends.filter((f) => f.status !== "offline").length;
}

export function mergeMessages(prev: readonly ChatMessageView[], incoming: readonly ChatMessageView[]): ChatMessageView[] {
  const byId = new Map<number, ChatMessageView>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * How a friends' league is named on screen: "<owner>'s league" (`leagueOf`), plus the viewer's own club when another
 * league of his has the same owner (otherwise the two rows would read the same). Null when the owner is unknown.
 */
export function worldRoomLabel(
  room: string, worlds: readonly WorldRoomView[], leagueOf: (owner: string) => string, publicLabel?: string,
): string | null {
  const w = worlds.find((x) => x.room === room);
  if (w?.public && publicLabel) return publicLabel;
  if (!w?.owner) return null;
  const base = leagueOf(w.owner);
  const twin = worlds.some((x) => x.room !== room && x.owner === w.owner);
  return twin && w.myClub ? `${base} · ${w.myClub}` : base;
}

/** Unread count per room as the client names it (only rooms with something unread). */
export function unreadFromLists(lists: FriendsResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of lists.friends) if (f.unread > 0) out[dmRoomParam(f.nickname)] = f.unread;
  for (const w of lists.worlds) if (w.unread > 0) out[w.room] = w.unread;
  return out;
}

export function totalUnread(unread: Readonly<Record<string, number>>): number {
  return Object.values(unread).reduce((sum, n) => sum + n, 0);
}

export function applyPresence(
  friends: readonly FriendView[],
  p: { nickname: string; status: FriendStatus; club: string | null },
): FriendView[] {
  return friends.map((f) => (f.nickname === p.nickname ? { ...f, status: p.status, club: p.club } : f));
}

const STATUSES: ReadonlySet<string> = new Set(["online", "offline", "playing"]);

/** A socket frame from the server, validated; null for anything unexpected. */
export function parseServerEvent(raw: unknown): ServerEvent | null {
  if (typeof raw !== "string") return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const str = (x: unknown): x is string => typeof x === "string";
  switch (e.type) {
    case "message": {
      const m = e.message as Record<string, unknown> | undefined;
      if (!str(e.room) || !m || typeof m.id !== "number" || !str(m.from) || typeof m.mine !== "boolean" || !str(m.body) || typeof m.at !== "number") return null;
      const taunt = parseTauntMeta(m.taunt);
      return {
        type: "message", room: e.room,
        message: { id: m.id, from: m.from, mine: m.mine, body: m.body, at: m.at, ...(taunt ? { taunt } : {}) },
      };
    }
    case "presence":
      if (!str(e.nickname) || !str(e.status) || !STATUSES.has(e.status) || !(e.club === null || str(e.club))) return null;
      return { type: "presence", nickname: e.nickname, status: e.status as FriendStatus, club: e.club as string | null };
    case "friend_request":
      return str(e.from) ? { type: "friend_request", from: e.from } : null;
    case "friend_update":
      return { type: "friend_update" };
    case "read":
      return str(e.room) && typeof e.lastReadId === "number" ? { type: "read", room: e.room, lastReadId: e.lastReadId } : null;
    case "typing":
      return str(e.room) && str(e.from) ? { type: "typing", room: e.room, from: e.from } : null;
    case "pong":
      return typeof e.online === "number" ? { type: "pong", online: e.online } : null;
    case "world_invite":
      return str(e.saveId) && str(e.from) && str(e.code)
        ? { type: "world_invite", saveId: e.saveId, from: e.from, code: e.code }
        : null;
    case "world_started":
    case "world_removed":
    case "world_deleted":
    case "world_members":
    case "seat_offer":
      return str(e.saveId) ? { type: e.type, saveId: e.saveId } : null;
    case "world_progress": {
      const okTarget = e.target === null || str(e.target);
      const okWaiting = Array.isArray(e.waitingFor) && (e.waitingFor as unknown[]).every(str);
      if (!str(e.saveId) || !str(e.date) || !okTarget || typeof e.running !== "boolean" || !okWaiting) return null;
      if (e.error !== undefined && !str(e.error)) return null;
      return {
        type: "world_progress", saveId: e.saveId, date: e.date, target: e.target as string | null,
        running: e.running, waitingFor: e.waitingFor as string[], ...(str(e.error) ? { error: e.error } : {}),
      };
    }
    case "world_results":
      if (!str(e.saveId) || !Array.isArray(e.results)) return null;
      return { type: "world_results", saveId: e.saveId, results: (e.results as unknown[]).filter(isSeatResult) };
    case "friend_live": {
      if (!str(e.saveId) || !str(e.seatId)) return null;
      if (e.live !== null && !isLiveScoreView(e.live)) return null;
      return {
        type: "friend_live", saveId: e.saveId, seatId: e.seatId, live: e.live as LiveScoreView | null,
        ...(e.goal === true ? { goal: true as const } : {}),
      };
    }
    default:
      return null;
  }
}

/** Unread left in a room after a read mark: the others' messages above it. Null when the room is not loaded. */
export function unreadAfterRead(list: readonly ChatMessageView[] | undefined, lastReadId: number): number | null {
  if (!list) return null;
  return list.filter((m) => !m.mine && m.id > lastReadId).length;
}

const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** Attempts in a row that never opened before the client gives up (a server without the socket). */
export const MAX_FAILED_CONNECTS = 5;

/** Wait before reconnect attempt `attempt` (0-based): grows, capped at 30 s. */
export function reconnectDelay(attempt: number): number {
  return RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)]!;
}

/**
 * Whether to reconnect after the socket closed. `meStatus` is the answer of `/api/social/me` checked before
 * retrying (0 = no network): 401 (session gone) or 404 (no social routes) stop for good; so do 5 attempts in a
 * row that never opened when the socket never opened at all.
 */
export function reconnectAction(s: { meStatus: number; failedInARow: number; everOpened: boolean }): "retry" | "stop" {
  if (s.meStatus === 401 || s.meStatus === 404) return "stop";
  if (!s.everOpened && s.failedInARow >= MAX_FAILED_CONNECTS) return "stop";
  return "retry";
}

/** Fan-out of socket events to extra listeners; a listener that throws never stops the next one. */
export function createEventHub<T>() {
  const listeners = new Set<(event: T) => void>();
  return {
    subscribe(fn: (event: T) => void): () => void {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    emit(event: T): void {
      for (const fn of [...listeners]) {
        try { fn(event); } catch (err) { console.error("socket listener failed", err); }
      }
    },
  };
}

/** A new-message popup: one per room, with the newest message of it. */
export interface ChatPopup {
  room: string;
  messageId: number;
  from: string;
  body: string;
  taunt?: TauntMeta;
}

/** Popups to show: the room's previous popup is replaced, the newest goes on top, at most `max`. */
export function pushPopup(list: readonly ChatPopup[], popup: ChatPopup, max: number): ChatPopup[] {
  return [popup, ...list.filter((p) => p.room !== popup.room)].slice(0, max);
}

/** A friend's result or live goal in the corner (rivals, multiplayer part 6). */
export type RivalPopup =
  | { key: string; kind: "result"; result: SeatResult }
  | { key: string; kind: "goal"; live: LiveScoreView };

/** Newest on top, one per key, at most `max` (the rest only in the feed). */
export function pushRivalPopup(list: readonly RivalPopup[], popup: RivalPopup, max: number): RivalPopup[] {
  return [popup, ...list.filter((p) => p.key !== popup.key)].slice(0, max);
}
