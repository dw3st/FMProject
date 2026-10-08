import { saveService, SaveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { cancelScoutMissions } from "@/backend/scoutingWorld";
import { logError } from "@/Logger";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { recordMoney } from "@/backend/FinancialService";
import {
  areaMultsOf, areaStars, memberStars, resolveAreaAssignments, roleLimit, signContract, squadStaffWages,
  staffEffectsOf, starsIn, STAFF_AREAS_PER_COACH,
} from "@/Domain/staff/staff";
import { renewedContract, severanceOf } from "@/Domain/staff/staffContracts";
import { POOL_PAGE, returnToPool, searchPool, takeFromPool, isStaffPoolSort, type StaffPoolQuery } from "@/Domain/staff/staffPool";
import { STAFF } from "@/Domain/staff/staffConfig";
import {
  COACH_AREAS, STAFF_ROLES, isCoachArea, isStaffRole, type CoachArea, type StaffMember, type StaffRecord, type StaffRole,
} from "@/Domain/staff/staffTypes";
import { DP_CATEGORIES, type DPCategory } from "@/GameEngine/PlayerDevelopment";
import {
  countryBand, countryKnowledgeOf, isScoutRole, strongCountry,
} from "@/Domain/scouting/countryKnowledge";
import countriesRaw from "@/Data/countries.json";
import { wageFactorOf } from "@/Domain/finance/wages";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };
type CountryInfo = { slug: string; name: string; flag: string; iso2: string; continent?: string };

interface Human { meta: SaveMeta; squad: Squad; ref: { leagueSlug: string; clubSlug: string }; date: string; seasonEnd: string }

/** The human club (409 `noClub` when unemployed). */
async function human(saveId: string, service: SaveService = saveService): Promise<Human | Response> {
  const meta = await service.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const ref = await service.resolveSquadId(saveId, meta.clubId);
  const squad = ref ? await service.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
  if (!ref || !squad) return Response.json({ error: "squad not found" }, { status: 404 });
  const date = meta.currentDate ?? "";
  const seasonEnd = meta.activeLeagues?.find((l) => l.leagueSlug === ref.leagueSlug)?.end ?? date;
  return { meta, squad, ref, date, seasonEnd };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const validYears = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= STAFF.CONTRACT.MIN_YEARS && v <= STAFF.CONTRACT.MAX_YEARS;

/**
 * The staff screen's view: members with their stars, the seven areas, limits, effects, the weekly bill.
 * With the club's context, every member also carries the severance of firing him today and the
 * renewal offer (`renewYears`: the 1..3 years the route accepts, `renewWage`).
 */
export function staffView(squad: Squad, ctx?: { date: string; seasonEnd: string }) {
  const staff: StaffRecord = squad.staff ?? { members: [] };
  const assigned = resolveAreaAssignments(staff);
  const stars = areaStars(squad);
  const mults = areaMultsOf(squad);
  const best = (role: StaffRole) => staff.members.filter((m) => m.role === role)
    .sort((a, b) => memberStars(b) - memberStars(a) || a.id.localeCompare(b.id))[0]?.id;
  const leader = (area: DPCategory): string | undefined => {
    if (area === "physical") return best("fitness");
    if (area === "goalkeeping") return best("goalkeeping");
    return assigned[area as CoachArea]?.id;
  };
  return {
    members: staff.members.map((m) => ({
      ...m,
      stars: memberStars(m),
      ...(m.role === "coach" ? { starsByArea: Object.fromEntries(COACH_AREAS.map((a) => [a, starsIn(m, a)])) } : {}),
      ...(ctx && isScoutRole(m.role) ? { strongCountry: strongCountry(m, ctx.date) } : {}),
      ...(ctx ? memberOffer(squad, m, ctx) : {}),
    })),
    areas: DP_CATEGORIES.map((area) => {
      const memberId = stars[area] === null ? undefined : leader(area);
      return { area, stars: stars[area], mult: mults[area], ...(memberId ? { memberId } : {}) };
    }),
    areaAssignments: staff.areaAssignments ?? {},
    limits: Object.fromEntries(STAFF_ROLES.map((r) => [r, {
      used: staff.members.filter((m) => m.role === r).length, max: roleLimit(squad, r),
    }])) as Record<StaffRole, { used: number; max: number }>,
    effects: staffEffectsOf(squad),
    weeklyTotal: squadStaffWages(staff),
  };
}

function memberOffer(squad: Squad, m: StaffMember, ctx: { date: string; seasonEnd: string }) {
  const renewals = ([1, 2, 3] as const)
    .map((years) => ({ years, c: renewedContract(m, { ...ctx, years, clubFactor: wageFactorOf(squad) }) }))
    .filter((r) => r.c !== null);
  return {
    severance: severanceOf(m, ctx.date),
    renewYears: renewals.map((r) => r.years),
    ...(renewals[0] ? { renewWage: renewals[0].c!.wage } : {}),
  };
}

async function ledgerSeason(service: SaveService, saveId: string, leagueSlug: string, date: string): Promise<number> {
  return (await service.getLeagueMeta(saveId, leagueSlug))?.year ?? parseInt(date.slice(0, 4), 10);
}

/**
 * One unit of work (under the save lock): every write of `fn` (squad, ledger, pool, scouting) goes
 * to a BufferingSaveDAL flushed at the end, so a request never leaves half of them on disk. Nothing
 * is written when `fn` answers with an error status.
 */
async function inUnit(saveId: string, what: string, fn: (service: SaveService) => Promise<Response>): Promise<Response> {
  const buffer = new BufferingSaveDAL(new FileSystemDAL());
  const service = new SaveService(buffer);
  try {
    const res = await fn(service);
    if (res.ok) await buffer.flush();
    return res;
  } catch (err) {
    logError("staff", `save ${saveId}: failed to ${what}`, err);
    return Response.json({ error: `failed to ${what}` }, { status: 500 });
  }
}

function parsePoolQuery(params: URLSearchParams): StaffPoolQuery | null {
  const q: StaffPoolQuery = {};
  const role = params.get("role");
  if (role) {
    if (!isStaffRole(role)) return null;
    q.role = role;
  }
  const num = (k: string): number | null | undefined => {
    const raw = params.get(k);
    if (raw === null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const minStars = num("minStars");
  const maxWage = num("maxWage");
  const offset = num("offset");
  const limit = num("limit");
  if (minStars === null || maxWage === null || offset === null || limit === null) return null;
  if (minStars !== undefined) {
    if (minStars < STAFF.MIN_STARS || minStars > STAFF.MAX_STARS) return null;
    q.minStars = minStars;
  }
  if (maxWage !== undefined) {
    if (maxWage < 0) return null;
    q.maxWage = maxWage;
  }
  if (offset !== undefined) {
    if (!Number.isInteger(offset) || offset < 0) return null;
    q.offset = offset;
  }
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1 || limit > POOL_PAGE.MAX) return null;
    q.limit = limit;
  }
  const sort = params.get("sort");
  if (sort) {
    if (!isStaffPoolSort(sort)) return null;
    q.sort = sort;
  }
  const dir = params.get("dir");
  if (dir) {
    if (dir !== "asc" && dir !== "desc") return null;
    q.dir = dir;
  }
  return q;
}

/**
 * Coaching staff (`.claude/rules/game/staff.md`): the human club's staff, the free pool search,
 * hiring (contract 1-3 seasons, frozen wage), firing (severance, back to the pool), renewal and the
 * coach area assignments. Wages are charged by the Monday ledger line (`kind: "staff"`).
 */
export const staffRoutes = {
  "/api/saves/:saveId/staff": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const h = await human(saveId);
    if (h instanceof Response) return h;
    return Response.json(staffView(h.squad, h));
  },

  /** `GET ?role=&minStars=&maxWage=&sort=name|role|age|stars|wage&dir=asc|desc&offset=&limit=` - the free pool, asking wage at the club's factor. */
  "/api/saves/:saveId/staff/pool": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const q = parsePoolQuery(new URL(req.url).searchParams);
    if (!q) return Response.json({ error: "invalid query" }, { status: 400 });
    // Under the lock: a missing pool is generated and written on the first read.
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const pool = await saveService.getStaffPool(saveId, meta.currentDate ?? "");
      // Unemployed: the pool stays visible (hiring does not), priced at a neutral factor.
      const h = await human(saveId);
      const factor = h instanceof Response ? 1 : wageFactorOf(h.squad);
      return Response.json(searchPool(pool, q, factor, meta.currentDate ?? undefined));
    });
  },

  /** `POST { memberId, years }` - signs a professional of the pool (409 `roleFull` past the tier's limit). */
  "/api/saves/:saveId/staff/hire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    if (!body || typeof body.memberId !== "string") return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    if (!validYears(body.years)) return Response.json({ error: "invalidYears" }, { status: 400 });
    const years = body.years;
    const memberId = body.memberId;
    return withSaveLock(saveId, () => inUnit(saveId, "hire", async (service) => {
      const h = await human(saveId, service);
      if (h instanceof Response) return h;
      const pool = await service.getStaffPool(saveId, h.date);
      const taken = takeFromPool(pool, memberId);
      if (!taken) return Response.json({ error: "notInPool" }, { status: 404 });
      const staff = h.squad.staff ?? { members: [] };
      const role = taken.member.role;
      if (staff.members.filter((m) => m.role === role).length >= roleLimit(h.squad, role)) {
        return Response.json({ error: "roleFull" }, { status: 409 });
      }
      const signed = signContract(taken.member, { date: h.date, seasonEnd: h.seasonEnd, years, clubFactor: wageFactorOf(h.squad) });
      const next: Squad = { ...h.squad, staff: { ...staff, members: [...staff.members, signed] } };
      await service.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, next);
      await service.writeStaffPool(saveId, taken.pool);
      return Response.json(staffView(next, h));
    }));
  },

  /** `POST { memberId }` (or `{ role }`) - dismisses a professional: severance in the ledger, back to the pool. */
  "/api/saves/:saveId/staff/fire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    const memberId = body?.memberId;
    const role = body?.role;
    if (typeof memberId !== "string" && !isStaffRole(role)) return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    return withSaveLock(saveId, () => inUnit(saveId, "fire", async (service) => {
      const h = await human(saveId, service);
      if (h instanceof Response) return h;
      const staff = h.squad.staff ?? { members: [] };
      const member = typeof memberId === "string"
        ? staff.members.find((m) => m.id === memberId)
        : staff.members.filter((m) => m.role === role).sort((a, b) => memberStars(b) - memberStars(a) || a.id.localeCompare(b.id))[0];
      if (!member) return Response.json({ error: "notYourStaff" }, { status: 404 });
      const severance = severanceOf(member, h.date);
      const areaAssignments = staff.areaAssignments
        ? Object.fromEntries(Object.entries(staff.areaAssignments).filter(([, id]) => id !== member.id))
        : undefined;
      let next: Squad = {
        ...h.squad,
        staff: { members: staff.members.filter((m) => m.id !== member.id), ...(areaAssignments ? { areaAssignments } : {}) },
      };
      await service.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, next);
      if (severance > 0) {
        next = await recordMoney(service, saveId, await ledgerSeason(service, saveId, h.ref.leagueSlug, h.date), h.ref, {
          date: h.date, kind: "staff", amount: -severance, label: `Staff severance: ${member.name}`, ref: { stage: "severance" },
        });
      }
      const pool = await service.getStaffPool(saveId, h.date);
      await service.writeStaffPool(saveId, returnToPool(pool, member, h.date));
      if (member.role === "fieldScout") await cancelScoutMissions(service, saveId, [member.id]);
      return Response.json({ ...staffView(next, h), severance });
    }));
  },

  /** `POST { memberId, years }` - renews a contract from its current end (400 `tooManyYears`). */
  "/api/saves/:saveId/staff/renew": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    if (!body || typeof body.memberId !== "string") return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    if (!validYears(body.years)) return Response.json({ error: "invalidYears" }, { status: 400 });
    const years = body.years;
    const memberId = body.memberId;
    return withSaveLock(saveId, async () => {
      const h = await human(saveId);
      if (h instanceof Response) return h;
      const staff = h.squad.staff ?? { members: [] };
      const member = staff.members.find((m) => m.id === memberId);
      if (!member) return Response.json({ error: "notYourStaff" }, { status: 404 });
      const contract = renewedContract(member, { date: h.date, seasonEnd: h.seasonEnd, years, clubFactor: wageFactorOf(h.squad) });
      if (!contract) return Response.json({ error: "tooManyYears" }, { status: 400 });
      const next: Squad = {
        ...h.squad,
        staff: { ...staff, members: staff.members.map((m) => (m.id === member.id ? { ...m, contract } : m)) },
      };
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, next);
      return Response.json(staffView(next, h));
    });
  },

  /** `PUT { [area]: memberId | null }` - the user's coach for a field area (`null` = automatic). */
  /**
   * `GET` - what a scout (of the club's staff or of the free pool) knows of every game country
   * (`.claude/rules/game/scouting.md` → "Conhecimento por país"). 404 `notFound`, 400 `notAScout`.
   */
  "/api/saves/:saveId/staff/:memberId/countries": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getMeta(saveId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const date = meta.currentDate ?? "";
    const id = req.params.memberId!;
    const own = meta.clubId ? await saveService.getSquadById(saveId, meta.clubId) : null;
    let member = own?.staff?.members.find((m) => m.id === id);
    if (!member) {
      const pool = await withSaveLock(saveId, () => saveService.getStaffPool(saveId, date));
      member = pool.members.find((m) => m.id === id);
    }
    if (!member) return Response.json({ error: "notFound" }, { status: 404 });
    if (!isScoutRole(member.role)) return Response.json({ error: "notAScout" }, { status: 400 });
    const scout = member;
    const countries = Object.entries(countriesRaw as Record<string, CountryInfo>).map(([country, c]) => {
      const k = Math.round(countryKnowledgeOf(scout, country, date));
      const last = scout.countryKnowledge?.[country]?.last;
      return {
        country, slug: c.slug, name: c.name, flag: c.flag, iso2: c.iso2, continent: c.continent ?? "",
        k, band: countryBand(k), native: country === scout.nationality, ...(last ? { last } : {}),
      };
    });
    return Response.json({ memberId: scout.id, name: scout.name, nationality: scout.nationality, countries });
  },

  "/api/saves/:saveId/staff/areas": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    if (!body) return Response.json({ error: "invalid body" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await human(saveId);
      if (h instanceof Response) return h;
      const staff = h.squad.staff ?? { members: [] };
      const coaches = new Set(staff.members.filter((m) => m.role === "coach").map((m) => m.id));
      const assignments: Partial<Record<CoachArea, string>> = { ...(staff.areaAssignments ?? {}) };
      for (const [area, id] of Object.entries(body)) {
        if (!isCoachArea(area)) return Response.json({ error: "unknownArea" }, { status: 400 });
        if (id === null) { delete assignments[area]; continue; }
        if (typeof id !== "string" || !coaches.has(id)) return Response.json({ error: "notACoach" }, { status: 400 });
        assignments[area] = id;
      }
      const load = new Map<string, number>();
      for (const id of Object.values(assignments)) load.set(id!, (load.get(id!) ?? 0) + 1);
      if ([...load.values()].some((n) => n > STAFF_AREAS_PER_COACH)) {
        return Response.json({ error: "tooManyAreas" }, { status: 400 });
      }
      const next: Squad = { ...h.squad, staff: { ...staff, areaAssignments: assignments } };
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, next);
      return Response.json(staffView(next, h));
    });
  },
};
