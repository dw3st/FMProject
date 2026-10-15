/**
 * Youth competitions routes (`.claude/rules/game/youth-competitions.md` → "Rotas"): the country's
 * competitions, one competition (table, results, leaders) and the human club's call-ups.
 */
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { youthCompFixtures, youthCompsOfCountry } from "@/backend/youthCompWorld";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { overallAvg } from "@/Domain/playerRating";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import {
  callUpAgeOk, callUpEligibleIds, isCallUpDuration, mergeCallUps, pruneCallUps,
  type CallUpDuration, type YouthCallUps,
} from "@/Domain/youthComps/callUps";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { YouthCompAge } from "@/types/youthCompTypes";

type Req = Request & { params: Record<string, string> };
const AGES: readonly YouthCompAge[] = ["u21", "u19"];

export interface YouthNextGame {
  slug: string;
  fixtureId: string;
  date: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
}

export interface YouthEligible {
  id: string;
  name: string;
  age: number;
  role: string;
  overall: number;
  fitness: number;
  academy: boolean;
}

/** Players who may be called up for an age: squad + academy, ≤ 19 for the under-19. */
export function eligibleForCallUp(squad: Squad, age: YouthCompAge): YouthEligible[] {
  const view = (p: RosterPlayer, academy: boolean): YouthEligible => ({
    id: p.id, name: p.name, age: p.age, role: preferredRole(p), overall: overallAvg(p),
    fitness: p.seasonLog?.fitness ?? emptySeasonLog().fitness, academy,
  });
  return [...squad.players.map((p) => view(p, false)), ...(squad.youth ?? []).map((p) => view(p, true))]
    .filter((p) => callUpAgeOk(age, p.age))
    .sort((a, b) => a.age - b.age || b.overall - a.overall || a.id.localeCompare(b.id));
}

/**
 * Validates a call-up body: per age `null` (clear) or a list of `{ id, duration }` with distinct ids of
 * the club (squad or academy, ≤ 19 for the u19), ≤ 11, and a known duration.
 */
export function parseCallUps(
  body: unknown, squad: Squad,
): { ok: true; value: Partial<Record<YouthCompAge, { id: string; duration: CallUpDuration }[] | null>> } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalidPlayers" };
  const out: Partial<Record<YouthCompAge, { id: string; duration: CallUpDuration }[] | null>> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key !== "u21" && key !== "u19") return { ok: false, error: "invalidPlayers" };
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (!Array.isArray(value) || value.length > YOUTH_COMP.MAX_CALL_UPS) return { ok: false, error: "invalidPlayers" };
    const list: { id: string; duration: CallUpDuration }[] = [];
    for (const v of value) {
      if (!v || typeof v !== "object" || typeof (v as { id?: unknown }).id !== "string") return { ok: false, error: "invalidPlayers" };
      const { id, duration } = v as { id: string; duration?: unknown };
      if (!isCallUpDuration(duration)) return { ok: false, error: "invalidDuration" };
      list.push({ id, duration });
    }
    if (new Set(list.map((c) => c.id)).size !== list.length) return { ok: false, error: "invalidPlayers" };
    const ok = callUpEligibleIds(squad, key);
    if (!list.every((c) => ok.has(c.id))) return { ok: false, error: "invalidPlayers" };
    out[key] = list;
  }
  return { ok: true, value: out };
}

async function humanSquad(saveId: string, seatId: string) {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return { meta: null, squad: null };
  if (!meta.clubId) return { meta, squad: null };
  return { meta, squad: await saveService.getSquadById(saveId, meta.clubId) };
}

/** The club's next unplayed game of each age (from today), with the opponent. */
async function nextGames(saveId: string, clubId: string, today: string, country: string) {
  const comps = await youthCompsOfCountry(saveService, saveId, country);
  const index = await saveService.getSquadIndex(saveId);
  const next: Partial<Record<YouthCompAge, YouthNextGame>> = {};
  for (const age of AGES) {
    const slug = comps[age];
    if (!slug) continue;
    const meta = (await saveService.getLeagueMeta(saveId, slug))!;
    const f = (await youthCompFixtures(saveService, saveId, meta))
      .filter((x) => !x.played && x.date >= today && (x.home === clubId || x.away === clubId))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!f) continue;
    const opp = f.home === clubId ? f.away : f.home;
    next[age] = {
      slug, fixtureId: f.id, date: f.date, opponentId: opp,
      opponentName: index.byId(opp)?.name ?? meta.youth?.teams[opp]?.name ?? opp, home: f.home === clubId,
    };
  }
  return next;
}

export const youthCompRoutes = {
  /** `{ u21, u19 }` slugs of a country (`?country=<leagueData country>`), `null` when absent. */
  "/api/saves/:saveId/youth-comps": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const country = new URL(req.url).searchParams.get("country") ?? "";
    if (!country) return Response.json({ u21: null, u19: null });
    return Response.json(await youthCompsOfCountry(saveService, saveId, country));
  },

  /** One youth competition: meta, fixtures, table, club names and leaders. */
  "/api/saves/:saveId/youth-comps/:slug": async (req: Req) => {
    const { saveId, slug } = req.params;
    const auth = requireSeat(req, saveId!);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    if (!isYouthCompSlug(slug!) || !/^u(21|19)_[a-z0-9_]+$/.test(slug!)) {
      return Response.json({ error: "not a youth competition" }, { status: 400 });
    }
    const meta = await saveService.getLeagueMeta(saveId!, slug!);
    if (!meta?.youth) return Response.json({ error: "youth competition not found" }, { status: 404 });
    const fixtures = await youthCompFixtures(saveService, saveId!, meta);
    const standings = (await saveService.getLeagueStandings(saveId!, slug!)) ?? [];
    const index = await saveService.getSquadIndex(saveId!);
    const names = Object.fromEntries(meta.youth.clubs.map((id) => [id, index.byId(id)?.name ?? meta.youth!.teams[id]?.name ?? id]));
    const leagueOf = Object.fromEntries(meta.youth.clubs.flatMap((id) => {
      const league = index.byId(id)?.leagueSlug;
      return league ? [[id, league]] : [];
    }));
    return Response.json({ meta, fixtures, standings, names, leaders: meta.youth.leaders, leagueOf });
  },

  /**
   * `GET` the human club's next youth games, call-ups (with what is left of each duration) and eligible
   * players; `PUT { u21?, u19? }` with `[{ id, duration }]` (or `null` to clear an age).
   */
  "/api/saves/:saveId/youth-callups": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      const { meta, squad } = await humanSquad(saveId, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      if (!squad) return Response.json({ error: "noClub" }, { status: 409 });
      const leagueCountry = (await (await import("@/backend/advanceDay")).getLeagueData())
        .find((l) => l.slug === meta.leagueSlug)?.country ?? "";
      const all = [...squad.players, ...(squad.youth ?? [])];
      const nameOf = (id: string) => all.find((p) => p.id === id)?.name ?? id;
      const skipped = Object.fromEntries(AGES.flatMap((age) => {
        const s = meta.youthCallUpsSkipped?.[age];
        return s ? [[age, { date: s.date, players: s.players.map((id) => ({ id, name: nameOf(id) })) }]] : [];
      }));
      return Response.json({
        next: await nextGames(saveId, meta.clubId, meta.currentDate ?? "", leagueCountry),
        callUps: Object.fromEntries(AGES.flatMap((age) => {
          const list = pruneCallUps(meta.youthCallUps?.[age] ?? [], callUpEligibleIds(squad, age));
          return list.length > 0 ? [[age, list]] : [];
        })),
        skipped,
        eligible: { u21: eligibleForCallUp(squad, "u21"), u19: eligibleForCallUp(squad, "u19") },
      });
    }
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    return withSaveLock(saveId, async () => {
      const { meta, squad } = await humanSquad(saveId, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      if (!squad) return Response.json({ error: "noClub" }, { status: 409 });
      const parsed = parseCallUps(body, squad);
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      const callUps: YouthCallUps = { ...meta.youthCallUps };
      for (const age of AGES) {
        if (!(age in parsed.value)) continue;
        const wanted = parsed.value[age];
        const merged = wanted ? mergeCallUps(callUps[age], wanted) : [];
        if (merged.length > 0) callUps[age] = merged;
        else delete callUps[age];
      }
      const updated = await saveService.updateSeat(saveId, auth.seatId, {
        youthCallUps: callUps.u21?.length || callUps.u19?.length ? callUps : undefined,
      });
      return Response.json({ callUps: updated?.youthCallUps ?? {} });
    });
  },
};
