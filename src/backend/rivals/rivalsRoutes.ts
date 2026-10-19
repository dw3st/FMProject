// Rivals in a friends' league (multiplayer part 6): the panel, the results feed, the live scores and the taunts.
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { fail, multiWorld } from "@/backend/worlds/worldRoutes";
import { liveScoresOf } from "@/backend/rivals/liveScores";
import { rivalsView } from "@/backend/rivals/rivalsView";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { ResultsPage } from "@/types/rivalsTypes";

type Req = Request & { params: Record<string, string> };

/** Member of a friends' league: the seat auth, or the failing response (404 stranger, 409 `notMulti`). */
async function memberOfWorld(req: Req): Promise<{ saveId: string; seatId: string; userId: string } | Response> {
  const saveId = req.params.saveId!;
  const auth = requireSeat(req, saveId);
  if (auth instanceof Response) return auth;
  if (!(await multiWorld(saveId))) return fail("notMulti", 409);
  return { saveId, seatId: auth.seatId, userId: auth.userId };
}

export const rivalsRoutes = {
  "/api/worlds/:saveId/rivals": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      return Response.json(await rivalsView(saveService, m.saveId, m.seatId));
    },
  },

  "/api/worlds/:saveId/live": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      return Response.json({ live: liveScoresOf(m.saveId) });
    },
  },

  /** The feed, newest first: `?seat=<seatId>&offset=&limit=` (limit 1..50). */
  "/api/worlds/:saveId/results": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      const url = new URL(req.url);
      const seat = url.searchParams.get("seat");
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? RIVALS.RESULTS_PAGE);
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > RIVALS.RESULTS_PAGE) {
        return fail("invalidBody", 400);
      }
      const feed = (await saveService.getRivalsFeed(m.saveId)).filter((r) => !seat || r.seatId === seat);
      const body: ResultsPage = { results: feed.slice(offset, offset + limit), hasMore: feed.length > offset + limit };
      return Response.json(body);
    },
  },
};
