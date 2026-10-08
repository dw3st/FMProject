import { randomUUID } from "node:crypto";
import { SaveService, saveService, type SaveMeta } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { recordMoney } from "@/backend/FinancialService";
import { logError } from "@/Logger";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { leagueTierOf, seatCostFor, withInitialFacilities } from "@/backend/facilityWorld";
import {
  academyEffectsAt, academyEffectsOf, boardDecision, impliedLevel, comfortPriceMult, committedSpend, effectiveCapacity, itemBusy,
  payRepairNow, projectProgress, projectRunning, quoteProject, startProject, totalSeats, trainingEffectsAt, trainingGroundEffectsOf,
  validSeats, weeklyUpkeep, withFacilities, type ProjectQuote,
} from "@/Domain/facilities/facilities";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import {
  FACILITY_ITEMS, ITEM_GROUP, comfortLevel, conditionOf, groupLevel, isFacilityItemId, itemEffects,
} from "@/Domain/facilities/facilityItems";
import { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import type { ClubFacilities, FacilityItemId, FacilityRequest, StandId } from "@/types/facilityTypes";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

const STANDS: readonly StandId[] = ["north", "south", "east", "west"];

interface Human {
  meta: SaveMeta;
  squad: Squad;
  ref: { leagueSlug: string; clubSlug: string };
  date: string;
}

/** The human club (with facilities set up if missing), or 409 `noClub` when unemployed. */
async function loadHuman(saveId: string, service: SaveService = saveService): Promise<Human | Response> {
  const meta = await service.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const index = await service.getSquadIndex(saveId);
  const entry = index.byId(meta.clubId);
  if (!entry) return Response.json({ error: "squad not found" }, { status: 404 });
  let squad = await service.getSquad(saveId, entry.leagueSlug, entry.stem);
  if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
  // A save from before the items (Etapa 34) has facilities without `items`: set up again (no migration).
  if (!squad.facilities?.items) squad = await withInitialFacilities(squad, entry.leagueSlug);
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
  return null;
}

/** Repair targets offered on screen: +25, +50 (rounded up to the step) and up to 100%. */
export function repairTargets(condition: number): { "25": number; "50": number; "100": number } {
  const step = FACILITIES.REPAIR.STEP;
  const up = (gain: number) => Math.min(100, Math.ceil((condition + gain) / step) * step);
  return { "25": up(25), "50": up(50), "100": 100 };
}

interface MoneyContext { board: number; balance: number; revenue: number; committed: number }

interface Forecast {
  /** Small repair: paid now by the club (no board). */
  paidByClub: boolean;
  approved: boolean;
  boardShare?: number;
  reason?: string;
}

/** What happens to a quote if requested now: paid by the club (small repair) or the board's decision. */
function forecast(quote: ProjectQuote, args: MoneyContext): Forecast {
  if (quote.small) {
    return args.balance - args.committed >= quote.cost
      ? { paidByClub: true, approved: true }
      : { paidByClub: true, approved: false, reason: "no_money" };
  }
  const d = boardDecision({ ...args, cost: quote.cost });
  return d.approved
    ? { paidByClub: false, approved: true, boardShare: d.boardShare }
    : { paidByClub: false, approved: false, reason: d.reason };
}

/** Per-item view: level, condition, effects, works, and the quotes with what would happen. */
function itemsView(f: ClubFacilities, date: string, money: MoneyContext) {
  const ctx = { revenue: money.revenue, seatCost: 0 };
  const withForecast = (q: ProjectQuote | null) => (q ? { ...q, forecast: forecast(q, money) } : null);
  return FACILITY_ITEMS.map((id: FacilityItemId) => {
    const it = f.items[id];
    const condition = conditionOf(it);
    const project = f.projects.find((p) => itemBusy({ ...f, projects: [p] }, id));
    const targets = repairTargets(condition);
    return {
      id, group: ITEM_GROUP[id], level: it.level, condition, condemned: it.condemned === true,
      effects: itemEffects(id, condition),
      project: project ? { ...project, progress: projectProgress(project, date) } : null,
      quotes: {
        repair: {
          "25": withForecast(quoteProject(f, { kind: "repair", item: id, to: targets["25"] }, ctx)),
          "50": withForecast(quoteProject(f, { kind: "repair", item: id, to: targets["50"] }, ctx)),
          "100": withForecast(quoteProject(f, { kind: "repair", item: id, to: 100 }, ctx)),
        },
        rebuild: withForecast(quoteProject(f, { kind: "rebuild", item: id }, ctx)),
        upgrade: withForecast(quoteProject(f, { kind: "upgrade", item: id }, ctx)),
      },
    };
  });
}

/**
 * A small repair in its own buffered unit (squad and ledger line written together), flushed only
 * when the answer is ok.
 */
async function inUnit(saveId: string, fn: (service: SaveService) => Promise<Response>): Promise<Response> {
  const buffer = new BufferingSaveDAL(new FileSystemDAL());
  const service = new SaveService(buffer);
  try {
    const res = await fn(service);
    if (res.ok) await buffer.flush();
    return res;
  } catch (err) {
    logError("facilities", `save ${saveId}: failed to pay a repair`, err);
    return Response.json({ error: "failed to pay a repair" }, { status: 500 });
  }
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
    seatCost: ctx.seatCost,
    revenue,
    balance: h.squad.finances?.budget ?? 0,
    board: h.meta.board?.board ?? BOARD_FANS.START,
    weeklyUpkeep: weeklyUpkeep(h.squad, revenue),
    /** The club's share still to pay on running works (the board counts it against the balance). */
    committed: committedSpend(f),
    /** What the client needs to estimate the demand of the coming home games (`attendanceOf`). */
    demandInput: {
      followers: h.squad.finances?.followers ?? 0,
      tier: await leagueTierOf(h.ref.leagueSlug),
      fans: h.meta.board?.fans ?? BOARD_FANS.START,
    },
    season: state ? { start: state.start, end: state.end } : null,
    items: itemsView(f, h.date, {
      board: h.meta.board?.board ?? BOARD_FANS.START, balance: h.squad.finances?.budget ?? 0, revenue, committed: committedSpend(f),
    }),
    quotes: {
      comfort: quoteProject(f, { kind: "comfort" }, ctx),
      training: quoteProject(f, { kind: "training" }, ctx),
      academy: quoteProject(f, { kind: "academy" }, ctx),
    },
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
 * the board decides. Owner only; requests under the save lock; no club → 409 `noClub`.
 */
export const facilityRoutes = {
  "/api/saves/:saveId/facilities": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const h = await loadHuman(saveId);
    if (h instanceof Response) return h;
    return Response.json(await facilitiesView(h));
  },

  /** `POST` a `FacilityRequest`: the board approves (project started) or refuses (reason). */
  "/api/saves/:saveId/facilities/request": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const request = parseFacilityRequest(body);
    if (!request) return Response.json({ error: "invalidRequest" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await loadHuman(saveId);
      if (h instanceof Response) return h;
      const f = h.squad.facilities!;
      const itemRequest = request.kind === "repair" || request.kind === "rebuild" || request.kind === "upgrade";
      if (itemRequest ? itemBusy(f, request.item) : projectRunning(f, request.kind)) {
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
      // Small repair (at most 2% of the annual revenue): paid now from the balance, no board.
      if (quote.small) {
        if ((h.squad.finances?.budget ?? 0) - committedSpend(f) < quote.cost) {
          return Response.json({ approved: false, reason: "no_money", view: await facilitiesView(h) });
        }
        return inUnit(saveId, async (service) => {
          const paid = payRepairNow(f, quote, { id: `fac_${randomUUID()}`, date: h.date });
          await service.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, withFacilities(h.squad, paid.facilities));
          const season = (await service.getLeagueMeta(saveId, h.meta.leagueSlug))?.year ?? parseInt(h.date.slice(0, 4), 10);
          const squad = await recordMoney(service, saveId, season, h.ref, paid.entry);
          const project = paid.facilities.projects.at(-1)!;
          return Response.json({ approved: true, paidByClub: true, boardShare: 0, project, view: await facilitiesView({ ...h, squad }) });
        });
      }
      const decision = boardDecision({
        board: h.meta.board?.board ?? BOARD_FANS.START, balance: h.squad.finances?.budget ?? 0, cost: quote.cost, revenue,
        committed: committedSpend(f),
      });
      const what = {
        facility: quote.kind, cost: quote.cost,
        ...(quote.stand ? { stand: quote.stand, seats: quote.seats } : {}),
        ...(quote.level !== undefined ? { level: quote.level } : {}),
        ...(quote.item ? { item: quote.item } : {}),
      };
      // A refusal is answered on screen only (no inbox line: the request was just made).
      if (!decision.approved) {
        return Response.json({ approved: false, reason: decision.reason, view: await facilitiesView(h) });
      }
      const next = startProject(f, quote, { id: `fac_${randomUUID()}`, date: h.date, boardShare: decision.boardShare });
      const squad = withFacilities(h.squad, next);
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, squad);
      const project = next.projects.at(-1)!;
      await emitInboxMessage(saveId, buildFacilityMessage({
        date: h.date, kind: "approved", ...what, boardShare: decision.boardShare, end: project.end,
      }), saveService);
      return Response.json({ approved: true, boardShare: decision.boardShare, project, view: await facilitiesView({ ...h, squad }) });
    });
  },
};
