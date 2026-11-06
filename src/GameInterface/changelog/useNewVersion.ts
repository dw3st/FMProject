import { useEffect, useState } from "react";
import { GAME_VERSION } from "@/Domain/saveVersion";

/** How often an open tab asks the server which version it runs. */
export const VERSION_CHECK_MS = 5 * 60_000;

/** True when the server answers a version other than the one this page was built with. */
export function isNewVersion(bundled: string, server: unknown): boolean {
  return typeof server === "string" && server.length > 0 && server !== bundled;
}

/**
 * The game frame never reloads by itself, so a tab opened before a deploy keeps the old code (tester reports of
 * fixes that "did not work"). Checks `/api/version` every 5 minutes while visible and when the tab comes back.
 */
export function useNewVersion(): boolean {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    if (newer) return;
    let alive = true;
    const check = () => {
      if (document.hidden) return;
      fetch("/api/version", { cache: "no-store" })
        .then(r => (r.ok ? r.json() : null))
        .then((body: { version?: unknown } | null) => {
          if (alive && body && isNewVersion(GAME_VERSION, body.version)) setNewer(true);
        })
        .catch(() => {});
    };
    const timer = window.setInterval(check, VERSION_CHECK_MS);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [newer]);
  return newer;
}
