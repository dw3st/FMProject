// Rivals in a friends' league (multiplayer part 6): the panel, the results feed, the live scores and the taunts.
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { fail, multiWorld, readBody } from "@/backend/worlds/worldRoutes";
import { getSocialUser, chatMessageView, insertMessage, markRead } from "@/backend/social/socialStore";
import { deliverMessage } from "@/backend/social/realtime";
import { allowChatSend } from "@/backend/social/socialRoutes";
import { betGroups, betTauntMeta, isReaction, isTauntFor, liveGroups, tauntFallbackBody, tauntMeta } from "@/Domain/rivals/taunts";
import { standingsView } from "@/backend/standingsWorld";
import { worldRoomId } from "@/Domain/social/rooms";
import en from "@/i18n/locales/en.json";
import { liveScoresOf } from "@/backend/rivals/liveScores";
import { rivalsView } from "@/backend/rivals/rivalsView";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { FeedBet, FriendBetsView, LiveScoreView, ResultsPage, SeatResult, TauntGroup, TauntKind, TauntMeta } from "@/types/rivalsTypes";
import type { Bet } from "@/types/betTypes";

type Req = Request & { params: Record<string, string> };

/** Member of a friends' league: the seat auth, or the failing response (404 stranger, 409 `notMulti`). */
async function memberOfWorld(req: Req): Promise<{ saveId: string; seatId: string; userId: string } | Response> {
  const saveId = req.params.saveId!;
  const auth = requireSeat(req, saveId);
  if (auth instanceof Response) return auth;
  if (!(await multiWorld(saveId))) return fail("notMulti", 409);
  return { saveId, seatId: auth.seatId, userId: auth.userId };
}

/** How many settled bets of a friend the panel shows, and of the whole league the feed shows (8.9.7). */
const FRIEND_SETTLED = 10;
const FEED_BETS = 30;

const decided = (b: Bet) => b.status === "won" || b.status === "lost";

/** A member's settled bet by `<seatId>:<betId>`. */
async function settledBet(saveId: string, key: string): Promise<{ seatId: string; bet: Bet } | null> {
  const i = key.indexOf(":");
  if (i <= 0) return null;
  const seatId = key.slice(0, i);
  if (!(await saveService.listSeats(saveId)).some((s) => s.seatId === seatId)) return null;
  const bet = (await saveService.getBets(saveId, seatId)).settled.find((b) => b.id === key.slice(i + 1) && decided(b));
  return bet ? { seatId, bet } : null;
}

export const rivalsRoutes = {
  /** A friend's bets (`?seat=<seatId>`): the league sees the open ones and the last settled (8.9.7). */
  "/api/worlds/:saveId/friend-bets": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      const seat = new URL(req.url).searchParams.get("seat") ?? "";
      const s = await saveService.getSeat(m.saveId, seat);
      if (!s || !(await saveService.listSeats(m.saveId)).some((x) => x.seatId === seat)) return fail("notFound", 404);
      const state = await saveService.getBets(m.saveId, seat);
      const body: FriendBetsView = {
        seatId: seat, open: state.open, settled: state.settled.filter(decided).slice(0, FRIEND_SETTLED), net: s.betNet ?? 0,
      };
      return Response.json(body);
    },
  },

  /** The league's settled bets, newest first, for the results feed. */
  "/api/worlds/:saveId/feed-bets": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      const seat = new URL(req.url).searchParams.get("seat");
      const names = new Map((await standingsView(saveService, m.saveId)).entries.map((e) => [e.seatId, e.nickname ?? e.managerName] as const));
      const out: FeedBet[] = [];
      for (const { seatId } of await saveService.listSeats(m.saveId)) {
        if (seat && seatId !== seat) continue;
        for (const bet of (await saveService.getBets(m.saveId, seatId)).settled.filter(decided).slice(0, FEED_BETS)) {
          out.push({ id: `${seatId}:${bet.id}`, seatId, nickname: names.get(seatId) ?? "", bet });
        }
      }
      out.sort((a, b) => (b.bet.settledOn ?? "").localeCompare(a.bet.settledOn ?? ""));
      return Response.json({ bets: out.slice(0, FEED_BETS) });
    },
  },

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
      const betKey = typeof target?.bet === "string" && target.bet.length <= 120 ? target.bet : null;
      if ((kind !== "reaction" && kind !== "phrase") || typeof id !== "string" || id.length > 40
        || [resultId, liveSeat, betKey].filter((x) => x !== null).length !== 1) {
        return fail("invalidBody", 400);
      }
      if (betKey) {
        const found = await settledBet(m.saveId, betKey);
        if (!found) return fail("notFound", 404);
        if (found.seatId === m.seatId) return fail("self", 400);
        if (kind === "reaction" ? !isReaction(id) : !isTauntFor(id, betGroups(found.bet))) return fail("invalidTaunt", 400);
        const nickname = (await standingsView(saveService, m.saveId)).entries.find((e) => e.seatId === found.seatId)?.nickname ?? "";
        return sendTaunt(m, id, betTauntMeta({ kind, id, nickname, bet: found.bet }));
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
      return sendTaunt(m, id, tauntMeta({ kind, id, from: source, live }), now);
    },
  },
};

/** Writes the taunt into the league's chat and delivers it. */
function sendTaunt(m: { saveId: string; userId: string }, id: string, taunt: TauntMeta, now = Date.now()): Response {
  if (!allowChatSend(m.userId, now)) return fail("rateLimited", 429);
  const phrases = (en as { rivals?: { taunts?: Record<string, string> } }).rivals?.taunts ?? {};
  const row = insertMessage(worldRoomId(m.saveId), m.userId, tauntFallbackBody(taunt, phrases[id] ?? null), now, taunt);
  markRead(m.userId, row.room, row.id);
  deliverMessage(row);
  return Response.json({ message: chatMessageView(row, m.userId) });
}
