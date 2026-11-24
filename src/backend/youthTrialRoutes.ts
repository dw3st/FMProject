import { saveService, type SeatMeta } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { recordMoney } from "@/backend/FinancialService";
import { renewalContract } from "@/Domain/contracts/contracts";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { overallAvg } from "@/Domain/playerRating";
import { getMainRole } from "@/Domain/roles";
import { uncertaintyOf } from "@/Domain/scouting/knowledge";
import { seenOverallRange } from "@/Domain/scouting/seen";
import { effectiveStars, obscureForViewer } from "@/Domain/staff/staff";
import { potentialBand } from "@/Domain/youth/potential";
import { YOUTH_TRIAL as T } from "@/Domain/youth/trialConfig";
import {
  checkTrialRequest, emptyTrials, fameMult, parseTrialRequest, seasonCount, trialCost, trialCount, trialKnowledge,
  TRIAL_SIZES, trialGemSeen, trialWindow, withScheduled,
} from "@/Domain/youth/trials";
import { YOUTH } from "@/Domain/youth/youthConfig";
import { seedFrom } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { TrialPlayerView, TrialSize, YouthTrialsState, YouthTrialsView } from "@/types/youthTrialTypes";

type Req = Request & { params: Record<string, string> };

async function human(saveId: string, seatId: string): Promise<{ meta: SeatMeta; squad: Squad; ref: { leagueSlug: string; clubSlug: string } } | Response> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const ref = await saveService.resolveSquadId(saveId, meta.clubId);
  const squad = ref ? await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
  if (!ref || !squad) return Response.json({ error: "squad not found" }, { status: 404 });
  return { meta, squad, ref };
}

async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}

async function seasonOf(saveId: string, leagueSlug: string, date: string): Promise<number> {
  return (await saveService.getLeagueMeta(saveId, leagueSlug))?.year ?? parseInt(date.slice(0, 4), 10);
}

/** A trial youngster as the club sees him: blurred by the youth coach's knowledge, ranges, a gem tag. */
export function trialPlayerView(p: RosterPlayer, squad: Squad, saveId: string, knowledge: number): TrialPlayerView {
  const noise = uncertaintyOf(knowledge);
  const seen = obscureForViewer(p, { knowledge, noise }, saveId);
  const ovr = overallAvg(seen);
  const overall = seenOverallRange(ovr, noise) ?? [ovr, ovr];
  const [lo, hi] = potentialBand(seen);
  const potential: [number, number] = [Math.max(0, lo - noise), Math.min(10, hi + noise)];
  const gem = trialGemSeen(ovr, p.age, squad, getMainRole(p.positions[0] ?? "CM"));
  return { player: seen, overall, potential, gem };
}

export function trialsView(saveId: string, meta: SeatMeta, squad: Squad, season: number): YouthTrialsView {
  const state: YouthTrialsState = meta.youthTrials ?? emptyTrials();
  const date = meta.currentDate ?? "";
  const revenue = wageRevenueBasisOf(squad);
  const stars = effectiveStars(squad, "youthCoach");
  const knowledge = trialKnowledge(stars);
  const fame = fameMult(squad.trialFame);
  const costs = {} as Record<TrialSize, number>;
  const counts = {} as Record<TrialSize, number>;
  for (const s of TRIAL_SIZES) { costs[s] = trialCost(s, revenue); counts[s] = trialCount(s, fame); }
  const results = state.results && state.results.expires >= date
    ? { ...state.results, players: state.results.players.map((p) => trialPlayerView(p, squad, saveId, knowledge)) }
    : null;
  return {
    scheduled: state.scheduled ?? null,
    results,
    costs, counts,
    left: Math.max(0, T.PER_SEASON - seasonCount(state, String(season))),
    perSeason: T.PER_SEASON,
    window: trialWindow(date),
    academy: { size: (squad.youth ?? []).length, max: YOUTH.MAX_SIZE },
    reveals: meta.trialReveals ?? { count: 0, top: 0 },
    fame,
  };
}

export const youthTrialRoutes = {
  /** `GET` the club's trials; `POST { age, size, date }` schedules one (paid now). */
  "/api/saves/:saveId/youth/trials": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      const h = await human(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const date = h.meta.currentDate ?? "";
      return Response.json(trialsView(saveId, h.meta, h.squad, await seasonOf(saveId, h.ref.leagueSlug, date)));
    }
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    return withSaveLock(saveId, async () => {
      const h = await human(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const request = parseTrialRequest(body);
      if (!request) return Response.json({ error: "invalidTrial" }, { status: 400 });
      const date = h.meta.currentDate ?? "";
      const season = await seasonOf(saveId, h.ref.leagueSlug, date);
      const refusal = checkTrialRequest(request, { today: date, state: h.meta.youthTrials, season: String(season) });
      if (refusal) return Response.json({ error: refusal }, { status: refusal === "invalidTrial" ? 400 : 409 });
      const cost = trialCost(request.size, wageRevenueBasisOf(h.squad));
      const id = `trial_${seedFrom(`${saveId}:${auth.seatId}:${date}:${request.date}`).toString(36)}`;
      const state = withScheduled(h.meta.youthTrials, { id, date: request.date, age: request.age, size: request.size, cost, scheduledOn: date }, String(season));
      await saveService.updateSeat(saveId, auth.seatId, { youthTrials: state });
      if (cost > 0) {
        await recordMoney(saveService, saveId, season, h.ref, {
          date, kind: "scouting", amount: -cost, label: "Youth trial", ref: { stage: "trial" },
        }, auth.seatId);
      }
      const squad = (await saveService.getSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug)) ?? h.squad;
      return Response.json(trialsView(saveId, { ...h.meta, youthTrials: state }, squad, season));
    });
  },

  /** `DELETE` cancels a scheduled trial before its day (the money and the season's slot are not given back). */
  "/api/saves/:saveId/youth/trials/:trialId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "DELETE") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const h = await human(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const state = h.meta.youthTrials;
      if (!state?.scheduled || state.scheduled.id !== req.params.trialId) return Response.json({ error: "notFound" }, { status: 404 });
      const { scheduled: _s, ...rest } = state;
      await saveService.updateSeat(saveId, auth.seatId, { youthTrials: rest });
      const date = h.meta.currentDate ?? "";
      return Response.json(trialsView(saveId, { ...h.meta, youthTrials: rest }, h.squad, await seasonOf(saveId, h.ref.leagueSlug, date)));
    });
  },

  /** `POST { ids }` signs trial youngsters into the academy, free, with the academy contract. */
  "/api/saves/:saveId/youth/trials/sign": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await readJson(req)) as { ids?: unknown } | null;
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > T.SIGN_MAX || !ids.every((i) => typeof i === "string")) {
      return Response.json({ error: "invalidPlayers" }, { status: 400 });
    }
    return withSaveLock(saveId, async () => {
      const h = await human(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const date = h.meta.currentDate ?? "";
      const results = h.meta.youthTrials?.results;
      if (!results || results.expires < date) return Response.json({ error: "offerClosed" }, { status: 409 });
      const wanted = new Set(ids as string[]);
      const picked = results.players.filter((p) => wanted.has(p.id));
      if (picked.length !== wanted.size) return Response.json({ error: "invalidPlayers" }, { status: 400 });
      const youth = h.squad.youth ?? [];
      const room = Math.max(0, YOUTH.MAX_SIZE - youth.length);
      const signed = picked.slice(0, room);
      const full = picked.slice(room).map((p) => p.id);
      const seasonEnd = h.meta.activeLeagues?.find((l) => l.leagueSlug === h.ref.leagueSlug)?.end ?? date;
      const added: RosterPlayer[] = signed.map((p) => ({
        ...p,
        squadId: h.squad.id,
        academyOf: h.squad.id,
        contract: renewalContract(p, h.squad, seasonEnd, YOUTH.CONTRACT_YEARS),
        trialOf: { clubId: h.squad.id, clubName: h.squad.name, date: results.date, seatId: auth.seatId },
      }));
      if (added.length > 0) await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, { ...h.squad, youth: [...youth, ...added] });
      const signedIds = new Set(added.map((p) => p.id));
      const state: YouthTrialsState = { ...h.meta.youthTrials!, results: { ...results, players: results.players.filter((p) => !signedIds.has(p.id)) } };
      await saveService.updateSeat(saveId, auth.seatId, { youthTrials: state });
      const squad = (await saveService.getSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug)) ?? h.squad;
      return Response.json({
        signed: added.map((p) => p.id), youthFull: full,
        view: trialsView(saveId, { ...h.meta, youthTrials: state }, squad, await seasonOf(saveId, h.ref.leagueSlug, date)),
      });
    });
  },
};
