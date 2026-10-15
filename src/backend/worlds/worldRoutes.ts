import { saveService } from "@/backend/SaveService";
import { requireAuth, requireSeat } from "@/backend/auth/middleware";
import { listSaveMembers, memberOf } from "@/backend/auth/saveOwnership";
import { withSaveLock } from "@/backend/saveLock";
import { getSocialUser } from "@/backend/social/socialStore";
import { addSeat, SeatError } from "@/backend/seats";
import { announceMemberChange, worldView } from "@/backend/worlds/worldLifecycle";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import { deleteWorldInvite, newWorldCode, setWorldCode, worldIdByCode } from "@/backend/worlds/worldStore";
import { WORLD, isWorldDeadline } from "@/Domain/multiplayer/worldConfig";
import { normalizeWorldCode } from "@/Domain/multiplayer/worldCode";
import { parseSeatManager } from "@/Domain/multiplayer/seatManager";
import type { SaveMeta } from "@/backend/SaveService";
import type { WorldByCode, WorldErrorCode } from "@/types/multiplayerTypes";

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
};
