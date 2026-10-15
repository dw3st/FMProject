import { saveService } from "@/backend/SaveService";
import { requireAuth, requireSeat } from "@/backend/auth/middleware";
import { countOwnedSaves, listSaveMembers, memberBySeat, memberOf, transferOwnership } from "@/backend/auth/saveOwnership";
import { withSaveLock } from "@/backend/saveLock";
import { areFriends, blockedEitherWay, findUserByNickname, getSocialUser } from "@/backend/social/socialStore";
import { notifyUser } from "@/backend/social/realtime";
import { logError } from "@/Logger";
import { presimulateWorld } from "@/backend/advanceDay";
import { addSeat, removeSeat, SeatError } from "@/backend/seats";
import { announceMemberChange, deleteWorld, worldView } from "@/backend/worlds/worldLifecycle";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import { scheduleKick } from "@/backend/groupAdvance";
import {
  addWorldInvite, deleteWorldInvite, hasWorldInvite, listWorldInvitesFor, newWorldCode, pendingInviteCount,
  setWorldCode, worldCodeOf, worldIdByCode,
} from "@/backend/worlds/worldStore";
import { WORLD, isWorldDeadline } from "@/Domain/multiplayer/worldConfig";
import { normalizeWorldCode } from "@/Domain/multiplayer/worldCode";
import { parseSeatManager } from "@/Domain/multiplayer/seatManager";
import { isValidSeatId } from "@/Domain/seats/seats";
import type { SaveMeta } from "@/backend/SaveService";
import type { WorldByCode, WorldErrorCode, WorldInviteView } from "@/types/multiplayerTypes";

type Req = Request & { params: Record<string, string> };

const MAX_BODY_BYTES = 8 * 1024;
const MAX_CLUB_ID = 64;
const MAX_NICKNAME = 20;

export function fail(error: WorldErrorCode, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status });
}

/**
 * The JSON object of the body, or the failing response: 413 `tooLarge` over 8 KB (the declared `Content-Length`
 * before reading, the bytes actually read after: the header can lie) and 400 `invalidBody` when it is not an object.
 */
export async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail("tooLarge", 413);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail("tooLarge", 413);
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail("invalidBody", 400);
  } catch {
    return fail("invalidBody", 400);
  }
}

/** The meta of a world of friends; null for a solo save or a missing one. */
export async function multiWorld(saveId: string): Promise<(SaveMeta & { world: NonNullable<SaveMeta["world"]> }) | null> {
  const meta = await saveService.getMeta(saveId);
  return meta?.mode === "multi" && meta.world ? (meta as SaveMeta & { world: NonNullable<SaveMeta["world"]> }) : null;
}

/** The world behind an invite code (any case, with spaces or dashes). */
function worldOfCode(raw: unknown): string | null {
  const code = typeof raw === "string" && raw.length <= 64 ? normalizeWorldCode(raw) : null;
  return code ? worldIdByCode(code) : null;
}

/** Re-read inside the lock: the caller still owns the world. */
function stillOwner(saveId: string, userId: string): boolean {
  return memberOf(saveId, userId)?.role === "owner";
}

export const worldRoutes = {
  "/api/worlds/by-code/:code": {
    GET: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const saveId = worldOfCode(req.params.code ?? "");
      const meta = saveId ? await multiWorld(saveId) : null;
      if (!saveId || !meta) return fail("notFound", 404);
      if (memberOf(saveId, auth.userId)) return fail("alreadyMember", 409, { saveId });
      if (meta.seats.length >= WORLD.MAX_MEMBERS) return fail("full", 409);
      const owner = listSaveMembers(saveId).find((m) => m.role === "owner");
      const ownerSeat = owner ? await saveService.getSeat(saveId, owner.seatId) : null;
      const body: WorldByCode = {
        saveId,
        name: meta.name,
        leagueSlug: ownerSeat?.leagueSlug ?? "",
        leagueName: ownerSeat?.leagueName ?? "",
        owner: (owner && getSocialUser(owner.userId)?.nickname) || ownerSeat?.manager?.name || meta.name,
        members: meta.seats.length,
        max: WORLD.MAX_MEMBERS,
        phase: meta.world.phase,
        takenClubs: [...(await saveService.humanClubIds(saveId))],
      };
      return Response.json(body);
    },
  },

  "/api/worlds/join": {
    POST: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await readBody(req);
      if (body instanceof Response) return body;
      const saveId = worldOfCode(body.code);
      if (!saveId || !(await multiWorld(saveId))) return fail("notFound", 404);
      const manager = parseSeatManager(body.manager);
      if (!manager) return fail("invalidManager", 400);
      if (typeof body.clubId !== "string" || !body.clubId || body.clubId.length > MAX_CLUB_ID) return fail("invalidClub", 400);
      if (body.sackingEnabled !== undefined && typeof body.sackingEnabled !== "boolean") return fail("invalidBody", 400);
      try {
        const { seatId } = await addSeat(saveId, {
          userId: auth.userId, clubId: body.clubId, manager,
          sackingEnabled: body.sackingEnabled !== false, maxSeats: WORLD.MAX_MEMBERS,
          // Inside the lock: a code changed meanwhile is a 404; the invite, the inbox and the news do not race the day.
          guard: () => worldOfCode(body.code) === saveId,
          onLocked: async ({ seatId: id, seat }) => {
            deleteWorldInvite(saveId, auth.userId);
            await announceMemberChange(saveId, {
              seatId: id, event: "joined", managerName: manager.name,
              clubId: seat.clubId, clubName: seat.clubName, leagueSlug: seat.leagueSlug,
            });
          },
        });
        // A new seat (not ready) holds the world: the executor looks again, outside the lock.
        scheduleKick(saveId);
        const phase = (await multiWorld(saveId))?.world.phase ?? "running";
        return Response.json({ saveId, seatId, phase }, { status: 201 });
      } catch (e) {
        if (!(e instanceof SeatError)) throw e;
        if (e.code === "alreadyMember") return fail("alreadyMember", 409, { saveId });
        if (e.code === "full") return fail("full", 409);
        if (e.code === "clubTaken") return fail("clubTaken", 409);
        if (e.code === "clubNotFound") return fail("invalidClub", 400);
        return fail("notFound", 404);
      }
    },
  },

  "/api/worlds/invites": {
    GET: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const invites: WorldInviteView[] = [];
      for (const inv of listWorldInvitesFor(auth.userId)) {
        const meta = await multiWorld(inv.saveId);
        const code = worldCodeOf(inv.saveId);
        const from = getSocialUser(inv.fromUser)?.nickname;
        const alive =
          !!meta && !!code && !!from &&
          stillOwner(inv.saveId, inv.fromUser) &&
          areFriends(inv.fromUser, auth.userId) &&
          !blockedEitherWay(inv.fromUser, auth.userId) &&
          meta.seats.length < WORLD.MAX_MEMBERS &&
          !memberOf(inv.saveId, auth.userId);
        if (!alive) {
          deleteWorldInvite(inv.saveId, auth.userId);
          continue;
        }
        invites.push({ saveId: inv.saveId, name: meta.name, from: from!, code: code! });
      }
      return Response.json({ invites });
    },
  },

  "/api/worlds/invites/:saveId": {
    DELETE: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      deleteWorldInvite(req.params.saveId!, auth.userId);
      return Response.json({ ok: true });
    },
  },

  "/api/worlds/:saveId": {
    GET: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      const view = await worldView(saveId, { seatId: auth.seatId, role: auth.role });
      return view ? Response.json(view) : fail("notMulti", 404);
    },
  },

  "/api/worlds/:saveId/invite-code": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      return withSaveLock(saveId, async () => {
        if (!stillOwner(saveId, auth.userId)) return fail("ownerOnly", 403);
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        const inviteCode = newWorldCode();
        setWorldCode(saveId, inviteCode);
        await saveService.updateMeta(saveId, { world: { ...meta.world, inviteCode } });
        return Response.json({ inviteCode });
      });
    },
  },

  "/api/worlds/:saveId/settings": {
    PUT: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const body = await readBody(req);
      if (body instanceof Response) return body;
      if (!isWorldDeadline(body.deadlineHours)) return fail("invalidBody", 400);
      const deadlineHours = body.deadlineHours;
      const res = await withSaveLock(saveId, async () => {
        if (!stillOwner(saveId, auth.userId)) return fail("ownerOnly", 403);
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        await saveService.updateMeta(saveId, { world: { ...meta.world, deadlineHours } });
        notifyWorld(saveId, { type: "world_members", saveId });
        return Response.json({ deadlineHours });
      });
      if (res.ok) scheduleKick(saveId);
      return res;
    },
  },

  "/api/worlds/:saveId/invites": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const from = getSocialUser(auth.userId)?.nickname;
      if (!from) return fail("noNickname", 409);
      const body = await readBody(req);
      if (body instanceof Response) return body;
      if (typeof body.nickname !== "string" || body.nickname.length > MAX_NICKNAME) return fail("invalidBody", 400);
      const nickname = body.nickname;
      return withSaveLock(saveId, async () => {
        if (!stillOwner(saveId, auth.userId)) return fail("ownerOnly", 403);
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        // Only a friend of the owner, never across a block; a stranger does not exist (404).
        const target = findUserByNickname(nickname);
        if (!target || !areFriends(auth.userId, target.id) || blockedEitherWay(auth.userId, target.id)) return fail("notFound", 404);
        if (memberOf(saveId, target.id)) return fail("alreadyMember", 409);
        if (meta.seats.length >= WORLD.MAX_MEMBERS) return fail("full", 409);
        const pending = hasWorldInvite(saveId, target.id);
        if (!pending && pendingInviteCount(saveId) >= WORLD.MAX_PENDING_INVITES) return fail("inviteLimit", 409);
        addWorldInvite(saveId, target.id, auth.userId, Date.now());
        // A pending invite is only refreshed: no second event.
        if (!pending) notifyUser(target.id, { type: "world_invite", saveId, name: meta.name, from, code: meta.world.inviteCode });
        return Response.json({ ok: true });
      });
    },
  },

  "/api/worlds/:saveId/start": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const res = await withSaveLock(saveId, async () => {
        if (!stillOwner(saveId, auth.userId)) return fail("ownerOnly", 403);
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        if (meta.world.phase !== "lobby") return fail("alreadyStarted", 409);
        let result;
        try {
          result = await presimulateWorld(saveId, auth.seatId);
        } catch (e) {
          // The phase stays `lobby`; a failure midway may leave the start kit applied.
          logError("world", `start failed for ${saveId}: ${e instanceof Error ? e.message : String(e)}`);
          return fail("generic", 500);
        }
        const fresh = (await multiWorld(saveId))!;
        await saveService.updateMeta(saveId, { world: { ...fresh.world, phase: "running" } });
        notifyWorld(saveId, { type: "world_started", saveId });
        return Response.json({ ...result, phase: "running" });
      });
      // The world is running: the executor records the first stop and starts the deadline (outside the lock).
      if (res.ok) scheduleKick(saveId);
      return res;
    },
  },

  "/api/worlds/:saveId/members/:seatId/remove": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const seatId = req.params.seatId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      if (!(await multiWorld(saveId))) return fail("notMulti", 404);
      if (seatId === auth.seatId) return fail("useLeave", 400);
      if (!isValidSeatId(seatId) || !memberBySeat(saveId, seatId)) return fail("notMember", 404);
      let notOwner = false;
      try {
        await removeSeat(saveId, seatId, {
          guard: () => {
            notOwner = !stillOwner(saveId, auth.userId);
            return !notOwner && !!memberBySeat(saveId, seatId);
          },
          onLocked: async (removed) => {
            // He is no longer in save_members: tell him directly.
            if (removed.userId) notifyUser(removed.userId, { type: "world_removed", saveId });
            await announceMemberChange(saveId, {
              seatId, event: "removed", managerName: removed.managerName, clubId: removed.clubId,
              clubName: removed.clubName, leagueSlug: removed.leagueSlug,
            });
          },
        });
        // He may have been the only one missing: the executor looks again, outside the lock.
        scheduleKick(saveId);
        return Response.json({ ok: true });
      } catch (e) {
        if (e instanceof SeatError) {
          if (notOwner) return fail("ownerOnly", 403);
          return e.code === "ownerOrLast" ? fail("useLeave", 400) : fail("notMember", 404);
        }
        throw e;
      }
    },
  },

  "/api/worlds/:saveId/leave": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (!(await multiWorld(saveId))) return fail("notMulti", 404);
      if (auth.role === "owner") {
        // The owner passes the ownership first; alone, leaving deletes the world. Both checks and the delete share
        // one lock, so a join cannot slip in between (it would then see the world gone, or this would see it).
        const done = await withSaveLock(saveId, async () => {
          // He passed the ownership meanwhile: null, and he leaves as a member below.
          if (!stillOwner(saveId, auth.userId)) return null;
          if (listSaveMembers(saveId).some((m) => m.userId !== auth.userId)) return fail("transferFirst", 409);
          await deleteWorld(saveId, auth.userId);
          return Response.json({ ok: true, deleted: true });
        });
        if (done) return done;
      }
      try {
        await removeSeat(saveId, auth.seatId, {
          onLocked: async (removed) => {
            await announceMemberChange(saveId, {
              seatId: auth.seatId, event: "left", managerName: removed.managerName, clubId: removed.clubId,
              clubName: removed.clubName, leagueSlug: removed.leagueSlug,
            });
          },
        });
        scheduleKick(saveId);
        return Response.json({ ok: true });
      } catch (e) {
        if (e instanceof SeatError && e.code === "ownerOrLast") return fail("transferFirst", 409);
        if (e instanceof SeatError) return fail("notMember", 404);
        throw e;
      }
    },
  },

  "/api/worlds/:saveId/owner": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const body = await readBody(req);
      if (body instanceof Response) return body;
      if (typeof body.seatId !== "string") return fail("invalidBody", 400);
      const seatId = body.seatId;
      return withSaveLock(saveId, async () => {
        if (!stillOwner(saveId, auth.userId)) return fail("ownerOnly", 403);
        const target = memberBySeat(saveId, seatId);
        if (!target || target.userId === auth.userId) return fail("notMember", 404);
        if (countOwnedSaves(target.userId) >= WORLD.MAX_OWNED) return fail("ownerLimit", 409);
        try {
          transferOwnership(saveId, auth.userId, target.userId);
        } catch {
          return fail("notMember", 404);
        }
        notifyWorld(saveId, { type: "world_members", saveId });
        return Response.json({ ok: true });
      });
    },
  },
};
