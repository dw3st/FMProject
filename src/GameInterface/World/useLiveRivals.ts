import { useCallback, useEffect, useRef, useState } from "react";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import { parseServerEvent } from "@/GameInterface/Social/socialState";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { ClientEvent } from "@/types/socialTypes";
import type { LiveScoreFrame, LiveScoreView } from "@/types/rivalsTypes";

const RETRY_MS = 3_000;
const MAX_RETRIES = 5;
const LOGOUT_CLOSE_CODE = 4001;

/**
 * Live scores of the friends during the user's own live match (rivals, multiplayer part 6): its own socket (the match
 * page has no social provider), the friends' `friend_live`, and `send` for this match's `live_score` frames.
 */
export function useLiveRivals(target: { saveId: string; seatId: string } | null) {
  const [live, setLive] = useState<Record<string, LiveScoreView>>({});
  const [highlight, setHighlight] = useState<Record<string, true>>({});
  /** Someone watches this match (`watch_on`): the match screen relays it while true. */
  const [watched, setWatched] = useState(false);
  /** Nicknames of who watches this match now (`watch_viewers`). */
  const [viewers, setViewers] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<ClientEvent[]>([]);
  const saveId = target?.saveId ?? null;
  const seatId = target?.seatId ?? null;

  useEffect(() => {
    if (!saveId || !seatId) return;
    let stopped = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    void rivalsApi.live(saveId).then((r) => {
      if (stopped || !r.ok) return;
      setLive(Object.fromEntries(r.data.live.filter((l) => l.seatId !== seatId).map((l) => [l.seatId, l])));
    });

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retries = 0;
        ws.send(JSON.stringify({ type: "hello", saveId, hidden: false } satisfies ClientEvent));
        for (const e of pending.current.splice(0)) ws.send(JSON.stringify(e));
      };
      ws.onmessage = (m) => {
        const ev = parseServerEvent(m.data);
        if (ev && (ev.type === "watch_on" || ev.type === "watch_off") && ev.saveId === saveId) {
          setWatched(ev.type === "watch_on");
          if (ev.type === "watch_off") setViewers([]);
          return;
        }
        if (ev && ev.type === "watch_viewers" && ev.saveId === saveId) {
          setViewers(ev.viewers);
          return;
        }
        if (!ev || ev.type !== "friend_live" || ev.saveId !== saveId || ev.seatId === seatId) return;
        setLive((prev) => {
          const next = { ...prev };
          if (ev.live) next[ev.seatId] = ev.live;
          else delete next[ev.seatId];
          return next;
        });
        if (ev.goal) {
          setHighlight((h) => ({ ...h, [ev.seatId]: true }));
          const t = setTimeout(() => {
            timers.delete(t);
            setHighlight((h) => { const n = { ...h }; delete n[ev.seatId]; return n; });
          }, RIVALS.STRIP_HIGHLIGHT_MS);
          timers.add(t);
        }
      };
      ws.onclose = (e) => {
        if (wsRef.current === ws) wsRef.current = null;
        // The server tells again on the next hello if someone still watches.
        setWatched(false);
        if (stopped || e.code === LOGOUT_CLOSE_CODE || retries >= MAX_RETRIES) return;
        retries++;
        timer = setTimeout(connect, RETRY_MS);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const t of timers) clearTimeout(t);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [saveId, seatId]);

  const send = useCallback((frame: Omit<LiveScoreFrame, "saveId">) => {
    if (!saveId) return;
    const event: ClientEvent = { type: "live_score", saveId, ...frame };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
    else pending.current.push(event);
  }, [saveId]);

  /** A relay of this match to its spectators; dropped while the socket is down (the next state catches up). */
  const relay = useCallback((event: Extract<ClientEvent, { type: `relay_${string}` }>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  const list = Object.values(live).sort((a, b) => a.nickname.localeCompare(b.nickname));
  return { live: list, highlight, send, watched, viewers, relay };
}
