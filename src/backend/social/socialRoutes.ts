// HTTP routes of friends and chat (`.claude/rules/social.md`). Every route needs a session. Responses carry
// nicknames only: never an e-mail or a user id.
import { requireAuth } from "@/backend/auth/middleware";
import { saveService } from "@/backend/SaveService";
import { canRead, canWrite, resolveRoom } from "@/backend/social/roomAccess";
import { deliverMessage, notifyFriendUpdate, notifyUser, statusOf } from "@/backend/social/realtime";
import {
  acceptRequest,
  blockUser,
  blockedEitherWay,
  cancelRequest,
  declineRequest,
  ensureFriendCode,
  findUserByFriendCode,
  findUserByNickname,
  friendIds,
  getSocialUser,
  insertMessage,
  listBlocked,
  listFriends,
  listIncoming,
  listMessages,
  listOutgoing,
  markRead,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  setNickname,
  unblockUser,
  unreadCount,
  worldsOf,
  type ChatMessageRow,
  type NamedUser,
} from "@/backend/social/socialStore";
import { cleanMessageBody, rateLimit } from "@/Domain/social/message";
import { nicknameChangeableAt } from "@/Domain/social/nickname";
import { dmRoomId, worldRoomId, worldRoomParam } from "@/Domain/social/rooms";
import { SOCIAL } from "@/Domain/social/socialConfig";
import type { ChatMessageView, FriendsResponse, SocialErrorCode, SocialMe } from "@/types/socialTypes";

type ParamReq = Request & { params?: Record<string, string> };
type AuthedHandler = (req: ParamReq, userId: string) => Response | Promise<Response>;

const NICK_RE = new RegExp(`^[A-Za-z0-9_.-]{1,${SOCIAL.NICKNAME_MAX}}$`);
const MAX_BODY_BYTES = 8 * 1024;
const sendStamps = new Map<string, number[]>();

/** Tests only. */
export function resetSocialRateLimit(): void {
  sendStamps.clear();
}

function fail(error: SocialErrorCode, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ error, ...extra }, { status });
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function authed(handler: AuthedHandler) {
  return async (req: ParamReq): Promise<Response> => {
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;
    return handler(req, auth.userId);
  };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function param(req: ParamReq, name: string): string {
  const raw = req.params?.[name] ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function myNickname(userId: string): string | null {
  return getSocialUser(userId)?.nickname ?? null;
}

function meView(userId: string, now: number): SocialMe {
  const friendCode = ensureFriendCode(userId);
  const u = getSocialUser(userId)!;
  const at = nicknameChangeableAt(u.nicknameChangedAt);
  return {
    nickname: u.nickname,
    friendCode,
    nicknameChangeableOn: u.nickname !== null && at !== null && at > now ? isoDay(at) : null,
  };
}

/** Someone `me` may send a request to; null when unknown, oneself or blocked either way (all answer 404). */
function requestTarget(me: string, body: Record<string, unknown>): NamedUser | null | "invalid" {
  if (typeof body.nickname === "string") {
    const nickname = body.nickname.trim();
    if (!NICK_RE.test(nickname)) return null;
    const u = findUserByNickname(nickname);
    return u && u.id !== me && !blockedEitherWay(me, u.id) ? u : null;
  }
  if (typeof body.code === "string") {
    const u = findUserByFriendCode(body.code);
    return u && u.nickname && u.id !== me && !blockedEitherWay(me, u.id) ? { id: u.id, nickname: u.nickname } : null;
  }
  return "invalid";
}

function messageView(row: ChatMessageRow, viewer: string): ChatMessageView {
  return { id: row.id, from: row.fromNickname ?? "", mine: row.fromUser === viewer, body: row.body, at: row.createdAt };
}

async function friendsResponse(userId: string, now: number): Promise<FriendsResponse> {
  const friends = listFriends(userId).map((f) => {
    const s = statusOf(f.id, now);
    return {
      nickname: f.nickname,
      status: s.status,
      club: s.club,
      unread: unreadCount(userId, dmRoomId(userId, f.id)),
      since: f.since,
    };
  });
  const worlds = await Promise.all(
    worldsOf(userId).map(async (saveId) => {
      const meta = await saveService.getMeta(saveId).catch(() => null);
      return {
        room: worldRoomParam(saveId),
        saveId,
        name: meta?.name ?? "",
        unread: unreadCount(userId, worldRoomId(saveId)),
      };
    }),
  );
  return {
    friends,
    incoming: listIncoming(userId).map((r) => ({ nickname: r.nickname, at: r.at })),
    outgoing: listOutgoing(userId).map((r) => ({ nickname: r.nickname, at: r.at })),
    worlds,
  };
}

export const socialRoutes = {
  "/api/social/me": {
    GET: authed((_req, userId) => Response.json(meView(userId, Date.now()))),
  },

  "/api/social/nickname": {
    PUT: authed(async (req, userId) => {
      const body = await readJson(req);
      const raw = body?.nickname;
      if (typeof raw !== "string") return fail("invalidNickname", 400);
      const now = Date.now();
      const result = setNickname(userId, raw, now);
      if (!result.ok) {
        if (result.error === "tooSoon") {
          return fail("tooSoon", 409, { nicknameChangeableOn: meView(userId, now).nicknameChangeableOn });
        }
        return fail(result.error, result.error === "invalidNickname" ? 400 : 409);
      }
      notifyFriendUpdate(friendIds(userId));
      return Response.json(meView(userId, now));
    }),
  },

  "/api/social/search": {
    GET: authed((req, userId) => {
      if (!myNickname(userId)) return fail("noNickname", 409);
      const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
      if (q.length < SOCIAL.SEARCH_MIN || !NICK_RE.test(q)) return fail("invalidQuery", 400);
      return Response.json({ results: searchUsers(userId, q) });
    }),
  },

  "/api/social/requests": {
    POST: authed(async (req, userId) => {
      const me = myNickname(userId);
      if (!me) return fail("noNickname", 409);
      const body = await readJson(req);
      if (!body) return fail("invalidBody", 400);
      const target = requestTarget(userId, body);
      if (target === "invalid") return fail("invalidBody", 400);
      if (!target) return fail("notFound", 404);
      const result = sendFriendRequest(userId, target.id, Date.now());
      if (result === "requested") {
        notifyUser(target.id, { type: "friend_request", from: me });
        return Response.json({ status: "requested", nickname: target.nickname });
      }
      if (result === "befriended") {
        notifyFriendUpdate([userId, target.id]);
        return Response.json({ status: "friends", nickname: target.nickname });
      }
      if (result === "alreadyFriends") return fail("alreadyFriends", 409);
      if (result === "limit") return fail("limit", 409);
      return fail("notFound", 404);
    }),
  },

  "/api/social/requests/:nickname": {
    DELETE: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !cancelRequest(userId, other.id)) return fail("notFound", 404);
      notifyFriendUpdate([other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/requests/:nickname/accept": {
    POST: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other) return fail("notFound", 404);
      const result = acceptRequest(userId, other.id, Date.now());
      if (result === "notFound") return fail("notFound", 404);
      if (result === "limit") return fail("limit", 409);
      notifyFriendUpdate([userId, other.id]);
      return Response.json({ status: "friends", nickname: other.nickname });
    }),
  },

  "/api/social/requests/:nickname/decline": {
    POST: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !declineRequest(userId, other.id)) return fail("notFound", 404);
      notifyFriendUpdate([other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/friends": {
    GET: authed(async (_req, userId) => Response.json(await friendsResponse(userId, Date.now()))),
  },

  "/api/social/friends/:nickname": {
    DELETE: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !removeFriend(userId, other.id)) return fail("notFound", 404);
      notifyFriendUpdate([userId, other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/blocks": {
    GET: authed((_req, userId) => Response.json({ blocked: listBlocked(userId).map((u) => ({ nickname: u.nickname })) })),
    POST: authed(async (req, userId) => {
      const body = await readJson(req);
      const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
      if (!NICK_RE.test(nickname)) return fail("invalidBody", 400);
      const other = findUserByNickname(nickname);
      if (!other) return fail("notFound", 404);
      if (other.id === userId) return fail("invalidBody", 400);
      blockUser(userId, other.id, Date.now());
      notifyFriendUpdate([userId, other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/blocks/:nickname": {
    DELETE: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !unblockUser(userId, other.id)) return fail("notFound", 404);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/rooms/:room/messages": {
    GET: authed((req, userId) => {
      const room = resolveRoom(userId, param(req, "room"));
      if (!room || !canRead(userId, room)) return fail("noAccess", 403);
      const url = new URL(req.url);
      const beforeRaw = url.searchParams.get("before");
      const limitRaw = url.searchParams.get("limit");
      const before = beforeRaw === null ? undefined : Number(beforeRaw);
      const limit = limitRaw === null ? SOCIAL.PAGE_SIZE : Number(limitRaw);
      if (
        (before !== undefined && (!Number.isInteger(before) || before < 1))
        || !Number.isInteger(limit) || limit < 1 || limit > SOCIAL.PAGE_SIZE
      ) {
        return fail("invalidQuery", 400);
      }
      const rows = listMessages(room.roomId, userId, { before, limit });
      return Response.json({
        room: room.param,
        messages: rows.map((r) => messageView(r, userId)),
        hasMore: rows.length === limit,
      });
    }),
    POST: authed(async (req, userId) => {
      if (!myNickname(userId)) return fail("noNickname", 409);
      const room = resolveRoom(userId, param(req, "room"));
      if (!room || !canWrite(userId, room)) return fail("noAccess", 403);
      const json = await readJson(req);
      const body = cleanMessageBody(json?.body);
      if (!body) return fail("invalidBody", 400);
      const now = Date.now();
      const limited = rateLimit(sendStamps.get(userId) ?? [], now);
      sendStamps.set(userId, limited.stamps);
      if (!limited.allowed) return fail("rateLimited", 429);
      const row = insertMessage(room.roomId, userId, body, now);
      markRead(userId, room.roomId, row.id);
      deliverMessage(row);
      return Response.json({ room: room.param, message: messageView(row, userId) });
    }),
  },

  "/api/social/rooms/:room/read": {
    POST: authed(async (req, userId) => {
      const room = resolveRoom(userId, param(req, "room"));
      if (!room || !canRead(userId, room)) return fail("noAccess", 403);
      const json = await readJson(req);
      const id = json?.lastReadId;
      if (typeof id !== "number" || !Number.isInteger(id) || id < 0) return fail("invalidBody", 400);
      const stored = markRead(userId, room.roomId, id);
      notifyUser(userId, { type: "read", room: room.param, lastReadId: stored });
      return Response.json({ lastReadId: stored });
    }),
  },
};
