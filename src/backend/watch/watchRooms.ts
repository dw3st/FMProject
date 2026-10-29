/**
 * Watching a friend's live match, main process side (spec 2026-10-29-friend-match-broadcast-design).
 *
 * In memory, keyed `saveId:seatId` (the friend watched). A solo match runs in the friend's browser: the first
 * spectator makes the server send him `watch_on`, his match screen relays frames, states and events
 * (`relay_*`), the server checks the sender and repeats them to the spectators; the last one leaving sends
 * `watch_off`. A live match between two managers runs in the server (part 7): `h2hRooms` relays it here itself.
 * Who may watch: any member of the same world (friends' league or public world), at most `WATCH.MAX_WATCHERS`.
 */
import { saveService } from "@/backend/SaveService";
import { memberBySeat, memberOf } from "@/backend/auth/saveOwnership";
import { isServerOwnedLive, liveScoresOf } from "@/backend/rivals/liveScores";
import { notifyUser, type SocialSocket } from "@/backend/social/realtime";
import { WATCH } from "@/Domain/watch/watchConfig";
import { watchInfoOf, withBenches } from "@/Domain/watch/watchState";
import type { ServerEvent } from "@/types/socialTypes";
import type { WatchCloseReason, WatchEventPayload, WatchFramePayload, WatchInfo, WatchStatePayload, WatchTeam } from "@/types/watchTypes";

interface Entry {
  saveId: string;
  seatId: string;
  /** The friend's user (the only one whose relays are taken). */
  userId: string;
  watchers: Set<SocialSocket>;
  /** The last relayed state (benches kept), for who joins mid-match. */
  last?: WatchStatePayload;
}

const entries = new Map<string, Entry>();
const watching = new WeakMap<SocialSocket, string>();
const keyOf = (saveId: string, seatId: string) => `${saveId}:${seatId}`;

function send(ws: SocialSocket, event: ServerEvent): void {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // a closed socket: its close handler cleans up
  }
}

function entryFor(saveId: string, seatId: string, userId: string): Entry {
  const key = keyOf(saveId, seatId);
  let e = entries.get(key);
  if (!e) {
    e = { saveId, seatId, userId, watchers: new Set() };
    entries.set(key, e);
  }
  return e;
}

function closeWatcher(ws: SocialSocket, e: Entry, reason: WatchCloseReason): void {
  send(ws, { type: "watch_closed", saveId: e.saveId, seatId: e.seatId, reason });
}

/** Takes `ws` off whatever it watched; the friend hears `watch_off` when nobody is left. */
export function watchLeave(ws: SocialSocket): void {
  const key = watching.get(ws);
  if (!key) return;
  watching.delete(ws);
  const e = entries.get(key);
  if (!e) return;
  e.watchers.delete(ws);
  if (e.watchers.size > 0) return;
  notifyUser(e.userId, { type: "watch_off", saveId: e.saveId });
  // A server-run match keeps its last state (the server relays it anyway); a solo one starts over next time.
  entries.delete(key);
}

export const watchSocketClosed = watchLeave;

async function teamOf(saveId: string, id: string, name: string): Promise<WatchTeam> {
  const squad = await saveService.getSquadById(saveId, id).catch(() => null);
  const colors = squad?.colors;
  return { id, name, colors: colors && colors.length >= 2 ? [colors[0]!, colors[1]!] : ["#888888", "#ffffff"] };
}

/**
 * `watch_join`: a member of the world watching another seat's live match. Refused (`watch_closed`) for a stranger,
 * his own seat, a seat without a live match, or a full match.
 */
export async function watchJoin(ws: SocialSocket, saveId: string, seatId: string): Promise<void> {
  watchLeave(ws);
  const me = memberOf(saveId, ws.data.userId);
  const friend = memberBySeat(saveId, seatId);
  const refuse = (reason: WatchCloseReason) => send(ws, { type: "watch_closed", saveId, seatId, reason });
  if (!me || !friend || me.seatId === seatId) return refuse("refused");
  const live = liveScoresOf(saveId).find((l) => l.seatId === seatId);
  if (!live || live.status === "stale") return refuse("gone");
  if (live.status === "ended") return refuse("ended");
  const kind: WatchInfo["kind"] = isServerOwnedLive(saveId, live.fixtureId) ? "h2h" : "solo";
  const [club, opponent] = await Promise.all([
    teamOf(saveId, live.clubId, live.clubName), teamOf(saveId, live.opponentId, live.opponentName),
  ]);
  const e = entryFor(saveId, seatId, friend.userId);
  if (e.watchers.size >= WATCH.MAX_WATCHERS) return refuse("full");
  e.watchers.add(ws);
  watching.set(ws, keyOf(saveId, seatId));
  send(ws, { type: "watch_info", saveId, info: watchInfoOf(live, kind, club, opponent) });
  if (e.last) send(ws, { type: "watch_state", saveId, seatId, ...e.last });
  if (kind === "solo" && e.watchers.size === 1) notifyUser(e.userId, { type: "watch_on", saveId });
}

/** The friend's tab came back (`hello`): someone still watches him, so he relays again. */
export function watchResendOn(userId: string, saveId: string): void {
  const me = memberOf(saveId, userId);
  if (!me) return;
  const e = entries.get(keyOf(saveId, me.seatId));
  if (e && e.watchers.size > 0) notifyUser(userId, { type: "watch_on", saveId });
}

type Relay =
  | ({ kind: "frame" } & WatchFramePayload)
  | ({ kind: "state" } & WatchStatePayload)
  | ({ kind: "event" } & WatchEventPayload);

function fanOut(e: Entry, relay: Relay): void {
  const base = { saveId: e.saveId, seatId: e.seatId };
  let event: ServerEvent;
  if (relay.kind === "state") {
    e.last = { state: withBenches(e.last?.state, relay.state), stats: relay.stats };
    event = { type: "watch_state", ...base, state: relay.state, stats: relay.stats };
  } else if (relay.kind === "frame") {
    const { kind: _k, ...frame } = relay;
    event = { type: "watch_frame", ...base, ...frame };
  } else {
    event = { type: "watch_event", ...base, name: relay.name, payload: relay.payload };
  }
  const json = JSON.stringify(event);
  for (const ws of e.watchers) {
    try {
      ws.send(json);
    } catch {
      // closed: cleaned up by its close handler
    }
  }
}

/**
 * A `relay_*` of the friend's browser: taken only from the user of the seat being watched, for his live fixture of
 * today, while someone watches. Anything else is dropped in silence.
 */
export function relayFromPlayer(ws: SocialSocket, saveId: string, fixtureId: string, relay: Relay): void {
  const me = memberOf(saveId, ws.data.userId);
  if (!me) return;
  const e = entries.get(keyOf(saveId, me.seatId));
  if (!e || e.watchers.size === 0 || e.userId !== ws.data.userId) return;
  const live = liveScoresOf(saveId).find((l) => l.seatId === me.seatId);
  if (!live || live.fixtureId !== fixtureId || isServerOwnedLive(saveId, fixtureId)) return;
  fanOut(e, relay);
}

/** A match between two managers the server runs (part 7): relayed to the spectators of both seats. */
export function relayFromServer(saveId: string, seatIds: readonly string[], relay: Relay): void {
  for (const seatId of seatIds) {
    const e = entries.get(keyOf(saveId, seatId));
    if (e && e.watchers.size > 0) fanOut(e, relay);
  }
}

/** The friend's live match left (the day ran, it went quiet): its spectators are told. */
export function watchLiveGone(saveId: string, seatId: string): void {
  const key = keyOf(saveId, seatId);
  const e = entries.get(key);
  if (!e) return;
  for (const ws of e.watchers) {
    watching.delete(ws);
    closeWatcher(ws, e, "gone");
  }
  entries.delete(key);
}

/** Tests only. */
export function resetWatchRooms(): void {
  entries.clear();
}

/** Tests only: spectators of a seat. */
export function watcherCount(saveId: string, seatId: string): number {
  return entries.get(keyOf(saveId, seatId))?.watchers.size ?? 0;
}
