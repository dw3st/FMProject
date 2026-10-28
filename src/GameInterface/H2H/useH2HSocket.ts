import { useCallback, useEffect, useRef, useState } from "react";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { importStatsState } from "@/GameEngine/Domain/Statistics";
import { importRatings } from "@/GameEngine/Domain/PlayerRating";
import type { GameState } from "@/GameEngine/types";
import { H2H } from "@/Domain/h2h/h2hConfig";
import { EMPTY_REMOTE_FRAMES, pushRemoteFrame, toRemoteFrame, type RemoteFeed, type RemoteFrames } from "@/GraficsEngine/remoteInterp";
import { reconnectDelay } from "@/GameInterface/Social/socialState";
import { mergeWireState, parseH2HEvent } from "@/GameInterface/H2H/h2hState";
import type { ClientEvent } from "@/types/socialTypes";
import type { KickOutcome, PenaltyChoice } from "@/Domain/penalty/penaltyKick";
import type { H2HCloseReason, H2HCommand, H2HRoomView, H2HSide } from "@/types/h2hTypes";

const LOGOUT_CLOSE_CODE = 4001;

export interface H2HPause {
  by: H2HSide;
  /** Epoch ms (server clock). */
  until: number;
}

export interface H2HSocket {
  room: H2HRoomView | null;
  mySide: H2HSide | null;
  /** The match as the server last sent it (benches kept between states). */
  state: GameState | null;
  /** Position frames for the pitch (`PixiPitch` `remote`). */
  feed: RemoteFeed;
  pause: H2HPause | null;
  pausesLeft: Record<H2HSide, number> | null;
  closed: H2HCloseReason | null;
  done: boolean;
  send: (cmd: H2HCommand) => void;
  requestPause: () => void;
  resume: () => void;
  /** Start: `penalty2d` = this manager kicks and saves his penalties (2D). */
  ready: (penalty2d: boolean) => void;
  leave: () => void;
  /** Sends this manager's kick or dive; resolves with the server's result of that penalty. */
  choosePenalty: (choice: PenaltyChoice) => Promise<KickOutcome>;
}

/**
 * The live match between two managers on the page (multiplayer part 7): its own socket (the match page has no social
 * provider), `hello` + `h2h_join` on every (re)connect, the room, the merged state and the position frames. Every
 * `h2h_event` is emitted on the local gameBus, so the summary, notices, overlays and statistics work as in a match
 * the page runs; the statistics and ratings stores take the server's numbers with every state.
 */
export function useH2HSocket(target: { saveId: string; fixtureId: string } | null): H2HSocket {
  const [room, setRoom] = useState<H2HRoomView | null>(null);
  const [mySide, setMySide] = useState<H2HSide | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [pause, setPause] = useState<H2HPause | null>(null);
  const [pausesLeft, setPausesLeft] = useState<Record<H2HSide, number> | null>(null);
  const [closed, setClosed] = useState<H2HCloseReason | null>(null);
  const [done, setDone] = useState(false);
  const framesRef = useRef<RemoteFrames>(EMPTY_REMOTE_FRAMES);
  const feedRef = useRef<RemoteFeed>({ frames: framesRef, stepMs: H2H.FRAME_MS });
  const stateRef = useRef<GameState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const penaltyWaitersRef = useRef<((o: KickOutcome) => void)[]>([]);
  const saveId = target?.saveId ?? null;
  const fixtureId = target?.fixtureId ?? null;

  useEffect(() => {
    if (!saveId || !fixtureId) return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        ws.send(JSON.stringify({ type: "hello", saveId, hidden: false } satisfies ClientEvent));
        ws.send(JSON.stringify({ type: "h2h_join", saveId, fixtureId } satisfies ClientEvent));
      };
      ws.onmessage = (m) => {
        const ev = parseH2HEvent(m.data, saveId, fixtureId);
        if (!ev) return;
        switch (ev.type) {
          case "h2h_room":
            setRoom(ev.room);
            setMySide(ev.mySide);
            setPause(ev.room.pause);
            setPausesLeft({ A: ev.room.sides.A.pausesLeft, B: ev.room.sides.B.pausesLeft });
            break;
          case "h2h_frame":
            framesRef.current = pushRemoteFrame(framesRef.current, toRemoteFrame(ev, performance.now()));
            break;
          case "h2h_state": {
            if (ev.stats.snapshot) importStatsState(ev.stats.snapshot);
            importRatings(ev.stats.ratings);
            const next = mergeWireState(stateRef.current, ev.state);
            stateRef.current = next;
            setState(next);
            break;
          }
          case "h2h_event":
            // Raw engine payloads: the same events the page's own match would emit.
            gameBus.emit(ev.name as keyof GameEvents, ev.payload as never);
            break;
          case "h2h_paused":
            setPause(ev.by && ev.until !== null ? { by: ev.by, until: ev.until } : null);
            setPausesLeft(ev.left);
            break;
          case "h2h_closed":
            setClosed(ev.reason);
            break;
          case "h2h_done":
            setDone(true);
            break;
          case "h2h_penalty_result": {
            const waiting = penaltyWaitersRef.current;
            penaltyWaitersRef.current = [];
            for (const resolve of waiting) resolve(ev.outcome);
            break;
          }
        }
      };
      ws.onclose = (e) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped || e.code === LOGOUT_CLOSE_CODE) return;
        timer = setTimeout(connect, reconnectDelay(attempt++));
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [saveId, fixtureId]);

  // Dropped while the socket is down: a command replayed after a rejoin would act on a match that moved on.
  const sendEvent = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  const send = useCallback((cmd: H2HCommand) => sendEvent({ type: "h2h_cmd", cmd }), [sendEvent]);
  const requestPause = useCallback(() => sendEvent({ type: "h2h_pause" }), [sendEvent]);
  const resume = useCallback(() => sendEvent({ type: "h2h_resume" }), [sendEvent]);
  const ready = useCallback((penalty2d: boolean) => sendEvent(penalty2d ? { type: "h2h_ready", penalty2d: true } : { type: "h2h_ready" }), [sendEvent]);
  const choosePenalty = useCallback((choice: PenaltyChoice) => new Promise<KickOutcome>((resolve) => {
    penaltyWaitersRef.current.push(resolve);
    sendEvent({ type: "h2h_penalty", choice });
  }), [sendEvent]);
  const leave = useCallback(() => sendEvent({ type: "h2h_leave" }), [sendEvent]);

  return {
    room, mySide, state, feed: feedRef.current, pause, pausesLeft, closed, done,
    send, requestPause, resume, ready, leave, choosePenalty,
  };
}
