import { randomUUID } from "node:crypto";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { leagueTierOf, seatCostFor, withInitialFacilities } from "@/backend/facilityWorld";
import {
  academyEffectsAt, boardDecision, comfortPriceMult, committedSpend, effectiveCapacity, projectRunning, quoteProject,
  startProject, totalSeats, trainingEffectsAt, validSeats, weeklyUpkeep, withFacilities,
} from "@/Domain/facilities/facilities";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import type { FacilityRequest, StandId } from "@/types/facilityTypes";
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
async function loadHuman(saveId: string): Promise<Human | Response> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const index = await saveService.getSquadIndex(saveId);
  const entry = index.byId(meta.clubId);
  if (!entry) return Response.json({ error: "squad not found" }, { status: 404 });
  let squad = await saveService.getSquad(saveId, entry.leagueSlug, entry.stem);
  if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
  if (!squad.facilities) squad = await withInitialFacilities(squad, entry.leagueSlug);
  return {
    meta, squad, ref: { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
    date: meta.currentDate ?? new Date().toISOString().slice(0, 10),
  };
}

/** Body → request; `null` when invalid. */
export function parseFacilityRequest(body: unknown): FacilityRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.kind === "stand") {
    if (!STANDS.includes(b.stand as StandId) || !validSeats(b.seats)) return null;
    return { kind: "stand", stand: b.stand as StandId, seats: b.seats };
  }
  if (b.kind === "comfort" || b.kind === "training" || b.kind === "academy") return { kind: b.kind };
  return null;
}

async function facilitiesView(h: Human) {
  const f = h.squad.facilities!;
  const revenue = wageRevenueBasisOf(h.squad);
  const ctx = { revenue, seatCost: await seatCostFor(saveService, h.meta.id, h.meta, h.ref.leagueSlug) };
  const state = (h.meta.activeLeagues ?? []).find((l) => l.leagueSlug === h.meta.leagueSlug);
  const nextLevel = (lv: number) => Math.min(FACILITIES.MAX_LEVEL, lv + 1);
  return {
    date: h.date,
    facilities: f,
    capacity: totalSeats(f),
    effectiveCapacity: effectiveCapacity(f),
    priceMult: comfortPriceMult(f.comfort),
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
    quotes: {
      comfort: quoteProject(f, { kind: "comfort" }, ctx),
      training: quoteProject(f, { kind: "training" }, ctx),
      academy: quoteProject(f, { kind: "academy" }, ctx),
    },
    effects: {
      training: { current: trainingEffectsAt(f.training), next: trainingEffectsAt(nextLevel(f.training)) },
      academy: { current: academyEffectsAt(f.academy), next: academyEffectsAt(nextLevel(f.academy)) },
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
      if (projectRunning(f, request.kind)) return Response.json({ error: "busy" }, { status: 409 });
      const revenue = wageRevenueBasisOf(h.squad);
      const quote = quoteProject(f, request, { revenue, seatCost: await seatCostFor(saveService, saveId, h.meta, h.ref.leagueSlug) });
      if (!quote) return Response.json({ error: "maxLevel" }, { status: 400 });
      const decision = boardDecision({
        board: h.meta.board?.board ?? BOARD_FANS.START, balance: h.squad.finances?.budget ?? 0, cost: quote.cost, revenue,
        committed: committedSpend(f),
      });
      const what = {
        facility: quote.kind, cost: quote.cost,
        ...(quote.stand ? { stand: quote.stand, seats: quote.seats } : {}),
        ...(quote.level !== undefined ? { level: quote.level } : {}),
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
