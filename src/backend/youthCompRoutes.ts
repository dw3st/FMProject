/**
 * Youth competitions routes (`.claude/rules/game/youth-competitions.md` → "Rotas"): the country's
 * competitions, one competition (table, results, leaders) and the human club's call-ups.
 */
import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { youthCompFixtures, youthCompsOfCountry } from "@/backend/youthCompWorld";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { overallAvg } from "@/Domain/playerRating";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
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
    .filter((p) => age === "u21" || p.age <= YOUTH_COMP.MAX_AGE.u19)
    .sort((a, b) => a.age - b.age || b.overall - a.overall || a.id.localeCompare(b.id));
}

/** Validates a call-up body: arrays of distinct ids of the club (squad or academy), ≤ 11, ≤ 19 for the u19. */
export function parseCallUps(body: unknown, squad: Squad): { u21?: string[]; u19?: string[] } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const out: { u21?: string[]; u19?: string[] } = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key !== "u21" && key !== "u19") return null;
    if (value === null) continue;
    if (!Array.isArray(value) || value.length > YOUTH_COMP.MAX_CALL_UPS) return null;
    if (!value.every((v) => typeof v === "string") || new Set(value).size !== value.length) return null;
    const ok = new Set(eligibleForCallUp(squad, key).map((p) => p.id));
    if (!(value as string[]).every((id) => ok.has(id))) return null;
    if (value.length > 0) out[key] = value as string[];
  }
  return out;
}

async function humanSquad(saveId: string) {
  const meta = await saveService.getMeta(saveId);
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
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const country = new URL(req.url).searchParams.get("country") ?? "";
    if (!country) return Response.json({ u21: null, u19: null });
    return Response.json(await youthCompsOfCountry(saveService, saveId, country));
  },

  /** One youth competition: meta, fixtures, table, club names and leaders. */
  "/api/saves/:saveId/youth-comps/:slug": async (req: Req) => {
    const { saveId, slug } = req.params;
    const auth = requireSaveOwner(req, saveId!);
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

  /** `GET` the human club's next youth games, call-ups and eligible players; `PUT { u21?, u19? }`. */
  "/api/saves/:saveId/youth-callups": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      const { meta, squad } = await humanSquad(saveId);
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
        callUps: meta.youthCallUps ?? {},
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
      const { meta, squad } = await humanSquad(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      if (!squad) return Response.json({ error: "noClub" }, { status: 409 });
      const parsed = parseCallUps(body, squad);
      if (!parsed) return Response.json({ error: "invalidPlayers" }, { status: 400 });
      const callUps = { ...meta.youthCallUps, ...parsed };
      for (const age of AGES) {
        if ((body as Record<string, unknown>)[age] !== undefined && !parsed[age]) delete callUps[age];
      }
      const updated = await saveService.updateMeta(saveId, {
        youthCallUps: callUps.u21?.length || callUps.u19?.length ? callUps : undefined,
      });
      return Response.json({ callUps: updated?.youthCallUps ?? {} });
    });
  },
};
