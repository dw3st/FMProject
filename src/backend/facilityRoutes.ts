import { stadiumLookOf } from "@/backend/stadiumData";
import { standDepths } from "@/Domain/facilities/standDepth";
import { randomUUID } from "node:crypto";
import { type SaveService, saveService, type SeatMeta } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { leagueTierOf, seatCostFor, withInitialFacilities } from "@/backend/facilityWorld";
import { ensureCraft } from "@/backend/craftWorld";
import {
  academyEffectsAt, academyEffectsOf, busyGroups, groupBusy, impliedLevel, requestGroup, comfortPriceMult, committedSpend, effectiveCapacity, itemBusy,
  projectProgress, projectRunning, quoteProject, startCraftProject, totalSeats, trainingEffectsAt, trainingGroundEffectsOf,
  validSeats, weeklyUpkeep, withFacilities, type ProjectQuote,
} from "@/Domain/facilities/facilities";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { recipeFor } from "@/Domain/craft/recipes";
import { shareOf } from "@/Domain/craft/recycle";
import { addComponents, missingComponents, takeComponents, worksQuality } from "@/Domain/craft/stock";
import type { ComponentCounts, ComponentId } from "@/types/craftTypes";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { TURF_TYPES, isTurfType, isMowingPattern } from "@/Domain/facilities/turf";
import {
  FACILITY_ITEMS, ITEM_GROUP, comfortLevel, conditionOf, groupLevel, isFacilityItemId, itemEffects,
} from "@/Domain/facilities/facilityItems";
import { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import type { ClubFacilities, FacilityItemId, FacilityRequest, StandId } from "@/types/facilityTypes";
import type { Squad } from "@/types/playerTypes";
import { playerCupSlug } from "@/backend/cupWorld";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { homeMatchImportance } from "@/backend/matchImportance";

type Req = Request & { params: Record<string, string> };

const STANDS: readonly StandId[] = ["north", "south", "east", "west"];

interface Human {
  meta: SeatMeta;
  squad: Squad;
  ref: { leagueSlug: string; clubSlug: string };
  date: string;
}

/** The human club (with facilities set up if missing), or 409 `noClub` when unemployed. */
async function loadHuman(saveId: string, seatId: string, service: SaveService = saveService): Promise<Human | Response> {
  const meta = await service.getSeatMeta(saveId, seatId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const index = await service.getSquadIndex(saveId);
  const entry = index.byId(meta.clubId);
  if (!entry) return Response.json({ error: "squad not found" }, { status: 404 });
  let squad = await service.getSquad(saveId, entry.leagueSlug, entry.stem);
  if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
  // A save from before the items (Etapa 34) has facilities without `items`: set up again (no migration).
  if (!squad.facilities?.items) squad = await withInitialFacilities(squad, entry.leagueSlug);
  // The workshop and its stock (craft, spec 2026-11-18): created on first read, written by the first write.
  if (!squad.facilities!.craft) squad = { ...squad, facilities: ensureCraft(squad.facilities!, squad) };
  return {
    meta, squad, ref: { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
    date: meta.currentDate ?? new Date().toISOString().slice(0, 10),
  };
}

/** Body → request; `null` when invalid. */
function parseFacilityRequest(body: unknown): FacilityRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.kind === "stand") {
    if (!STANDS.includes(b.stand as StandId) || !validSeats(b.seats)) return null;
    return { kind: "stand", stand: b.stand as StandId, seats: b.seats };
  }
  if (b.kind === "comfort" || b.kind === "training" || b.kind === "academy") return { kind: b.kind };
  if (b.kind === "repair" || b.kind === "rebuild" || b.kind === "upgrade") {
    if (!isFacilityItemId(b.item)) return null;
    if (b.kind !== "repair") return { kind: b.kind, item: b.item };
    const to = b.to;
    if (typeof to !== "number" || !Number.isInteger(to) || to % FACILITIES.REPAIR.STEP !== 0 || to <= 0 || to > 100) return null;
    return { kind: "repair", item: b.item, to };
  }
  if (b.kind === "turf") return isTurfType(b.turf) ? { kind: "turf", turf: b.turf } : null;
  return null;
}

/**
 * Repair targets offered on screen: +25, +50 (rounded up to the step) and up to 100%. A step whose
 * target is the same as the next one's (+25 and +50 both reach 100% from 75%) is `null`: the screen
 * never shows three "to 100%" chips.
 */
export function repairTargets(condition: number): { "25": number | null; "50": number | null; "100": number } {
  const step = FACILITIES.REPAIR.STEP;
  const up = (gain: number) => Math.min(100, Math.ceil((condition + gain) / step) * step);
  const t50 = up(50);
  const t25 = up(25);
  return { "25": t25 < t50 ? t25 : null, "50": t50 < 100 ? t50 : null, "100": 100 };
}

/** What a quote asks from the stock (spec 2026-11-18-club-craft): the components, what is missing, and whether it can start now. */
interface Build {
  recipe: ComponentCounts;
  missing: ComponentCounts;
  /** Components of the recipe the workshop cannot make yet (their minimum level is above the workshop's). */
  locked: ComponentId[];
  canBuild: boolean;
}

function buildOf(quote: ProjectQuote, f: ClubFacilities, revenue: number): Build {
  const recipe = recipeFor({ kind: quote.kind, ...(quote.item ? { item: quote.item } : {}) }, quote.cost, revenue);
  const missing = missingComponents(f.craft!.stock, recipe);
  const locked = (Object.keys(recipe) as ComponentId[]).filter((id) => CRAFT.RECIPES[id].minLevel > f.craft!.workshop);
  return { recipe, missing, locked, canBuild: Object.keys(missing).length === 0 };
}

/** Per-item view: level, condition, effects, works, and the quotes with the components each asks. */
function itemsView(f: ClubFacilities, date: string, revenue: number) {
  const ctx = { revenue, seatCost: 0 };
  const withForecast = (q: ProjectQuote | null) => (q ? { ...q, build: buildOf(q, f, revenue) } : null);
  return FACILITY_ITEMS.map((id: FacilityItemId) => {
    const it = f.items[id];
    const condition = conditionOf(it);
    const project = f.projects.find((p) => itemBusy({ ...f, projects: [p] }, id));
    const targets = repairTargets(condition);
    return {
      id, group: ITEM_GROUP[id], level: it.level, condition, condemned: it.condemned === true,
      quality: it.quality ?? null,
      effects: itemEffects(id, condition),
      project: project ? { ...project, progress: projectProgress(project, date) } : null,
      quotes: {
        repair: {
          "25": targets["25"] === null ? null : withForecast(quoteProject(f, { kind: "repair", item: id, to: targets["25"] }, ctx)),
          "50": targets["50"] === null ? null : withForecast(quoteProject(f, { kind: "repair", item: id, to: targets["50"] }, ctx)),
          "100": withForecast(quoteProject(f, { kind: "repair", item: id, to: 100 }, ctx)),
        },
        rebuild: withForecast(quoteProject(f, { kind: "rebuild", item: id }, ctx)),
        upgrade: withForecast(quoteProject(f, { kind: "upgrade", item: id }, ctx)),
      },
    };
  });
}

/**
 * Big-match multiplier of each home game of the human club not played yet this season (league, cup,
 * continental), by fixture id — the attendance chart. A league game against the leader uses today's
 * leader (forecast only; the gate of the day uses the leader of that day).
 */
async function importanceByFixture(h: Human): Promise<Record<string, number>> {
  const saveId = h.meta.id;
  const clubId = h.squad.id;
  const leagueSlug = h.meta.leagueSlug;
  if (!leagueSlug) return {};
  const cupSlug = await playerCupSlug(leagueSlug);
  const continentalSlug = await playerContinentalSlug(saveService, saveId, clubId);
  const slugs = [leagueSlug, cupSlug, continentalSlug].filter((x): x is string => !!x);
  const fixtures = (await Promise.all(slugs.map((slug) => saveService.getAllFixturesForLeague(saveId, slug))))
    .flat()
    .filter((f) => f.home === clubId && !f.played && !f.neutral);
  if (fixtures.length === 0) return {};
  const standings = await saveService.getLeagueStandings(saveId, leagueSlug);
  const cache = new Map<string, Promise<Squad | null>>([[clubId, Promise.resolve(h.squad)]]);
  const squadOf = (id: string) => {
    let p = cache.get(id);
    if (!p) { p = saveService.getSquadById(saveId, id); cache.set(id, p); }
    return p;
  };
  const out: Record<string, number> = {};
  for (const f of fixtures) {
    out[f.id] = (await homeMatchImportance(saveService, saveId, f, clubId, { leagueSlug, standings, squadOf })).mult;
  }
  return out;
}

async function facilitiesView(h: Human) {
  const f = h.squad.facilities!;
  const revenue = wageRevenueBasisOf(h.squad);
  const ctx = { revenue, seatCost: await seatCostFor(saveService, h.meta.id, h.meta, h.ref.leagueSlug) };
  const state = (h.meta.activeLeagues ?? []).find((l) => l.leagueSlug === h.meta.leagueSlug);
  const nextLevel = (lv: number) => Math.min(FACILITIES.MAX_LEVEL, Math.floor(lv) + 1);
  const levels = { comfort: comfortLevel(f), training: groupLevel(f, "training"), academy: groupLevel(f, "academy") };
  const own = trainingGroundEffectsOf(h.squad);
  // The academy screen shows the absolute level's effect (as before) minus what the items' condition costs.
  const academyAbs = academyEffectsAt(levels.academy);
  const academyRel = academyEffectsAt(FACILITIES.NEUTRAL_LEVEL + levels.academy - impliedLevel(h.squad));
  const academyReal = academyEffectsOf(h.squad);
  const academyNow = {
    ...academyAbs,
    qualityBonus: academyAbs.qualityBonus + academyReal.qualityBonus - academyRel.qualityBonus,
    promiseChance: academyRel.promiseChance > 0 ? academyAbs.promiseChance * (academyReal.promiseChance / academyRel.promiseChance) : academyAbs.promiseChance,
  };
  return {
    date: h.date,
    facilities: f,
    capacity: totalSeats(f),
    effectiveCapacity: effectiveCapacity(f),
    priceMult: comfortPriceMult(f),
    /** Group levels 1..5 derived from the items (fractional: the mean of the item levels / 2). */
    levels,
    /** Implied level 1..5 of the club's tier (the academy and the physio's level count against it). */
    impliedLevel: impliedLevel(h.squad),
    seatCost: ctx.seatCost,
    revenue,
    balance: h.squad.finances?.budget ?? 0,
    board: h.meta.board?.board ?? BOARD_FANS.START,
    weeklyUpkeep: weeklyUpkeep(h.squad, revenue),
    /** Groups with a works running (one at a time per group; every works built from the stock counts). */
    busyGroups: busyGroups(f),
    /** The club's share still to pay on running works (the board counts it against the balance). */
    committed: committedSpend(f),
    /** What the client needs to estimate the demand of the coming home games (`attendanceOf`). */
    demandInput: {
      followers: h.squad.finances?.followers ?? 0,
      tier: await leagueTierOf(h.ref.leagueSlug),
      fans: h.meta.board?.fans ?? BOARD_FANS.START,
    },
    season: state ? { start: state.start, end: state.end } : null,
    /** The ground as the live match draws it (tester report): its name, shape and each stand's depth by its seats. */
    stadium: { name: h.squad.venue?.name ?? null, shape: stadiumLookOf(h.squad).shape, depths: standDepths(f.stands) },
    items: itemsView(f, h.date, revenue),
    /** The workshop's stock (craft): what the works are built from. */
    stock: f.craft!.stock,
    /** Grass and mowing of the stadium pitch (spec 2026-10-16-pitch-types). */
    turf: f.items.stadiumPitch.turf ?? "natural",
    mowing: f.mowing ?? "stripes",
    /** The works to each grass (null: the current one), with what would happen if requested now. */
    turfQuotes: Object.fromEntries(TURF_TYPES.map((t) => {
      const q = quoteProject(f, { kind: "turf", turf: t }, ctx);
      return [t, q ? { ...q, build: buildOf(q, f, revenue) } : null];
    })),
    /** Big-match multiplier of each coming home game (`demandInput.importance` of that game). */
    importanceByFixture: await importanceByFixture(h),
    quotes: Object.fromEntries((["comfort", "training", "academy"] as const).map((k) => {
      const q = quoteProject(f, { kind: k }, ctx);
      return [k, q ? { ...q, build: buildOf(q, f, revenue) } : null];
    })) as Record<"comfort" | "training" | "academy", (ProjectQuote & { build: Build }) | null>,
    effects: {
      // Current: the group level with the condition of the items; next: the level the works reach.
      training: {
        current: { recoveryMult: own.recoveryMult, injuryMult: own.injuryMult, devMult: own.devMult },
        next: trainingEffectsAt(nextLevel(levels.training)),
      },
      academy: { current: academyNow, next: academyEffectsAt(nextLevel(levels.academy)) },
    },
  };
}

/**
 * Club facilities (`.claude/rules/game/facilities.md`): the state with quotes, and project requests
 * built from the workshop's stock (craft). Owner only; requests under the save lock; no club → 409 `noClub`.
 */
export const facilityRoutes = {
  "/api/saves/:saveId/facilities": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const h = await loadHuman(saveId, auth.seatId);
    if (h instanceof Response) return h;
    return Response.json(await facilitiesView(h));
  },

  /** `PUT { mowing }`: the stadium pitch's mowing pattern (drawing only; free, any time). */
  "/api/saves/:saveId/facilities/mowing": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const mowing = (body as { mowing?: unknown } | null)?.mowing;
    if (!isMowingPattern(mowing)) return Response.json({ error: "invalidRequest" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await loadHuman(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const squad = withFacilities(h.squad, { ...h.squad.facilities!, mowing });
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, squad);
      return Response.json({ mowing, view: await facilitiesView({ ...h, squad }) });
    });
  },

  /** `POST` a `FacilityRequest`: takes the recipe from the stock and starts the works, or 409 `missingComponents`. */
  "/api/saves/:saveId/facilities/request": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const request = parseFacilityRequest(body);
    if (!request) return Response.json({ error: "invalidRequest" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await loadHuman(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const f = h.squad.facilities!;
      const itemRequest = request.kind === "repair" || request.kind === "rebuild" || request.kind === "upgrade" || request.kind === "turf";
      const busyItem = request.kind === "turf" ? "stadiumPitch" : itemRequest ? request.item : null;
      if (busyItem ? itemBusy(f, busyItem) : projectRunning(f, request.kind)) {
        return Response.json({ error: "busy" }, { status: 409 });
      }
      const revenue = wageRevenueBasisOf(h.squad);
      const quote = quoteProject(f, request, { revenue, seatCost: await seatCostFor(saveService, saveId, h.meta, h.ref.leagueSlug) });
      if (!quote) {
        // An upgrade at level 10 (or a group work at 5) is `maxLevel`; any other item request that
        // cannot be quoted (target not above the condition, rebuild above 15%, repair of a
        // condemned item) is invalid.
        const maxed = request.kind === "upgrade" || !itemRequest;
        return Response.json({ error: maxed ? "maxLevel" : "invalidRequest" }, { status: 400 });
      }
      // One works at a time per group (stadium, training ground, academy) — #152.
      const group = requestGroup(request);
      if (groupBusy(f, group)) return Response.json({ error: "busy", group }, { status: 409 });
      // Built from the stock (craft): every works takes its recipe now; no board, no money.
      const b = buildOf(quote, f, revenue);
      if (!b.canBuild) return Response.json({ error: "missingComponents", missing: b.missing, locked: b.locked }, { status: 409 });
      const taken = takeComponents(f.craft!.stock, b.recipe)!;
      const quality = worksQuality(taken.taken);
      let stock = taken.stock;
      // A rebuild gives back a quarter of the recipe of the old item (common quality).
      if (quote.kind === "rebuild") {
        for (const [id, n] of Object.entries(shareOf(b.recipe, CRAFT.REBUILD_RETURN)) as [ComponentId, number][]) {
          stock = addComponents(stock, id, { common: n });
        }
      }
      const next = startCraftProject({ ...f, craft: { ...f.craft!, stock } }, quote, {
        id: `fac_${randomUUID()}`, date: h.date, components: b.recipe, quality,
      });
      const squad = withFacilities(h.squad, next);
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, squad);
      const project = next.projects.at(-1)!;
      await emitInboxMessage(saveId, buildFacilityMessage({
        date: h.date, kind: "built", facility: quote.kind, end: project.end, quality,
        ...(quote.item ? { item: quote.item } : {}), ...(quote.stand ? { stand: quote.stand, seats: quote.seats } : {}),
        ...(quote.level !== undefined ? { level: quote.level } : {}),
      }), saveService, auth.seatId);
      return Response.json({ built: true, quality, project, view: await facilitiesView({ ...h, squad }) });
    });
  },
  /** `POST { projectId }`: stops a craft works and gives back half its components (common quality). */
  "/api/saves/:saveId/facilities/cancel": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const id = (body as { projectId?: unknown } | null)?.projectId;
    if (typeof id !== "string" || id.length === 0 || id.length > 100) return Response.json({ error: "invalidRequest" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await loadHuman(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const f = h.squad.facilities!;
      // Only a works built from the stock: the old ones paid in instalments run to their end.
      const p = f.projects.find((x) => x.id === id && x.craft);
      if (!p) return Response.json({ error: "notFound" }, { status: 404 });
      const back = shareOf(p.components ?? {}, CRAFT.CANCEL_RETURN);
      let stock = f.craft!.stock;
      for (const [cid, n] of Object.entries(back) as [ComponentId, number][]) stock = addComponents(stock, cid, { common: n });
      const squad = withFacilities(h.squad, { ...f, projects: f.projects.filter((x) => x.id !== id), craft: { ...f.craft!, stock } });
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, squad);
      return Response.json({ returned: back, view: await facilitiesView({ ...h, squad }) });
    });
  },
};
