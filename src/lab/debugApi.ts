/**
 * Debug API endpoints — registered by src/lab/server.ts only.
 *
 * Not exposed by the production server (src/index.ts). These are dev-only
 * tools for snapshot capture (TestScreen → POST /api/debug/snapshot) and
 * headless match simulation (GET /api/debug/simulate?homeClub=...).
 */

import type { Squad } from "@/types/playerTypes";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { squadFileStemFromClubParam, type StandingLike } from "@/backend/squadIdResolve";
import { fileURLToPath } from "node:url";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

/**
 * Resolve a club param (slug like "manchester_united" OR numeric squadId
 * like "33") to the on-disk squad file stem for a league.
 *
 * Squad files are named by numeric squadId (33.json), but the lab UI passes
 * club slugs. We bridge them through leagueData.json standings — the same
 * mapping saveService.getSquad uses for the per-user route.
 */
async function resolveSquadFileStem(league: string, club: string): Promise<string | null> {
  const leagueFile = Bun.file(`${DATA_DIR}/leagueData.json`);
  if (!(await leagueFile.exists())) return null;
  const leagues = (await leagueFile.json()) as Array<{ slug: string; standings: StandingLike[] }>;
  const standings = leagues.find((l) => l.slug === league)?.standings;
  return squadFileStemFromClubParam(standings, club);
}

export const debugApiRoutes = {
  /**
   * Simulate a full headless match and return raw JSON results.
   *
   * Query params (all optional):
   *   homeLeague  default: premier_league
   *   homeClub    default: arsenal
   *   awayLeague  default: premier_league
   *   awayClub    default: manchester_city
   *
   * Example: GET /api/debug/simulate?homeClub=chelsea&awayClub=liverpool
   */
  "/api/debug/simulate": async (req: Request) => {
    const url        = new URL(req.url);
    const homeLeague = url.searchParams.get("homeLeague") ?? "premier_league";
    const homeClub   = url.searchParams.get("homeClub")   ?? "arsenal";
    const awayLeague = url.searchParams.get("awayLeague") ?? "premier_league";
    const awayClub   = url.searchParams.get("awayClub")   ?? "manchester_city";

    const homeStem = await resolveSquadFileStem(homeLeague, homeClub);
    const awayStem = await resolveSquadFileStem(awayLeague, awayClub);

    if (!homeStem) return Response.json({ error: `squad not found: ${homeLeague}/${homeClub}` }, { status: 404 });
    if (!awayStem) return Response.json({ error: `squad not found: ${awayLeague}/${awayClub}` }, { status: 404 });

    const homeFile = Bun.file(`${DATA_DIR}/squads/${homeLeague}/${homeStem}.json`);
    const awayFile = Bun.file(`${DATA_DIR}/squads/${awayLeague}/${awayStem}.json`);

    if (!(await homeFile.exists())) return Response.json({ error: `squad not found: ${homeLeague}/${homeStem}` }, { status: 404 });
    if (!(await awayFile.exists())) return Response.json({ error: `squad not found: ${awayLeague}/${awayStem}` }, { status: 404 });

    const squadA = (await homeFile.json()) as Squad;
    const squadB = (await awayFile.json()) as Squad;

    const result = simulateMatch(squadA, squadB);

    const nameMap = new Map<number, string>();
    for (const p of result.players) nameMap.set(p.id, p.name ?? `#${p.id}`);

    const playerStats = Array.from(result.playerStats.entries()).map(([id, stats]) => ({
      id,
      name: nameMap.get(id) ?? `#${id}`,
      team: result.players.find(p => p.id === id)?.team,
      rating: Math.round((result.playerRatings[id] ?? 6) * 10) / 10,
      ...stats,
    })).sort((a, b) => (b.rating) - (a.rating));

    return Response.json({
      home: { league: homeLeague, club: homeClub },
      away: { league: awayLeague, club: awayClub },
      score: { home: result.score.A, away: result.score.B },
      durationMs: Math.round(result.durationMs),
      teamStats: result.teamStats,
      players: playerStats,
    });
  },

  /**
   * Return the full global squad JSON for a club — dev-only, no auth.
   *
   * The lab /simulate page can't use the per-user, ownership-gated
   * /api/saves/:saveId/squad/... route (it has no logged-in user), so it
   * reads the base squad straight from Data/squads/ instead.
   *
   * Example: GET /api/debug/squad/premier_league/arsenal
   */
  "/api/debug/squad/:league/:club": async (
    req: Request & { params: { league: string; club: string } },
  ) => {
    const { league, club } = req.params;
    const stem = await resolveSquadFileStem(league, club);
    if (!stem) {
      return Response.json({ error: `squad not found: ${league}/${club}` }, { status: 404 });
    }
    const file = Bun.file(`${DATA_DIR}/squads/${league}/${stem}.json`);
    if (!(await file.exists())) {
      return Response.json({ error: `squad not found: ${league}/${stem}` }, { status: 404 });
    }
    return new Response(file, { headers: { "content-type": "application/json" } });
  },

  "/api/debug/snapshot": async (req: Request) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    try {
      const { image, ...body } = await req.json() as { image?: string | null };
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // One folder per snapshot: debug/{timestamp}/state.json (+ pitch.png).
      const dir = `${process.cwd()}/debug/${timestamp}`;
      await Bun.write(`${dir}/state.json`, JSON.stringify(body, null, 2));

      // Optional PNG of the rendered pitch (base64 data URL from Pixi extract).
      let imageFile: string | undefined;
      if (typeof image === 'string') {
        const base64 = image.replace(/^data:image\/png;base64,/, '');
        await Bun.write(`${dir}/pitch.png`, Buffer.from(base64, 'base64'));
        imageFile = `debug/${timestamp}/pitch.png`;
      }

      return Response.json({ ok: true, file: `debug/${timestamp}/state.json`, imageFile });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  },
};
