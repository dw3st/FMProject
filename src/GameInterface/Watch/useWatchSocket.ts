import { useEffect, useRef, useState } from "react";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { importRatings } from "@/GameEngine/Domain/PlayerRating";
import type { GameState } from "@/GameEngine/types";
import { WATCH_EVENTS } from "@/Domain/watch/watchConfig";
import { isLiveScoreView } from "@/Domain/rivals/liveScore";
import { toRemoteFrame, type RemoteFeed } from "@/GraficsEngine/remoteInterp";
import { EMPTY_REMOTE_BUFFER, pairAt, pushBuffered, REMOTE_BUFFER, type RemoteBuffer } from "@/GraficsEngine/remoteBuffer";
import { reconnectDelay } from "@/GameInterface/Social/socialState";
import { mergeWireState } from "@/GameInterface/H2H/h2hState";
import type { ClientEvent } from "@/types/socialTypes";
import type { LiveScoreView } from "@/types/rivalsTypes";
import type { WatchCloseReason, WatchInfo, WatchLook, WatchStats } from "@/types/watchTypes";
import { sanitizeWatchLook } from "@/Domain/watch/watchState";

const LOGOUT_CLOSE_CODE = 4001;
const CLOSE_REASONS = new Set<WatchCloseReason>(["ended", "gone", "full", "refused"]);

export interface WatchSocket {
  info: WatchInfo | null;
  /** The friend's live score, kept current by `friend_live` (moments, status). */
  live: LiveScoreView | null;
  state: GameState | null;
  stats: WatchStats | null;
  feed: RemoteFeed;
  closed: WatchCloseReason | null;
  /** How the friend's pitch is drawn (null until his first state with it). */
  look: WatchLook | null;
  /** The friend paused his match. */
  paused: boolean;
}

/**
 * Watching a friend's live match: its own socket (`hello` + `watch_join` on every (re)connect), the info, the merged
 * state and the position frames for the pitch in remote mode. Engine events are emitted on the local gameBus (the
 * pitch's effects read them); ratings take the friend's numbers.
 */
export function useWatchSocket(target: { saveId: string; seatId: string } | null): WatchSocket {
  const [info, setInfo] = useState<WatchInfo | null>(null);
  const [live, setLive] = useState<LiveScoreView | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [stats, setStats] = useState<WatchStats | null>(null);
  const [closed, setClosed] = useState<WatchCloseReason | null>(null);
  const [look, setLook] = useState<WatchLook | null>(null);
  const [paused, setPaused] = useState(false);
  /** The last frames by the friend's clock: the drawing runs a little behind the newest, always between two frames. */
  const bufferRef = useRef<RemoteBuffer>(EMPTY_REMOTE_BUFFER);
  const feedRef = useRef<RemoteFeed>({
    frames: { get current() { return pairAt(bufferRef.current, performance.now()); } },
    stepMs: REMOTE_BUFFER.STEP_MS,
  });
  const stateRef = useRef<GameState | null>(null);
  /** The last close was "gone": the next live score of the friend re-joins. */
  const goneRef = useRef(false);
  const saveId = target?.saveId ?? null;
  const seatId = target?.seatId ?? null;

  useEffect(() => {
    if (!saveId || !seatId) return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      const sock = ws;
      sock.onopen = () => {
        attempt = 0;
        sock.send(JSON.stringify({ type: "hello", saveId, hidden: false } satisfies ClientEvent));
        sock.send(JSON.stringify({ type: "watch_join", saveId, seatId } satisfies ClientEvent));
      };
      sock.onmessage = (m) => {
        let e: Record<string, unknown>;
        try {
          e = JSON.parse(String(m.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (!e || e.saveId !== saveId) return;
        if (e.type === "friend_live" && e.seatId === seatId) {
          if (e.live === null) {
            goneRef.current = true;
            setClosed((c) => c ?? "gone");
          } else if (isLiveScoreView(e.live)) {
            setLive(e.live);
            // The match came back (a server restart lost it, then the friend's tab sent it again): watch again.
            if (goneRef.current && e.live.status !== "ended") {
              goneRef.current = false;
              sock.send(JSON.stringify({ type: "watch_join", saveId, seatId } satisfies ClientEvent));
            }
          }
          return;
        }
        if (e.type === "watch_info") {
          const i = e.info as WatchInfo | undefined;
          if (i && i.seatId === seatId && i.teams?.A && i.teams?.B) {
            setInfo(i);
            setLive(i.live);
            goneRef.current = false;
            setClosed(null);
          }
          return;
        }
        if (e.seatId !== seatId) return;
        if (e.type === "watch_frame" && Array.isArray(e.ball) && Array.isArray(e.players)) {
          const now = performance.now();
          const sentAt = typeof e.t === "number" && Number.isFinite(e.t) ? e.t : now;
          bufferRef.current = pushBuffered(
            bufferRef.current, toRemoteFrame(e as { ball: [number, number]; players: [number, number, number][] }, now), sentAt, now,
          );
        } else if (e.type === "watch_state" && e.state && Array.isArray((e.state as { players?: unknown }).players)) {
          const st = e.stats as WatchStats | undefined;
          if (st && Array.isArray(st.ratings)) importRatings(st.ratings);
          const next = mergeWireState(stateRef.current, e.state as never);
          stateRef.current = next;
          setState(next);
          if (st) setStats(st);
          setPaused(e.paused === true);
          if (e.look) {
            const clean = sanitizeWatchLook(e.look);
            if (clean) setLook(clean);
          }
        } else if (e.type === "watch_event" && typeof e.name === "string" && WATCH_EVENTS.has(e.name)) {
          gameBus.emit(e.name as keyof GameEvents, e.payload as never);
        } else if (e.type === "watch_closed" && CLOSE_REASONS.has(e.reason as WatchCloseReason)) {
          if (e.reason === "gone") goneRef.current = true;
          setClosed(e.reason as WatchCloseReason);
          stopped = e.reason === "refused" || e.reason === "full" || stopped;
        }
      };
      sock.onclose = (ev) => {
        if (stopped || ev.code === LOGOUT_CLOSE_CODE) return;
        timer = setTimeout(connect, reconnectDelay(attempt++));
      };
      sock.onerror = () => sock.close();
    };
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "watch_leave" } satisfies ClientEvent));
      ws?.close();
    };
  }, [saveId, seatId]);

  return { info, live, state, stats, feed: feedRef.current, closed, look, paused };
}
