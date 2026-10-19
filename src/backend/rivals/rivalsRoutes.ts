// Rivals in a friends' league (multiplayer part 6): the panel, the results feed, the live scores and the taunts.
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { fail, multiWorld, readBody } from "@/backend/worlds/worldRoutes";
import { getSocialUser, chatMessageView, insertMessage, markRead } from "@/backend/social/socialStore";
import { deliverMessage } from "@/backend/social/realtime";
import { allowChatSend } from "@/backend/social/socialRoutes";
import { isReaction, isTauntFor, liveGroups, tauntFallbackBody, tauntMeta } from "@/Domain/rivals/taunts";
import { worldRoomId } from "@/Domain/social/rooms";
import en from "@/i18n/locales/en.json";
import { liveScoresOf } from "@/backend/rivals/liveScores";
import { rivalsView } from "@/backend/rivals/rivalsView";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { LiveScoreView, ResultsPage, SeatResult, TauntGroup, TauntKind } from "@/types/rivalsTypes";

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

  /** A reaction or a ready phrase to a friend's result or live game, into the league's chat. No free text. */
  "/api/worlds/:saveId/taunts": {
    POST: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      const meta = await multiWorld(m.saveId);
      if (meta?.world.phase === "lobby") return fail("lobby", 409);
      if (!getSocialUser(m.userId)?.nickname) return fail("noNickname", 409);
      const body = await readBody(req);
      if (body instanceof Response) return body;
      const kind = body.kind as TauntKind;
      const id = body.id;
      const target = body.target as Record<string, unknown> | null | undefined;
      const resultId = typeof target?.result === "string" ? target.result : null;
      const liveSeat = typeof target?.live === "string" ? target.live : null;
      if ((kind !== "reaction" && kind !== "phrase") || typeof id !== "string" || id.length > 40 || (!resultId === !liveSeat)) {
        return fail("invalidBody", 400);
      }
      let source: SeatResult | LiveScoreView;
      let groups: readonly TauntGroup[];
      let live = false;
      if (resultId) {
        const r = (await saveService.getRivalsFeed(m.saveId)).find((x) => x.id === resultId);
        if (!r) return fail("notFound", 404);
        source = r;
        groups = r.situations;
      } else {
        const l = liveScoresOf(m.saveId).find((x) => x.seatId === liveSeat);
        if (!l) return fail("notFound", 404);
        source = l;
        groups = liveGroups(l);
        live = true;
      }
      if (source.seatId === m.seatId) return fail("self", 400);
      if (kind === "reaction" ? !isReaction(id) : !isTauntFor(id, groups)) return fail("invalidTaunt", 400);
      const now = Date.now();
      if (!allowChatSend(m.userId, now)) return fail("rateLimited", 429);
      const taunt = tauntMeta({ kind, id, from: source, live });
      const phrases = (en as { rivals?: { taunts?: Record<string, string> } }).rivals?.taunts ?? {};
      const row = insertMessage(worldRoomId(m.saveId), m.userId, tauntFallbackBody(taunt, phrases[id] ?? null), now, taunt);
      markRead(m.userId, row.room, row.id);
      deliverMessage(row);
      return Response.json({ message: chatMessageView(row, m.userId) });
    },
  },
};
