/**
 * National teams routes (`.claude/rules/game/national-teams.md` → "Rotas"): the ranking and the competitions, one
 * competition (groups, knockout, games, leaders, awards) and one national team (coach, call-up, games, titles).
 */
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { groupRows } from "@/Domain/national/competitions";
import { rankTeams } from "@/Domain/national/elo";
import { fifaWindows, tournamentDates, tournamentSlug, tournamentsOfYear } from "@/Domain/national/fifaCalendar";
import { normalizeNation } from "@/Domain/registration/nations";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { overallAvg } from "@/Domain/playerRating";
import { regenerateFillers, stageOfRound, type FillerSpec } from "@/backend/nationalWorld";
import type { Fixture } from "@/types/calendarTypes";
import type { NationalCallUp, NationalCompetition, NationalState } from "@/types/nationalTypes";
import { withSaveLock } from "@/backend/saveLock";
import {
  answerNationalOffer, nationalCoachView, resignNationalTeam, saveNationalCallUp, saveNationalTactics,
} from "@/backend/nationalCoachWorld";

type Req = Request & { params: Record<string, string> };

export interface NationalRankRow {
  rank: number;
  prevRank: number | null;
  id: string;
  nation: string;
  confed: string;
  elo: number;
  games: number;
  managerId: string;
  managerName: string | null;
}

export interface NationalCompSummary {
  slug: string;
  kind: NationalCompetition["kind"];
  tournament: string | null;
  year: number;
  confed: string | null;
  status: NationalCompetition["status"];
  championId: string | null;
}

export interface NationalOverview {
  ranking: NationalRankRow[];
  competitions: NationalCompSummary[];
  /** Team of the human club's country (the default of the "national team" tab), null when it has none. */
  homeTeam: string | null;
  /** Current or next international break: a window or a tournament. */
  next: { kind: "window" | "tournament"; start: string; end: string; slug?: string; current?: boolean } | null;
  /** The national team the human manager coaches and his pending offers (Etapa 41b). */
  coach: { teamId: string | null; offers: number };
}

function nextBreak(date: string): NationalOverview["next"] {
  const out: NonNullable<NationalOverview["next"]>[] = [];
  for (let y = Number(date.slice(0, 4)); y <= Number(date.slice(0, 4)) + 1; y++) {
    for (const w of fifaWindows(y)) out.push({ kind: "window", start: w.start, end: w.matchDates[w.matchDates.length - 1]! });
    for (const t of tournamentsOfYear(y)) {
      const td = tournamentDates(t, y);
      out.push({ kind: "tournament", start: td.callUp, end: td.final, slug: tournamentSlug(t, y) });
    }
  }
  const next = out.filter((b) => b.end >= date).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  return next ? { ...next, ...(next.start <= date ? { current: true } : {}) } : null;
}

async function loadState(saveId: string): Promise<NationalState | null> {
  return saveService.getNationalState(saveId);
}

const compSummary = (c: NationalCompetition): NationalCompSummary => ({
  slug: c.slug, kind: c.kind, tournament: c.tournament ?? null, year: c.year, confed: c.confed ?? null, status: c.status,
  championId: c.championId ?? null,
});

export const nationalRoutes = {
  "/api/saves/:saveId/national": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const [meta, state] = await Promise.all([saveService.getSeatMeta(saveId, auth.seatId), loadState(saveId)]);
    if (!meta || !state) return Response.json({ error: "no national teams" }, { status: 404 });
    const managers = new Map((await saveService.getManagers(saveId)).map((m) => [m.id, m.name]));
    const ranking: NationalRankRow[] = rankTeams(Object.values(state.teams)).map((t, i) => ({
      rank: i + 1, prevRank: t.prevRank ?? null, id: t.id, nation: t.nation, confed: t.confed, elo: Math.round(t.elo),
      games: t.games, managerId: t.managerId, managerName: managers.get(t.managerId) ?? null,
    }));
    const competitions: NationalCompSummary[] = [];
    for (const slug of state.competitions) {
      const c = await saveService.getNationalComp(saveId, slug);
      if (c) competitions.push(compSummary(c));
    }
    const country = (await getLeagueData()).find((l) => l.slug === meta.leagueSlug)?.country;
    const home = normalizeNation(country);
    const homeTeam = Object.values(state.teams).find((t) => t.nation === home)?.id ?? null;
    const coach = {
      teamId: state.human?.teamId ?? null,
      offers: (state.offers ?? []).filter((o) => !meta.currentDate || o.expires >= meta.currentDate).length,
    };
    const body: NationalOverview = { ranking, competitions, homeTeam, next: meta.currentDate ? nextBreak(meta.currentDate) : null, coach };
    return Response.json(body);
  },

  "/api/saves/:saveId/national/competitions/:slug": async (req: Req) => {
    const { saveId, slug } = req.params;
    const auth = requireSeat(req, saveId!);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    if (!/^[a-z0-9_]{1,40}$/.test(slug!)) return Response.json({ error: "invalid competition" }, { status: 400 });
    const state = await loadState(saveId!);
    const comp = state?.competitions.includes(slug!) ? await saveService.getNationalComp(saveId!, slug!) : null;
    if (!state || !comp) return Response.json({ error: "competition not found" }, { status: 404 });
    const names = Object.fromEntries(comp.teams.map((id) => [id, state.teams[id]?.nation ?? id]));
    for (const f of comp.fixtures) for (const id of [f.home, f.away]) names[id] ??= state.teams[id]?.nation ?? id;
    const groups = comp.groups.map((g) => ({ name: g.name, rows: groupRows(comp, g) }));
    const scorers = Object.entries(comp.leaders)
      .map(([id, l]) => ({ id, ...l }))
      .filter((l) => l.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.apps - b.apps || a.id.localeCompare(b.id))
      .slice(0, 10);
    const fixtures = comp.fixtures.map((f) => ({ ...f, stage: comp.kind === "tournament" ? stageOfRound(comp, f.round) : "group" }));
    return Response.json({
      ...compSummary(comp), teams: comp.teams, groups, stages: comp.stages, fixtures, names, scorers,
      qualified: comp.qualified ?? null, slots: comp.slots ?? null, awards: comp.awards ?? null,
    });
  },

  "/api/saves/:saveId/national/teams/:teamId": async (req: Req) => {
    const { saveId, teamId } = req.params;
    const auth = requireSeat(req, saveId!);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const [meta, state] = await Promise.all([saveService.getSeatMeta(saveId!, auth.seatId), loadState(saveId!)]);
    const team = state?.teams[teamId!];
    if (!meta || !state || !team) return Response.json({ error: "national team not found" }, { status: 404 });
    const rank = rankTeams(Object.values(state.teams)).findIndex((t) => t.id === team.id) + 1;
    const manager = (await saveService.getManagers(saveId!)).find((m) => m.id === team.managerId) ?? null;
    const active = state.callUps[team.id];
    const cu: NationalCallUp | null = active ?? state.lastCallUps?.[team.id] ?? null;
    const index = await saveService.getSquadIndex(saveId!);
    const players = [];
    const spec = (cu as (NationalCallUp & { fillers?: FillerSpec }) | null)?.fillers;
    const generated = new Map((spec ? regenerateFillers(saveId!, team.id, team.nation, spec) : []).map((p) => [p.id, p]));
    for (const pl of cu?.players ?? []) {
      if (pl.generated) {
        const g = generated.get(pl.id);
        const [caps, goals] = state.localCaps?.[pl.id] ?? [0, 0];
        players.push({
          id: pl.id, name: g?.name ?? pl.name, generated: true, squadId: "", clubName: null, league: null,
          role: g ? preferredRole(g) : null, overall: g ? Math.round(overallAvg(g) * 100) / 100 : null, caps, goals,
        });
        continue;
      }
      const e = index.byId(pl.squadId);
      const squad = e ? await saveService.getSquadById(saveId!, pl.squadId) : null;
      const p = squad?.players.find((x) => x.id === pl.id);
      players.push({
        id: pl.id, name: p?.name ?? pl.name, generated: false, squadId: pl.squadId, clubName: e?.name ?? null, league: e?.leagueSlug ?? null,
        role: p ? preferredRole(p) : null, overall: p ? Math.round(overallAvg(p) * 100) / 100 : null,
        caps: p?.national?.nation === team.nation ? p.national.caps : 0, goals: p?.national?.nation === team.nation ? p.national.goals : 0,
      });
    }
    const games: (Fixture & { competition: string })[] = [];
    const titles: string[] = [];
    for (const slug of state.competitions) {
      const c = await saveService.getNationalComp(saveId!, slug);
      if (!c) continue;
      if (c.championId === team.id) titles.push(c.slug);
      for (const f of c.fixtures) if (f.home === team.id || f.away === team.id) games.push(f);
    }
    games.sort((a, b) => a.date.localeCompare(b.date));
    const names: Record<string, string> = {};
    for (const f of games) for (const id of [f.home, f.away]) names[id] = state.teams[id]?.nation ?? id;
    return Response.json({
      id: team.id, nation: team.nation, confed: team.confed, elo: Math.round(team.elo), rank, games: team.games,
      manager: manager ? { id: manager.id, name: manager.name, interim: !!manager.interim, isPlayer: manager.seatId === auth.seatId } : null,
      callUp: cu ? { from: cu.from, until: cu.until, active: !!active, competition: cu.competition ?? null, players } : null,
      recent: games.filter((f) => f.played).slice(-8).reverse(),
      upcoming: games.filter((f) => !f.played).slice(0, 5),
      names, titles,
    });
  },

  // ── The human manager at a national team (Etapa 41b) ──────────────────────

  /** "My national team": offers, the team, objectives, the next call-up (suggestion, candidates), tactics, games. */
  "/api/saves/:saveId/national/coach": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const view = await nationalCoachView(saveService, saveId, meta);
    if (!view) return Response.json({ error: "no national teams" }, { status: 404 });
    return Response.json(view);
  },

  /** `POST { accept }`: answer a national-team job offer. 409 `offerClosed`. */
  "/api/saves/:saveId/national/coach/offers/:offerId": async (req: Req) => {
    const { saveId, offerId } = req.params;
    const auth = requireSeat(req, saveId!);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
    if (!body || typeof body.accept !== "boolean") return Response.json({ error: "accept required" }, { status: 400 });
    return withSaveLock(saveId!, async () => {
      const meta = await saveService.getSeatMeta(saveId!, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      const r = await answerNationalOffer(saveService, saveId!, auth.seatId, offerId!, body.accept as boolean, meta.currentDate);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ ok: true, status: body.accept ? "accepted" : "declined", teamId: r.teamId });
    });
  },

  /** He leaves his national team (his club stays). 409 `notCoach`. */
  "/api/saves/:saveId/national/coach/resign": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      const r = await resignNationalTeam(saveService, saveId, auth.seatId, meta.currentDate);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ ok: true });
    });
  },

  /** `PUT { players: string[] | null }`: his call-up for the next call-up date. 400 `invalidCallUp { reason }`. */
  "/api/saves/:saveId/national/coach/callup": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await req.json().catch(() => null)) as { players?: unknown } | null;
    if (!body || !("players" in body)) return Response.json({ error: "invalidCallUp", reason: "notList" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      const r = await saveNationalCallUp(saveService, saveId, meta.currentDate, body.players);
      if (!r.ok) return Response.json({ error: r.error, ...(r.reason ? { reason: r.reason } : {}) }, { status: r.status });
      return Response.json({ ok: true });
    });
  },

  /** `PUT { formation, tactical_style, lineup }`: his national tactics (separate from the club's). */
  "/api/saves/:saveId/national/coach/tactics": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null);
    return withSaveLock(saveId, async () => {
      const r = await saveNationalTactics(saveService, saveId, body);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ ok: true });
    });
  },
};
