import { useEffect, useState } from "react";

/** Ping interval while the page is visible (#134); the server counts a user for 2,5 minutes. */
const PING_MS = 60_000;

/**
 * Number of people with the game open (#134). Pings `POST /api/presence/ping` now and every minute
 * while the page is visible (a hidden tab stops pinging and drops out after the server window);
 * the answer is just the count. `null` until the first answer (or when it fails).
 */
export function usePresence(): number | null {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const ping = () => {
      if (document.hidden) return;
      fetch("/api/presence/ping", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { online?: unknown } | null) => {
          if (alive && d && typeof d.online === "number") setOnline(d.online);
        })
        .catch(() => {});
    };
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(ping, PING_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
      } else {
        ping();
        start();
      }
    };
    if (!document.hidden) {
      ping();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return online;
}
