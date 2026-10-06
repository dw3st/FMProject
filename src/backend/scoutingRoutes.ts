import { randomUUID } from "crypto";
import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { recordMoney } from "@/backend/FinancialService";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import {
  continentOf, loadViewer, missionDistance, missionLeagues, viewFor,
} from "@/backend/scoutingWorld";
import { SCOUTING as S } from "@/Domain/scouting/scoutingConfig";
import { allowedWeeks, missionCost, seenProfile } from "@/Domain/scouting/missions";
import { scoutMultipliersOf } from "@/Domain/scouting/knowledge";
import { buildScoutingMessage } from "@/Domain/scouting/scoutingMessages";
import { effectiveRating, fieldScoutMarket, staffWeeklyWage, weekStartOf } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import { wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import { renewalContract } from "@/Domain/contracts/contracts";
import { YOUTH } from "@/Domain/youth/youthConfig";
import { daysBetween } from "@/Domain/dates";
import type { SaveMeta } from "@/backend/SaveService";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type {
  ScoutAssignment, ScoutFocus, ScoutProspect, ScoutTarget, ScoutTargetKind, ScoutingState, ShortlistEntry,
} from "@/types/scoutingTypes";
import countriesRaw from "@/Data/countries.json";

type Req = Request & { params: Record<string, string> };

const TARGET_KINDS: ScoutTargetKind[] = ["country", "league", "continent", "player", "youth"];
const LINES = ["GK", "Defender", "Midfielder", "Forward"] as const;
const CONTINENTS = new Set(Object.values(countriesRaw as Record<string, { continent?: string }>).map((c) => c.continent).filter(Boolean));

async function human(saveId: string): Promise<{ meta: SaveMeta; squad: Squad; ref: { leagueSlug: string; clubSlug: string } } | Response> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const ref = await saveService.resolveSquadId(saveId, meta.clubId);
  const squad = ref ? await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
  if (!ref || !squad) return Response.json({ error: "squad not found" }, { status: 404 });
  return { meta, squad, ref };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The scouts that can lead a mission: the chief (vacant: rating 3) and the field scouts. */
function scoutsOf(squad: Squad | null): { id: string; name: string; rating: number; chief: boolean; vacant?: boolean }[] {
  if (!squad) return [];
  const chief = squad.staff?.scout;
  return [
    { id: "chief", name: chief?.name ?? "", rating: effectiveRating(squad, "scout"), chief: true, ...(chief ? {} : { vacant: true }) },
    ...(squad.staff?.scouts ?? []).map((s) => ({ id: s.id, name: s.name, rating: s.rating, chief: false })),
  ];
}

async function findPlayer(saveId: string, playerId: string, squadId: string | undefined): Promise<{ player: RosterPlayer; squad: Squad | null } | null> {
  if (squadId) {
    const sq = await saveService.getSquadById(saveId, squadId);
    const p = sq?.players.find((x) => x.id === playerId);
    if (sq && p) return { player: p, squad: sq };
  }
  const free = (await saveService.getFreeAgents(saveId)).find((f) => f.player.id === playerId);
  return free ? { player: free.player, squad: null } : null;
}

/** Validates a mission target against the save's world; `null` = invalid. */
async function validTarget(saveId: string, raw: unknown, ownClubId: string): Promise<ScoutTarget | null> {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const kind = t.kind as ScoutTargetKind;
  if (!TARGET_KINDS.includes(kind)) return null;
  const { getLeagueData } = await import("@/backend/advanceDay");
  const leagues = await getLeagueData();
  if (kind === "country" || kind === "youth") {
    if (typeof t.country !== "string" || !leagues.some((l) => l.country === t.country)) return null;
    return { kind, country: t.country };
  }
  if (kind === "league") {
    if (typeof t.league !== "string" || !(await saveService.getSquadIndex(saveId)).leagues().includes(t.league)) return null;
    return { kind, league: t.league };
  }
  if (kind === "continent") {
    if (typeof t.continent !== "string" || !CONTINENTS.has(t.continent)) return null;
    return { kind, continent: t.continent };
  }
  if (typeof t.playerId !== "string") return null;
  const found = await findPlayer(saveId, t.playerId, typeof t.squadId === "string" ? t.squadId : undefined);
  if (!found) return null;
  // The club's own players (and those it loaned out) are already fully known.
  if (found.squad?.id === ownClubId || found.player.loan?.fromClubId === ownClubId) return null;
  return { kind, playerId: found.player.id, playerName: found.player.name, squadId: found.squad?.id ?? "" };
}

function validFocus(raw: unknown): ScoutFocus | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const out: ScoutFocus = {};
  if (f.line !== undefined) {
    if (!LINES.includes(f.line as (typeof LINES)[number])) return null;
    out.line = f.line as ScoutFocus["line"];
  }
  if (f.maxAge !== undefined) {
    if (typeof f.maxAge !== "number" || f.maxAge < 15 || f.maxAge > 40) return null;
    out.maxAge = Math.round(f.maxAge);
  }
  if (f.improves !== undefined) out.improves = f.improves === true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The screen's view of the scouting department. */
async function scoutingView(saveId: string, state: ScoutingState) {
  const meta = await saveService.getMeta(saveId);
  const own = meta?.clubId ? await saveService.getSquadById(saveId, meta.clubId) : null;
  const viewer = await loadViewer(saveService, saveId);
  const ownCountry = viewer?.ownCountry ?? "";
  const revenue = own ? wageRevenueBasisOf(own) : 0;
  const scouts = scoutsOf(own);
  const missions = await Promise.all(state.missions.map(async (m) => ({
    ...m,
    weeklyCost: own ? missionCost(m.target.kind, await missionDistance(saveService, saveId, m, ownCountry), revenue) : 0,
    scout: scouts.find((s) => s.id === m.scoutId) ?? null,
  })));
  const index = await saveService.getSquadIndex(saveId);
  const market = await saveService.getMarket(saveId);
  const forSale = new Set<string>([
    ...Object.values(market?.profiles ?? {}).flatMap((p) => (p.sellList ?? []).map((c) => c.playerId)),
    ...(market?.playerSellList ?? []).map((c) => c.playerId),
  ]);
  const date = meta?.currentDate ?? "";
  const chief = scoutMultipliersOf(own ? effectiveRating(own, "scout") : STAFF.VACANT_RATING);
  const shortlist = await Promise.all(state.shortlist.map(async (e: ShortlistEntry) => {
    const found = await findPlayer(saveId, e.playerId, e.squadId);
    if (!found || !viewer) return { ...e, missing: true };
    const league = found.squad ? (index.byId(found.squad.id)?.leagueSlug ?? "") : "";
    const view = viewFor(viewer, found.player, league);
    const seen = seenProfile(found.player, view.knowledge, { saveId, chief, ownWageFactor: own ? wageFactorOf(own) : 1 });
    return {
      ...e,
      club: found.squad?.name ?? "",
      leagueSlug: league,
      clubSlug: found.squad ? (index.byId(found.squad.id)?.stem ?? found.squad.id) : "",
      age: found.player.age,
      position: found.player.positions[0] ?? "—",
      knowledge: view.knowledge,
      overall: seen.overall,
      value: seen.value,
      forSale: forSale.has(e.playerId),
      contractUntil: found.player.contract?.until ?? null,
      contractEnding: !!found.player.contract && daysBetween(date, found.player.contract.until) <= S.CONTRACT_ENDING_DAYS,
      injured: !!found.player.injury && found.player.injury.returnDate > date,
      free: !found.squad,
    };
  }));
  return {
    employed: !!own,
    date,
    ownCountry,
    ownContinent: continentOf(ownCountry) ?? null,
    maxFieldScouts: S.MAX_FIELD_SCOUTS,
    maxShortlist: S.MAX_SHORTLIST,
    weeks: { region: S.REGION_WEEKS, continent: S.CONTINENT_WEEKS, youth: S.YOUTH_WEEKS, player: S.PLAYER_MAX_WEEKS },
    scouts: scouts.map((s) => ({ ...s, busy: state.missions.some((m) => m.scoutId === s.id) })),
    missions,
    reports: state.reports,
    shortlist,
    // Only what the card shows: the exact attributes stay on the server (the report carries the
    // seen ranges); the player is exact once he is in the academy.
    prospects: state.prospects.map(prospectView),
  };
}

/** A prospect as the screen sees him: identity only, never his exact attributes. */
export function prospectView(p: ScoutProspect) {
  const { player } = p;
  return {
    player: { id: player.id, name: player.name, age: player.age, positions: player.positions, nationality: player.nationality },
    country: p.country,
    expires: p.expires,
    reportId: p.reportId,
    fee: p.fee,
  };
}

/**
 * Scouting department (`.claude/rules/game/scouting.md`): missions, shortlist, prospects, field
 * scouts. Owner only; writes under the save lock; no club → 409 `noClub` (the reports and the
 * shortlist stay readable).
 */
export const scoutingRoutes = {
  "/api/saves/:saveId/scouting": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    return Response.json(await scoutingView(saveId, await saveService.getScouting(saveId)));
  },

  /** `POST { scoutId, target, focus?, weeks }` - a new mission (400 `invalidTarget`/`invalidWeeks`, 409 `scoutBusy`). */
  "/api/saves/:saveId/scouting/missions": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    if (!body) return Response.json({ error: "invalid body" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await human(saveId);
      if (h instanceof Response) return h;
      const target = await validTarget(saveId, body.target, h.squad.id);
      if (!target) return Response.json({ error: "invalidTarget" }, { status: 400 });
      const focus = validFocus(body.focus);
      if (focus === null) return Response.json({ error: "invalidFocus" }, { status: 400 });
      const weeks = body.weeks;
      if (typeof weeks !== "number" || !allowedWeeks(target.kind).includes(weeks)) {
        return Response.json({ error: "invalidWeeks" }, { status: 400 });
      }
      const scoutId = typeof body.scoutId === "string" ? body.scoutId : "";
      if (!scoutsOf(h.squad).some((s) => s.id === scoutId)) return Response.json({ error: "scout not found" }, { status: 404 });
      if (target.kind !== "player" && (await missionLeagues(saveService, saveId, { target })).length === 0) {
        return Response.json({ error: "invalidTarget" }, { status: 400 });
      }
      const state = await saveService.getScouting(saveId);
      if (state.missions.some((m) => m.scoutId === scoutId)) return Response.json({ error: "scoutBusy" }, { status: 409 });
      const mission: ScoutAssignment = {
        id: `mis_${randomUUID().slice(0, 8)}`, scoutId, target, ...(focus && target.kind !== "player" ? { focus } : {}),
        start: h.meta.currentDate ?? "", weeks, weeksDone: 0, observed: 0,
      };
      const next = { ...state, missions: [...state.missions, mission] };
      await saveService.writeScouting(saveId, next);
      return Response.json(await scoutingView(saveId, next));
    });
  },

  /** `DELETE` - cancels a mission (the weeks already paid do not come back). */
  "/api/saves/:saveId/scouting/missions/:missionId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "DELETE") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const state = await saveService.getScouting(saveId);
      if (!state.missions.some((m) => m.id === req.params.missionId)) return Response.json({ error: "mission not found" }, { status: 404 });
      const next = { ...state, missions: state.missions.filter((m) => m.id !== req.params.missionId) };
      await saveService.writeScouting(saveId, next);
      return Response.json(await scoutingView(saveId, next));
    });
  },

  /** `POST { playerId, squadId?, note? }` - adds (or re-notes) a player on the shortlist (409 `shortlistFull`). */
  "/api/saves/:saveId/scouting/shortlist": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    if (!body || typeof body.playerId !== "string") return Response.json({ error: "invalid body" }, { status: 400 });
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : undefined;
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const found = await findPlayer(saveId, body.playerId as string, typeof body.squadId === "string" ? body.squadId : undefined);
      if (!found) return Response.json({ error: "player not found" }, { status: 404 });
      const state = await saveService.getScouting(saveId);
      const existing = state.shortlist.find((e) => e.playerId === found.player.id);
      let shortlist: ShortlistEntry[];
      if (existing) {
        shortlist = state.shortlist.map((e) => (e.playerId === found.player.id ? { ...e, ...(note !== undefined ? { note } : {}) } : e));
      } else {
        if (state.shortlist.length >= S.MAX_SHORTLIST) return Response.json({ error: "shortlistFull" }, { status: 409 });
        shortlist = [...state.shortlist, {
          playerId: found.player.id, name: found.player.name, squadId: found.squad?.id ?? "",
          addedOn: meta.currentDate ?? "", ...(note ? { note } : {}),
        }];
      }
      const next = { ...state, shortlist };
      await saveService.writeScouting(saveId, next);
      return Response.json({ shortlist: next.shortlist });
    });
  },

  "/api/saves/:saveId/scouting/shortlist/:playerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "DELETE") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const state = await saveService.getScouting(saveId);
      const next = { ...state, shortlist: state.shortlist.filter((e) => e.playerId !== req.params.playerId) };
      await saveService.writeScouting(saveId, next);
      return Response.json({ shortlist: next.shortlist });
    });
  },

  /** `POST` - signs a prospect into the academy (400 `youthFull`, 409 `offerClosed`); training compensation in the ledger. */
  "/api/saves/:saveId/scouting/prospects/:prospectId/sign": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const h = await human(saveId);
      if (h instanceof Response) return h;
      const date = h.meta.currentDate ?? "";
      const state = await saveService.getScouting(saveId);
      const prospect = state.prospects.find((p) => p.player.id === req.params.prospectId);
      if (!prospect || prospect.expires < date) return Response.json({ error: "offerClosed" }, { status: 409 });
      if ((h.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return Response.json({ error: "youthFull" }, { status: 400 });
      const seasonEnd = h.meta.activeLeagues?.find((l) => l.leagueSlug === h.ref.leagueSlug)?.end ?? date;
      const player: RosterPlayer = {
        ...prospect.player,
        squadId: h.squad.id,
        contract: renewalContract(prospect.player, h.squad, seasonEnd, YOUTH.CONTRACT_YEARS),
      };
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, { ...h.squad, youth: [...(h.squad.youth ?? []), player] });
      if (prospect.fee > 0) {
        const season = (await saveService.getLeagueMeta(saveId, h.ref.leagueSlug))?.year ?? parseInt(date.slice(0, 4), 10);
        await recordMoney(saveService, saveId, season, h.ref, {
          date, kind: "scouting", amount: -prospect.fee, label: `Training compensation: ${player.name}`,
          ref: { stage: "prospect", playerName: player.name, playerId: player.id, competition: prospect.country },
        });
      }
      const knowledge = { ...state.knowledge };
      delete knowledge[player.id];
      const next: ScoutingState = { ...state, knowledge, prospects: state.prospects.filter((p) => p.player.id !== player.id) };
      await saveService.writeScouting(saveId, next);
      await emitInboxMessage(saveId, buildScoutingMessage({
        date, kind: "prospect_signed", playerId: player.id, playerName: player.name, fee: prospect.fee, clubName: prospect.country,
      }), saveService);
      return Response.json(await scoutingView(saveId, next));
    });
  },

  // ── Field scouts (staff market) ────────────────────────────────────────────

  "/api/saves/:saveId/staff/scouts/market": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const h = await human(saveId);
    if (h instanceof Response) return h;
    const date = h.meta.currentDate ?? new Date().toISOString().slice(0, 10);
    const hired = new Set((h.squad.staff?.scouts ?? []).map((s) => s.id));
    return Response.json({
      week: weekStartOf(date),
      candidates: fieldScoutMarket(saveId, date, wageFactorOf(h.squad)).filter((c) => !hired.has(c.id)),
      scouts: (h.squad.staff?.scouts ?? []).map((s) => ({ ...s, wage: staffWeeklyWage(s.rating, wageFactorOf(h.squad)) })),
      max: S.MAX_FIELD_SCOUTS,
    });
  },

  /** `POST { candidateId }` - hires a field scout of this week's market (409 `scoutsFull` past the limit). */
  "/api/saves/:saveId/staff/scouts/hire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    if (!body || typeof body.candidateId !== "string") return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await human(saveId);
      if (h instanceof Response) return h;
      const scouts = h.squad.staff?.scouts ?? [];
      if (scouts.length >= S.MAX_FIELD_SCOUTS) return Response.json({ error: "scoutsFull" }, { status: 409 });
      const date = h.meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const candidate = fieldScoutMarket(saveId, date, wageFactorOf(h.squad)).find((c) => c.id === body.candidateId);
      if (!candidate || scouts.some((s) => s.id === candidate.id)) return Response.json({ error: "candidate not found" }, { status: 404 });
      const next: Squad = { ...h.squad, staff: { ...(h.squad.staff ?? {}), scouts: [...scouts, candidate] } };
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, next);
      return Response.json({ scouts: next.staff!.scouts });
    });
  },

  /** `POST { scoutId }` - dismisses a field scout; his mission is cancelled. */
  "/api/saves/:saveId/staff/scouts/fire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    if (!body || typeof body.scoutId !== "string") return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await human(saveId);
      if (h instanceof Response) return h;
      const scouts = h.squad.staff?.scouts ?? [];
      if (!scouts.some((s) => s.id === body.scoutId)) return Response.json({ error: "scout not found" }, { status: 404 });
      const next: Squad = { ...h.squad, staff: { ...(h.squad.staff ?? {}), scouts: scouts.filter((s) => s.id !== body.scoutId) } };
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, next);
      const state = await saveService.getScouting(saveId);
      if (state.missions.some((m) => m.scoutId === body.scoutId)) {
        await saveService.writeScouting(saveId, { ...state, missions: state.missions.filter((m) => m.scoutId !== body.scoutId) });
      }
      return Response.json({ scouts: next.staff!.scouts });
    });
  },

  /** `GET` - one player as the user sees him (knowledge, last observation, latest report). */
  "/api/saves/:saveId/scouting/player/:playerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const squadId = new URL(req.url).searchParams.get("squad") ?? undefined;
    const found = await findPlayer(saveId, req.params.playerId!, squadId);
    if (!found) return Response.json({ error: "player not found" }, { status: 404 });
    const viewer = await loadViewer(saveService, saveId);
    if (!viewer) return Response.json({ error: "save not found" }, { status: 404 });
    const league = found.squad ? ((await saveService.getSquadIndex(saveId)).byId(found.squad.id)?.leagueSlug ?? "") : "";
    const state = await saveService.getScouting(saveId);
    return Response.json({
      view: viewFor(viewer, found.player, league),
      report: state.reports.find((r) => r.playerId === found.player.id) ?? null,
      shortlisted: state.shortlist.some((e) => e.playerId === found.player.id),
      mission: state.missions.find((m) => m.target.kind === "player" && m.target.playerId === found.player.id) ?? null,
    });
  },
};
