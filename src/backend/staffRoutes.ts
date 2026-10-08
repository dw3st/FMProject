import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { areaStars, headOf, squadStaffWages, staffEffectsOf } from "@/Domain/staff/staff";
import { isStaffRole, type StaffRecord } from "@/Domain/staff/staffTypes";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

async function loadHumanSquad(saveId: string) {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return null;
  const ref = await saveService.resolveSquadId(saveId, meta.clubId);
  if (!ref) return null;
  const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
  if (!squad) return null;
  return { meta, ref, squad };
}

function staffView(squad: Squad) {
  const staff: StaffRecord = squad.staff ?? { members: [] };
  // Wages are the contracts' frozen wages (Etapa 31a).
  return { staff, effects: staffEffectsOf(squad), areas: areaStars(squad), weeklyTotal: squadStaffWages(staff) };
}

/**
 * Technical staff (`.claude/rules/game/staff.md`): the human club's three professionals, the
 * weekly market of candidates, hiring (replaces the current one) and firing (role left vacant).
 * The wage is charged by the Monday ledger line (`kind: "staff"`), never at hiring.
 */
export const staffRoutes = {
  "/api/saves/:saveId/staff": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const found = await loadHumanSquad(saveId);
    if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
    return Response.json(staffView(found.squad));
  },

  "/api/saves/:saveId/staff/market": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    // The weekly market is gone: the staff pool replaces it (Etapa 31a).
    return Response.json({ error: "gone" }, { status: 410 });
  },

  /** `POST` `{ role, candidateId }` - hire a candidate of this week's market, replacing the current one. */
  "/api/saves/:saveId/staff/hire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    // Provisional until the staff pool lands (Etapa 31a): no market to hire from.
    return Response.json({ error: "gone" }, { status: 410 });
  },

  /** `POST` `{ role }` - dismiss the professional; the role stays vacant (effect of rating 3). */
  "/api/saves/:saveId/staff/fire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const { role, memberId } = (body ?? {}) as Record<string, unknown>;
    if (!isStaffRole(role) && typeof memberId !== "string") return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const staff = found.squad.staff ?? { members: [] };
      const id = typeof memberId === "string" ? memberId : headOf(found.squad, role as Parameters<typeof headOf>[1])?.id;
      if (!id || !staff.members.some((m) => m.id === id)) return Response.json({ error: "member not found" }, { status: 404 });
      const next: Squad = { ...found.squad, staff: { ...staff, members: staff.members.filter((m) => m.id !== id) } };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json(staffView(next));
    });
  },
};
