// How many people have the game open right now (#134). In memory, per process: every open page of
// a signed-in user pings `POST /api/presence/ping` once a minute while visible, and a user counts as
// online for PRESENCE_WINDOW_MS after the last ping. Only the number ever leaves the server — never
// who. A restart starts from zero (the next pings refill it within a minute).
import { requireAuth } from "@/backend/auth/middleware";

/** A user is online for 2,5 minutes after the last ping (pings every 60 s). */
export const PRESENCE_WINDOW_MS = 150_000;

const lastSeen = new Map<string, number>();

export function recordPresence(userId: string, now: number): void {
  lastSeen.set(userId, now);
}

/** Distinct users seen within the window; older entries are dropped. */
export function onlineCount(now: number): number {
  for (const [id, at] of lastSeen) if (now - at > PRESENCE_WINDOW_MS) lastSeen.delete(id);
  return lastSeen.size;
}

/** When the user last pinged (page visible, HTTP or socket), or null. Used for a friend's status. */
export function lastSeenAt(userId: string): number | null {
  return lastSeen.get(userId) ?? null;
}

/** Seen within the presence window (the same 2.5 minutes as the "N online" count). */
export function isPresent(userId: string, now: number): boolean {
  const at = lastSeen.get(userId);
  return at !== undefined && now - at <= PRESENCE_WINDOW_MS;
}

/** Tests only. */
export function resetPresence(): void {
  lastSeen.clear();
}

export const presenceRoutes = {
  "/api/presence/ping": (req: Request) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;
    const now = Date.now();
    recordPresence(auth.userId, now);
    return Response.json({ online: onlineCount(now) });
  },
  "/api/presence": (req: Request) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;
    return Response.json({ online: onlineCount(Date.now()) });
  },
};
