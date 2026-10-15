import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";

type Req = Request & { params: Record<string, string> };
type Handler = (req: Req) => Response | Promise<Response>;

/** Game routes that write: refused (409 `lobby`) while the world is still in the lobby, even by a direct call. */
export const LOBBY_GUARDED_PATHS = [
  "/api/saves/:saveId/transfers",
  "/api/saves/:saveId/sell-list",
  "/api/saves/:saveId/sell-listed-players",
  "/api/saves/:saveId/bids/:bidId",
  "/api/saves/:saveId/loans",
  "/api/saves/:saveId/loan-list",
  "/api/saves/:saveId/pre-contracts",
  "/api/saves/:saveId/players/:playerId/renew",
  "/api/saves/:saveId/free-agents/:playerId/sign",
  "/api/saves/:saveId/staff/hire",
  "/api/saves/:saveId/staff/fire",
  "/api/saves/:saveId/staff/renew",
  "/api/saves/:saveId/facilities/request",
  "/api/saves/:saveId/scouting/missions",
  "/api/saves/:saveId/scouting/missions/:missionId",
  "/api/saves/:saveId/scouting/prospects/:prospectId/sign",
  "/api/saves/:saveId/youth/:playerId/promote",
  "/api/saves/:saveId/youth/:playerId/release",
  "/api/saves/:saveId/achievements/shop/created",
  "/api/saves/:saveId/achievements/shop/legend/draw",
  "/api/saves/:saveId/achievements/shop/legend",
] as const;

/** 409 `{ error: "lobby" }` when the world has not started, else null. */
export async function worldLobbyGuard(saveId: string): Promise<Response | null> {
  const meta = await saveService.getMeta(saveId);
  return meta?.world?.phase === "lobby" ? Response.json({ error: "lobby" }, { status: 409 }) : null;
}

function guarded(handler: Handler, method?: string): Handler {
  return async (req) => {
    if (method === undefined && (req.method === "GET" || req.method === "HEAD")) return handler(req);
    const saveId = req.params?.saveId;
    if (saveId) {
      // Same order as the routes: session and membership first (a stranger still sees a 404).
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      const refused = await worldLobbyGuard(saveId);
      if (refused) return refused;
    }
    return handler(req);
  };
}

/** The route map with the lobby guard in front of the writing methods of `LOBBY_GUARDED_PATHS`. */
export function withLobbyGuard<T extends Record<string, unknown>>(routes: T): T {
  const out: Record<string, unknown> = { ...routes };
  for (const path of LOBBY_GUARDED_PATHS) {
    const entry = out[path];
    if (typeof entry === "function") out[path] = guarded(entry as Handler);
    else if (entry && typeof entry === "object") {
      out[path] = Object.fromEntries(
        Object.entries(entry).map(([m, h]) => [m, m === "GET" || m === "HEAD" ? h : guarded(h as Handler, m)]),
      );
    }
  }
  return out as T;
}
