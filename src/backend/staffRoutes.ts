import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { wageFactorOf } from "@/Domain/finance/wages";
import { squadStaffWages, staffEffectsOf, staffMarket, staffWeeklyWage, weekStartOf } from "@/Domain/staff/staff";
import { STAFF_ROLES, isStaffRole, type StaffMember, type StaffRecord, type StaffRole } from "@/Domain/staff/staffTypes";
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
  const factor = wageFactorOf(squad);
  const staff: StaffRecord = squad.staff ?? {};
  // Members carry the wage at the club's CURRENT factor (the bill follows club growth).
  const members: StaffRecord = {};
  for (const role of STAFF_ROLES) {
    const m = staff[role];
    if (m) members[role] = { ...m, wage: staffWeeklyWage(m.rating, factor) };
  }
  return { staff: members, effects: staffEffectsOf(squad), weeklyTotal: squadStaffWages(staff, factor) };
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
    const found = await loadHumanSquad(saveId);
    if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
    const date = found.meta.currentDate ?? new Date().toISOString().slice(0, 10);
    const factor = wageFactorOf(found.squad);
    const candidates = Object.fromEntries(
      STAFF_ROLES.map((role) => [role, staffMarket(saveId, date, role, factor)]),
    ) as Record<StaffRole, StaffMember[]>;
    return Response.json({ week: weekStartOf(date), candidates });
  },

  /** `POST` `{ role, candidateId }` - hire a candidate of this week's market, replacing the current one. */
  "/api/saves/:saveId/staff/hire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const { role, candidateId } = (body ?? {}) as Record<string, unknown>;
    if (!isStaffRole(role) || typeof candidateId !== "string") {
      return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    }
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const date = found.meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const candidate = staffMarket(saveId, date, role, wageFactorOf(found.squad)).find((c) => c.id === candidateId);
      if (!candidate) return Response.json({ error: "candidate not found" }, { status: 404 });
      const next: Squad = { ...found.squad, staff: { ...(found.squad.staff ?? {}), [role]: candidate } };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json(staffView(next));
    });
  },

  /** `POST` `{ role }` - dismiss the professional; the role stays vacant (effect of rating 3). */
  "/api/saves/:saveId/staff/fire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const { role } = (body ?? {}) as Record<string, unknown>;
    if (!isStaffRole(role)) return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { [role]: _removed, ...rest } = found.squad.staff ?? {};
      const next: Squad = { ...found.squad, staff: rest };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json(staffView(next));
    });
  },
};
