import { saveService } from "@/backend/SaveService";
import { requireAuth, requireSeat } from "@/backend/auth/middleware";
import { listSaveMembers, memberBySeat, memberOf, transferOwnership } from "@/backend/auth/saveOwnership";
import { withSaveLock } from "@/backend/saveLock";
import { areFriends, blockedEitherWay, findUserByNickname, getSocialUser } from "@/backend/social/socialStore";
import { notifyUser } from "@/backend/social/realtime";
import { presimulateWorld } from "@/backend/advanceDay";
import { addSeat, removeSeat, SeatError } from "@/backend/seats";
import { announceMemberChange, deleteWorld, worldView } from "@/backend/worlds/worldLifecycle";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import {
  addWorldInvite, deleteWorldInvite, hasWorldInvite, listWorldInvitesFor, newWorldCode, pendingInviteCount,
  setWorldCode, worldCodeOf, worldIdByCode,
} from "@/backend/worlds/worldStore";
import { WORLD, isWorldDeadline } from "@/Domain/multiplayer/worldConfig";
import { normalizeWorldCode } from "@/Domain/multiplayer/worldCode";
import { parseSeatManager } from "@/Domain/multiplayer/seatManager";
import type { SaveMeta } from "@/backend/SaveService";
import { isValidSeatId } from "@/Domain/seats/seats";
import type { WorldByCode, WorldErrorCode, WorldInviteView } from "@/types/multiplayerTypes";

type Req = Request & { params: Record<string, string> };

export function fail(error: WorldErrorCode, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status });
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = (await req.json()) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The meta of a world of friends; null for a solo save or a missing one. */
export async function multiWorld(saveId: string): Promise<(SaveMeta & { world: NonNullable<SaveMeta["world"]> }) | null> {
  const meta = await saveService.getMeta(saveId);
  return meta?.mode === "multi" && meta.world ? (meta as SaveMeta & { world: NonNullable<SaveMeta["world"]> }) : null;
}

/** The world behind an invite code (any case, with spaces or dashes). */
function worldOfCode(raw: unknown): string | null {
  const code = typeof raw === "string" ? normalizeWorldCode(raw) : null;
  return code ? worldIdByCode(code) : null;
}

export const worldRoutes = {
  "/api/worlds/by-code/:code": {
    GET: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const saveId = worldOfCode(decodeURIComponent(req.params.code ?? ""));
      const meta = saveId ? await multiWorld(saveId) : null;
      if (!saveId || !meta) return fail("notFound", 404);
      if (memberOf(saveId, auth.userId)) return fail("alreadyMember", 409, { saveId });
      if (meta.seats.length >= WORLD.MAX_MEMBERS) return fail("full", 409);
      const owner = listSaveMembers(saveId).find((m) => m.role === "owner");
      const ownerSeat = owner ? await saveService.getSeat(saveId, owner.seatId) : null;
      const body: WorldByCode = {
        saveId,
        name: meta.name,
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
      if (!body) return fail("invalidBody", 400);
      const saveId = worldOfCode(body.code);
      if (!saveId || !(await multiWorld(saveId))) return fail("notFound", 404);
      const manager = parseSeatManager(body.manager);
      if (!manager) return fail("invalidManager", 400);
      if (typeof body.clubId !== "string" || !body.clubId) return fail("invalidClub", 400);
      try {
        const { seatId, seat } = await addSeat(saveId, {
          userId: auth.userId, clubId: body.clubId, manager,
          sackingEnabled: body.sackingEnabled !== false, maxSeats: WORLD.MAX_MEMBERS,
        });
        deleteWorldInvite(saveId, auth.userId);
        await announceMemberChange(saveId, {
          seatId, event: "joined", managerName: manager.name,
          clubId: seat.clubId, clubName: seat.clubName, leagueSlug: seat.leagueSlug,
        });
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
      if (!body || !isWorldDeadline(body.deadlineHours)) return fail("invalidBody", 400);
      const deadlineHours = body.deadlineHours;
      return withSaveLock(saveId, async () => {
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        await saveService.updateMeta(saveId, { world: { ...meta.world, deadlineHours } });
        notifyWorld(saveId, { type: "world_members", saveId });
        return Response.json({ deadlineHours });
      });
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
        if (!meta || !code || !from || memberOf(inv.saveId, auth.userId)) continue;
        invites.push({ saveId: inv.saveId, name: meta.name, from, code });
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

  "/api/worlds/:saveId/invites": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const from = getSocialUser(auth.userId)?.nickname;
      if (!from) return fail("noNickname", 409);
      const body = await readBody(req);
      if (!body || typeof body.nickname !== "string") return fail("invalidBody", 400);
      const meta = await multiWorld(saveId);
      if (!meta) return fail("notMulti", 404);
      // Only a friend of the owner, never across a block; a stranger does not exist (404).
      const target = findUserByNickname(body.nickname);
      if (!target || !areFriends(auth.userId, target.id) || blockedEitherWay(auth.userId, target.id)) return fail("notFound", 404);
      if (memberOf(saveId, target.id)) return fail("alreadyMember", 409);
      if (meta.seats.length >= WORLD.MAX_MEMBERS) return fail("full", 409);
      if (!hasWorldInvite(saveId, target.id) && pendingInviteCount(saveId) >= WORLD.MAX_PENDING_INVITES) return fail("inviteLimit", 409);
      addWorldInvite(saveId, target.id, auth.userId, Date.now());
      notifyUser(target.id, { type: "world_invite", saveId, name: meta.name, from, code: meta.world.inviteCode });
      return Response.json({ ok: true });
    },
  },

  "/api/worlds/:saveId/start": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      return withSaveLock(saveId, async () => {
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        if (meta.world.phase !== "lobby") return fail("alreadyStarted", 409);
        const result = await presimulateWorld(saveId, auth.seatId);
        const fresh = (await multiWorld(saveId))!;
        await saveService.updateMeta(saveId, { world: { ...fresh.world, phase: "running" } });
        notifyWorld(saveId, { type: "world_started", saveId });
        return Response.json({ ...result, phase: "running" });
      });
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
      try {
        const removed = await removeSeat(saveId, seatId);
        // He is no longer in save_members: tell him directly.
        if (removed.userId) notifyUser(removed.userId, { type: "world_removed", saveId });
        await announceMemberChange(saveId, {
          seatId, event: "removed", managerName: removed.managerName, clubId: removed.clubId,
          clubName: removed.clubName, leagueSlug: removed.leagueSlug,
        });
        return Response.json({ ok: true });
      } catch (e) {
        if (e instanceof SeatError) return e.code === "ownerOrLast" ? fail("useLeave", 400) : fail("notMember", 404);
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
        // The owner passes the ownership first; alone, leaving deletes the world.
        if (listSaveMembers(saveId).some((m) => m.userId !== auth.userId)) return fail("transferFirst", 409);
        await withSaveLock(saveId, () => deleteWorld(saveId, auth.userId));
        return Response.json({ ok: true, deleted: true });
      }
      try {
        const removed = await removeSeat(saveId, auth.seatId);
        await announceMemberChange(saveId, {
          seatId: auth.seatId, event: "left", managerName: removed.managerName, clubId: removed.clubId,
          clubName: removed.clubName, leagueSlug: removed.leagueSlug,
        });
        return Response.json({ ok: true });
      } catch (e) {
        if (e instanceof SeatError && e.code === "ownerOrLast") return fail("transferFirst", 409);
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
      if (!body || typeof body.seatId !== "string") return fail("invalidBody", 400);
      const target = memberBySeat(saveId, body.seatId);
      if (!target || target.userId === auth.userId) return fail("notMember", 404);
      try {
        transferOwnership(saveId, auth.userId, target.userId);
      } catch {
        return fail("notMember", 404);
      }
      notifyWorld(saveId, { type: "world_members", saveId });
      return Response.json({ ok: true });
    },
  },
};
