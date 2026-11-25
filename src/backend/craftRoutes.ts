import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { SaveService, saveService } from "@/backend/SaveService";
import { recordMoney } from "@/backend/FinancialService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { ensureCraft } from "@/backend/craftWorld";
import { withInitialFacilities } from "@/backend/facilityWorld";
import { isPresident } from "@/Domain/ownClub/ownClub";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import { allowanceShare } from "@/Domain/craft/allowance";
import { COMPONENTS, CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import { recipeFor } from "@/Domain/craft/recipes";
import { shareOf } from "@/Domain/craft/recycle";
import { orderTotal, unitPrice, weekPrice, type OrderLine } from "@/Domain/craft/shop";
import { addComponents, addMaterials, takeComponents } from "@/Domain/craft/stock";
import { benchCount, cancelJob, enqueue, moveJob } from "@/Domain/craft/workshop";
import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import { addDays, daysBetween } from "@/Domain/dates";
import { itemBusy, itemValue, withFacilities, worksSizeFactor } from "@/Domain/facilities/facilities";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { FACILITY_ITEMS, isFacilityItemId } from "@/Domain/facilities/facilityItems";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { foremanSpeedOf, foremanStarsOf } from "@/Domain/staff/staff";
import { logError } from "@/Logger";
import type { ComponentCounts, ComponentId, MaterialId, Supplier } from "@/types/craftTypes";
import type { FacilityItemId } from "@/types/facilityTypes";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

interface Club {
  squad: Squad;
  ref: { leagueSlug: string; clubSlug: string };
  date: string;
  board: number;
  /** The board level the monthly allowance is read at (the president's fixed one in a founded club). */
  allowanceBoard: number;
  leagueSlug: string;
}

/** The seat's club with its facilities and craft state (created when missing), or 409 `noClub` when unemployed. */
async function loadClub(saveId: string, seatId: string): Promise<Club | Response> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const entry = (await saveService.getSquadIndex(saveId)).byId(meta.clubId);
  if (!entry) return Response.json({ error: "squad not found" }, { status: 404 });
  let squad = await saveService.getSquad(saveId, entry.leagueSlug, entry.stem);
  if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
  if (!squad.facilities?.items) squad = await withInitialFacilities(squad, entry.leagueSlug);
  squad = { ...squad, facilities: ensureCraft(squad.facilities!, squad) };
  return {
    squad, ref: { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
    date: meta.currentDate ?? new Date().toISOString().slice(0, 10),
    board: meta.board?.board ?? BOARD_FANS.START,
    allowanceBoard: isPresident(squad, seatId) ? FOUNDED.ALLOWANCE_BOARD : meta.board?.board ?? BOARD_FANS.START, leagueSlug: meta.leagueSlug,
  };
}

const ctxOf = (saveId: string, c: Club) => ({
  saveId, clubId: c.squad.id, foremanStars: foremanStarsOf(c.squad), foremanSpeed: foremanSpeedOf(c.squad),
});

/** Components given back by taking `item` down one level: `RECYCLE_RETURN` of the recipe of its last upgrade. */
function recycleBack(squad: Squad, item: Parameters<typeof itemValue>[1]) {
  const revenue = wageRevenueBasisOf(squad);
  const level = squad.facilities!.items[item].level;
  const value = itemValue(revenue, item, level) * FACILITIES.REPAIR.COST_SHARE * worksSizeFactor(level);
  return shareOf(recipeFor({ kind: "upgrade", item }, value, revenue), CRAFT.RECYCLE_RETURN);
}

function view(saveId: string, c: Club) {
  const craft = c.squad.facilities!.craft!;
  const revenue = wageRevenueBasisOf(c.squad);
  const lastWeek = addDays(c.date, -7);
  return {
    date: c.date,
    workshop: craft.workshop, benches: benchCount(craft.workshop), maxQueue: CRAFT.MAX_QUEUE, maxLevel: CRAFT.MAX_LEVEL,
    foremanStars: foremanStarsOf(c.squad), foremanSpeed: foremanSpeedOf(c.squad),
    stock: craft.stock,
    queue: craft.queue.map((j) => ({ ...j, daysLeft: j.doneOn ? Math.max(0, daysBetween(c.date, j.doneOn)) : null })),
    shop: MATERIALS.map((m) => {
      const week = weekPrice(saveId, m, c.date, revenue);
      const prev = weekPrice(saveId, m, lastWeek, revenue);
      return { material: m, standard: unitPrice(week, "standard", c.board), good: unitPrice(week, "good", c.board), previous: unitPrice(prev, "standard", c.board) };
    }),
    discount: c.board >= CRAFT.DISCOUNT_BOARD,
    allowance: Math.round(revenue * allowanceShare(c.allowanceBoard)),
    balance: c.squad.finances?.budget ?? 0,
    recipes: COMPONENTS.map((id) => ({ component: id, ...CRAFT.RECIPES[id], locked: CRAFT.RECIPES[id].minLevel > craft.workshop })),
    /** What recycling each item above level 1 would give back (the Recycle cards show it). */
    recycle: Object.fromEntries(FACILITY_ITEMS.filter((id) => (c.squad.facilities!.items[id]?.level ?? 1) > 1)
      .map((id) => [id, recycleBack(c.squad, id)])) as Partial<Record<FacilityItemId, ComponentCounts>>,
    upgrade: craft.workshop < CRAFT.MAX_LEVEL
      ? { level: craft.workshop + 1, recipe: recipeFor({ kind: "workshop" }, revenue * CRAFT.WORKSHOP_COST[craft.workshop + 1]!, revenue) }
      : null,
  };
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function save(saveId: string, c: Club, squad: Squad): Promise<Club> {
  await saveService.saveSquad(saveId, c.ref.leagueSlug, c.ref.clubSlug, squad);
  return { ...c, squad };
}

function route(method: "GET" | "POST", fn: (req: Req, saveId: string, seatId: string) => Promise<Response>) {
  return async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== method) return Response.json({ error: "method not allowed" }, { status: 405 });
    return fn(req, saveId, auth.seatId);
  };
}

const isMaterial = (v: unknown): v is MaterialId => typeof v === "string" && (MATERIALS as readonly string[]).includes(v);
const isComponent = (v: unknown): v is ComponentId => typeof v === "string" && (COMPONENTS as readonly string[]).includes(v);
const MAX_BUY = 10_000;
const MAX_ORDER_LINES = 12;

/**
 * The workshop, the shop and the stock of the seat's club (spec 2026-11-18-club-craft). Writes under the
 * save lock; no club → 409 `noClub`.
 */
export const craftRoutes = {
  "/api/saves/:saveId/craft": route("GET", async (_req, saveId, seatId) => {
    const c = await loadClub(saveId, seatId);
    return c instanceof Response ? c : Response.json(view(saveId, c));
  }),

  /** `POST { items: [{ material, supplier, qty }] }`: buys at this week's price, paid from the balance. */
  "/api/saves/:saveId/craft/buy": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    const raw = Array.isArray(body?.items) ? (body!.items as unknown[]) : null;
    if (!raw || raw.length === 0 || raw.length > MAX_ORDER_LINES) return Response.json({ error: "invalidOrder" }, { status: 400 });
    const lines: OrderLine[] = [];
    for (const l of raw) {
      const x = (l && typeof l === "object" ? l : {}) as { material?: unknown; supplier?: unknown; qty?: unknown };
      if (!isMaterial(x.material) || (x.supplier !== "standard" && x.supplier !== "good")
        || typeof x.qty !== "number" || !Number.isInteger(x.qty) || x.qty < 1 || x.qty > MAX_BUY) {
        return Response.json({ error: "invalidOrder" }, { status: 400 });
      }
      lines.push({ material: x.material, supplier: x.supplier as Supplier, qty: x.qty });
    }
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const total = orderTotal(lines, saveId, c.date, wageRevenueBasisOf(c.squad), c.board);
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      try {
        let stock = c.squad.facilities!.craft!.stock;
        for (const l of lines) stock = addMaterials(stock, l.supplier, { [l.material]: l.qty });
        const squad = withFacilities(c.squad, { ...c.squad.facilities!, craft: { ...c.squad.facilities!.craft!, stock } });
        await service.saveSquad(saveId, c.ref.leagueSlug, c.ref.clubSlug, squad);
        const season = (await service.getLeagueMeta(saveId, c.leagueSlug))?.year ?? parseInt(c.date.slice(0, 4), 10);
        const paid = await recordMoney(service, saveId, season, c.ref, {
          date: c.date, kind: "facilities", amount: -total, label: "Workshop materials", ref: { facility: "materials" },
        }, seatId);
        await buffer.flush();
        return Response.json({ total, view: view(saveId, { ...c, squad: paid }) });
      } catch (err) {
        logError("craft", `save ${saveId}: failed to buy materials`, err);
        return Response.json({ error: "generic" }, { status: 500 });
      }
    });
  }),

  /**
   * `POST { component, qty, goodShare? }`: a new order on the queue (materials taken from the stock now). `goodShare`
   * (0..1) is the share of good-supplier materials to use; absent = the good ones first.
   */
  "/api/saves/:saveId/craft/queue": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    if (!isComponent(body?.component) || typeof body!.qty !== "number") return Response.json({ error: "invalidQty" }, { status: 400 });
    const gs = body!.goodShare;
    if (gs !== undefined && (typeof gs !== "number" || !(gs >= 0 && gs <= 1))) return Response.json({ error: "invalidQty" }, { status: 400 });
    const component = body!.component as ComponentId;
    const qty = body!.qty as number;
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const r = enqueue(c.squad.facilities!.craft!, { component, qty, ...(gs !== undefined ? { goodShare: gs as number } : {}) }, ctxOf(saveId, c));
      if ("error" in r) return Response.json({ error: r.error }, { status: r.error === "locked" || r.error === "invalidQty" ? 400 : 409 });
      const next = await save(saveId, c, withFacilities(c.squad, { ...c.squad.facilities!, craft: r.craft }));
      return Response.json(view(saveId, next));
    });
  }),

  /** `POST { action: "up" | "down" | "cancel" }` on one order. */
  "/api/saves/:saveId/craft/queue/:jobId": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    const action = body?.action;
    if (action !== "up" && action !== "down" && action !== "cancel") return Response.json({ error: "invalidAction" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const craft = c.squad.facilities!.craft!;
      const jobId = req.params.jobId!;
      const job = craft.queue.find((j) => j.id === jobId);
      if (!job) return Response.json({ error: "notFound" }, { status: 404 });
      // Finished on its day (the day advance has not handed it to the stock yet): nothing to cancel.
      if (action === "cancel" && job.doneOn && job.doneOn <= c.date) return Response.json({ error: "done" }, { status: 409 });
      const r = action === "cancel" ? cancelJob(craft, jobId) : moveJob(craft, jobId, action);
      if (!r) return Response.json({ error: "cannotMove" }, { status: 409 });
      const next = await save(saveId, c, withFacilities(c.squad, { ...c.squad.facilities!, craft: r }));
      return Response.json(view(saveId, next));
    });
  }),

  /** Workshop upgrade: takes the recipe from the stock and goes up a level at once. */
  "/api/saves/:saveId/craft/workshop": route("POST", async (_req, saveId, seatId) => {
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const v = view(saveId, c);
      if (!v.upgrade) return Response.json({ error: "maxLevel" }, { status: 400 });
      const craft = c.squad.facilities!.craft!;
      const taken = takeComponents(craft.stock, v.upgrade.recipe);
      if (!taken) return Response.json({ error: "missingComponents" }, { status: 409 });
      const next = await save(saveId, c, withFacilities(c.squad, {
        ...c.squad.facilities!, craft: { ...craft, stock: taken.stock, workshop: craft.workshop + 1 },
      }));
      return Response.json(view(saveId, next));
    });
  }),

  /** `POST { item }`: takes an item down one level and gives back `RECYCLE_RETURN` of its upgrade recipe (common quality). */
  "/api/saves/:saveId/craft/recycle": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    if (!isFacilityItemId(body?.item)) return Response.json({ error: "invalidRequest" }, { status: 400 });
    const item = body!.item;
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const f = c.squad.facilities!;
      const it = f.items[item];
      if (it.level <= 1) return Response.json({ error: "minLevel" }, { status: 400 });
      if (itemBusy(f, item)) return Response.json({ error: "busy" }, { status: 409 });
      const back = recycleBack(c.squad, item);
      let stock = f.craft!.stock;
      for (const [id, n] of Object.entries(back) as [ComponentId, number][]) stock = addComponents(stock, id, { common: n });
      const items = { ...f.items, [item]: { ...it, level: it.level - 1 } };
      const next = await save(saveId, c, withFacilities(c.squad, { ...f, items, craft: { ...f.craft!, stock } }));
      return Response.json({ returned: back, view: view(saveId, next) });
    });
  }),
};
