import { fileURLToPath } from "node:url";
import { saveRoutes } from "@/backend/saves";
import { advanceDayRoutes } from "@/backend/advanceDay";
import { transferRoutes } from "@/backend/transfers";
import { inboxRoutes } from "@/backend/inbox";
import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import { readdir } from "fs/promises";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";
import { getMainRole } from "@/GameInterface/positionHelpers";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import { clubSlugFromSquadId, squadIdToClubSlugMap } from "@/backend/squadIdResolve";
import { clubProfileStem } from "@/backend/clubProfile";
import { authRoutes } from "@/backend/auth/routes";
import { requireAuth, requireSaveOwner } from "@/backend/auth/middleware";
import { listUserSaveIds } from "@/backend/auth/saveOwnership";

// fileURLToPath (not `.pathname`) so this resolves correctly on Windows, where a bare
// `.pathname` leaves a leading slash before the drive letter (e.g. "/C:/...") and every
// Bun.file() read under DATA_DIR silently reports not-found.
const DATA_DIR       = fileURLToPath(new URL("../Data",            import.meta.url));
const FORMATIONS_DIR = fileURLToPath(new URL("../Data/formations", import.meta.url));

type ClubProfileLeagueEntry = {
  slug: string;
  standings?: Array<{ squadId: string; slug?: string }>;
};

let _clubProfileLeagueDataCache: ClubProfileLeagueEntry[] | null = null;

/** Cached leagueData.json read — /api/club-profile is hit repeatedly while the wizard is open. */
async function loadClubProfileLeagueData(): Promise<ClubProfileLeagueEntry[]> {
  if (_clubProfileLeagueDataCache) return _clubProfileLeagueDataCache;
  const file = Bun.file(`${DATA_DIR}/leagueData.json`);
  if (!(await file.exists())) return [];
  _clubProfileLeagueDataCache = (await file.json()) as ClubProfileLeagueEntry[];
  return _clubProfileLeagueDataCache;
}

export const apiRoutes = {
  ...authRoutes,
  ...saveRoutes,
  ...advanceDayRoutes,
  ...transferRoutes,
  ...inboxRoutes,

  // Public runtime config for the frontend. PostHog is only enabled when
  // POSTHOG_KEY is set — the project key is a public client token.
  "/api/config": () => {
    const key = process.env.POSTHOG_KEY?.trim();
    const host = process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
    return Response.json({ posthog: key ? { key, host } : null });
  },

  "/api/logos/:league/:club": async (req: Request & { params: Record<string, string> }) => {
    const { league } = req.params;
    let club = req.params.club;
    // Resolve numeric team IDs (e.g. "157") to slug (e.g. "bayern_munchen") via leagueData.json
    if (/^\d+$/.test(club)) {
      const leagueFile = Bun.file(`${DATA_DIR}/leagueData.json`);
      if (await leagueFile.exists()) {
        const leagues = (await leagueFile.json()) as Array<{ slug: string; standings?: Array<{ squadId: string; slug?: string }> }>;
        const leagueEntry = leagues.find(l => l.slug === league);
        const row = leagueEntry?.standings?.find(s => s.squadId === club);
        if (row?.slug) club = row.slug;
      }
    }

    const svg = Bun.file(`${DATA_DIR}/logos/${league}/${club}.svg`);
    if (await svg.exists())
      return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
    const png = Bun.file(`${DATA_DIR}/logos/${league}/${club}.png`);
    if (await png.exists())
      return new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });

    return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  },

  "/api/formations": async () => {
    const glob = new Bun.Glob("*.json");
    const list: { id: string }[] = [];
    for await (const path of glob.scan(FORMATIONS_DIR)) {
      const file = Bun.file(`${FORMATIONS_DIR}/${path}`);
      const data = (await file.json()) as { id: string };
      if (data.id) list.push({ id: data.id });
    }
    list.sort((a, b) => a.id.localeCompare(b.id));
    return Response.json(list);
  },

  "/api/formations/:id": async (req: Request & { params: Record<string, string> }) => {
    const { id } = req.params;
    const file = Bun.file(`${FORMATIONS_DIR}/${id}.json`);
    if (!(await file.exists()))
      return Response.json({ error: "formation not found" }, { status: 404 });
    return new Response(file, { headers: { "content-type": "application/json" } });
  },

  "/api/leagues": async () => {
    const file = Bun.file(`${DATA_DIR}/leagueData.json`);
    if (!(await file.exists()))
      return new Response("[]", { headers: { "content-type": "application/json" } });
    return new Response(file, { headers: { "content-type": "application/json" } });
  },

  "/api/squad/:league/:club": async () => {
    return Response.json({ error: "use /api/saves/:saveId/squad/:league/:club" }, { status: 410 });
  },

  /**
   * Pre-save read-only club profile, used by the new-game wizard.
   * Resolves the source squad JSON in `Data/squads/{league}/{club}.json`,
   * accepts either the squad slug or the numeric squadId.
   */
  "/api/club-profile/:league/:club": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const league = req.params.league!;
    const clubParam = req.params.club!;

    // Resolve squadId or slug to the on-disk squad file stem (squad files are named by squadId).
    const leagues = await loadClubProfileLeagueData();
    const standings = leagues.find((l) => l.slug === league)?.standings;
    const stem = clubProfileStem(standings, clubParam);
    if (!stem) {
      return Response.json({ error: "club not found" }, { status: 404 });
    }

    const file = Bun.file(`${DATA_DIR}/squads/${league}/${stem}.json`);
    if (!(await file.exists())) {
      return Response.json({ error: "club not found" }, { status: 404 });
    }

    const squad = (await file.json()) as Squad & {
      founded?: number;
      venue?: { name?: string; city?: string; capacity?: number };
    };

    const ratingByMain = (main: "Defender" | "Midfielder" | "Forward"): number => {
      const players = squad.players.filter(
        (p: RosterPlayer) => getMainRole(p.positions[0] ?? "CM") === main,
      );
      if (players.length === 0) return 0;
      const sum = players.reduce((s, p) => s + Player.overallAvg(p), 0);
      // Map 0–10 player rating space → 0–100 ratings shown in UI
      return Math.round((sum / players.length) * 10);
    };

    const sortedPlayers = [...squad.players].sort(
      (a, b) => Player.overallAvg(b) - Player.overallAvg(a),
    );
    const keyPlayers = sortedPlayers.slice(0, 4).map((p) => ({
      id:       p.id,
      name:     p.name,
      position: p.positions[0] ?? "—",
      age:      p.age,
      ovr:      Math.round(Player.overallAvg(p) * 10),
    }));

    const teamAvg = squad.players.length
      ? squad.players.reduce((s, p) => s + Player.overallAvg(p), 0) / squad.players.length
      : 5;
    // Reputation: 1–5 stars derived from team average rating.
    // 5★ at avg ≥ 7.5, 4★ at ≥ 6.8, 3★ at ≥ 6.0, 2★ at ≥ 5.2, else 1★
    const reputation =
      teamAvg >= 7.5 ? 5 : teamAvg >= 6.8 ? 4 : teamAvg >= 6.0 ? 3 : teamAvg >= 5.2 ? 2 : 1;
    const reputationLabels = [
      "Local Outfit",
      "Regional Side",
      "National Power",
      "Continental Force",
      "World Elite",
    ] as const;

    return Response.json({
      squadId:    squad.id,
      slug:       squad.slug,
      name:       squad.name,
      colors:     squad.colors,
      founded:    squad.founded ?? null,
      stadium:    squad.venue?.name ?? null,
      city:       squad.venue?.city ?? null,
      attack:     ratingByMain("Forward"),
      midfield:   ratingByMain("Midfielder"),
      defense:    ratingByMain("Defender"),
      keyPlayers,
      reputation,
      reputationLabel: reputationLabels[reputation - 1],
    });
  },

  "/api/saves/:saveId/squad/:league/:club": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const { saveId, league, club } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    if (req.method === "PUT") {
      const squad = await saveService.getSquad(saveId!, league!, club!);
      if (!squad) return Response.json({ error: "save squad not found" }, { status: 404 });
      const body = await req.json() as { finances?: Partial<import("@/types/playerTypes").ClubFinances> };
      if (body.finances) {
        squad.finances = { ...squad.finances, ...body.finances } as import("@/types/playerTypes").ClubFinances;
      }
      await saveService.saveSquad(saveId!, league!, club!, squad);
      return Response.json(squad);
    }
    const squad = await saveService.getSquad(saveId!, league!, club!);
    if (!squad) return Response.json({ error: "save squad not found" }, { status: 404 });
    return Response.json(squad);
  },

  "/api/saves/:saveId/all-squads/:league": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const { saveId, league } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const squads = await saveService.getSquadsInLeague(saveId!, league!);
    if (squads.length === 0)
      return Response.json({ error: "save squads not found" }, { status: 404 });
    return Response.json(squads);
  },

  "/api/saves/:saveId/all-squads": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const { saveId } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const squads = await saveService.getAllSquads(saveId!);
    if (squads.length === 0)
      return Response.json({ error: "save squads not found" }, { status: 404 });
    return Response.json(squads);
  },

  "/api/saves/:saveId/import-squads": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });

    const saveId        = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    const squadsRootSrc = `${DATA_DIR}/squads`;
    const leagues = (await readdir(squadsRootSrc, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const squadGlob = new Bun.Glob("*.json");
    let copied = 0;

    for (const league of leagues) {
      const srcDir = `${squadsRootSrc}/${league}`;
      for await (const p of squadGlob.scan(srcDir)) {
        const clubSlug = p.replace(".json", "");
        if (await saveService.squadExists(saveId, league, clubSlug)) continue;

        const raw   = (await Bun.file(`${srcDir}/${p}`).json()) as Squad;
        const squad: Squad = {
          ...raw,
          players: raw.players.map((pl) => ({
            ...pl,
            seasonLog: pl.seasonLog ?? emptySeasonLog(),
          })),
        };
        await saveService.saveSquad(saveId, league, clubSlug, squad);
        copied++;
      }
    }

    return Response.json({ ok: true, copied });
  },

  /**
   * Returns everything the match screen needs to start a live game.
   * With `?saveId=…`, the opponent is the club from today’s **calendar fixture** (same as match preview),
   * not an arbitrary standings row. The user's club must have tactics on disk with a full 11-player lineup
   * and a valid formation file — otherwise 400/404. Without `saveId`, falls back to the latest save
   * and may synthesize tactics defaults (legacy).
   */
  "/api/match-setup": async (req: Request) => {
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;

    const url = new URL(req.url);
    const saveIdParam = url.searchParams.get("saveId");
    let save: SaveMeta | null = null;
    if (saveIdParam) {
      const owned = requireSaveOwner(req, saveIdParam);
      if (owned instanceof Response) return owned;
      save = await saveService.getMeta(saveIdParam);
      if (!save) return Response.json({ error: "save not found" }, { status: 404 });
    } else {
      const userIds = listUserSaveIds(auth.userId);
      const metas = (await Promise.all(userIds.map((id) => saveService.getMeta(id))))
        .filter((m): m is SaveMeta => !!m);
      save = metas[0] ?? null;
      if (!save) return Response.json({ error: "no save found" }, { status: 404 });
    }

    const mySquad = await saveService.getSquad(save.id, save.leagueSlug, save.clubId);
    if (!mySquad) return Response.json({ error: "squad not found" }, { status: 404 });

    const leagueFile = Bun.file(`${DATA_DIR}/leagueData.json`);
    const leagues    = (await leagueFile.json()) as Array<{
      slug: string;
      standings: Array<{ squadId: string; slug?: string }>;
    }>;
    const league    = leagues.find((l) => l.slug === save.leagueSlug);
    const myInternalId = mySquad.id;
    const idToClubSlug = league ? squadIdToClubSlugMap(league.standings) : undefined;

    let opponentSquad: Squad | null = null;
    let matchFixture: Fixture | null = null;

    if (saveIdParam) {
      const currentDate = save.currentDate ?? "";
      if (!currentDate) {
        return Response.json({ error: "save has no currentDate" }, { status: 400 });
      }
      // Try per-league round files first (new format), then fall back to season.json
      let todayFixture: Fixture | undefined;
      const todayFixturesNew = await saveService.getFixturesForDate(save.id, currentDate);
      todayFixture = todayFixturesNew.find(
        (f) =>
          f.competition === save.leagueSlug &&
          (f.home === myInternalId || f.away === myInternalId) &&
          !f.played,
      );
      if (!todayFixture) {
        const season = await saveService.getSeason(save.id);
        const calendar = season?.calendar ?? [];
        todayFixture = calendar.find(
          (f) =>
            f.date === currentDate &&
            (f.home === myInternalId || f.away === myInternalId) &&
            !f.played,
        );
      }
      if (!todayFixture) {
        return Response.json(
          { error: "no unplayed match for your club on the current date" },
          { status: 400 },
        );
      }
      const oppId = todayFixture.home === myInternalId ? todayFixture.away : todayFixture.home;
      const oppSlug = clubSlugFromSquadId(oppId, save.leagueSlug, idToClubSlug);
      if (!oppSlug) {
        return Response.json({ error: "could not resolve opponent club" }, { status: 400 });
      }
      opponentSquad = await saveService.getSquad(save.id, save.leagueSlug, oppSlug);
      if (!opponentSquad) {
        return Response.json({ error: "opponent squad not found" }, { status: 404 });
      }
      matchFixture = todayFixture;
    } else {
      const oppRow = league?.standings.find((s) => s.squadId !== myInternalId);
      const oppSlug = oppRow ? clubSlugFromSquadId(oppRow.squadId, save.leagueSlug, idToClubSlug) : null;
      if (oppSlug) {
        opponentSquad = await saveService.getSquad(save.id, save.leagueSlug, oppSlug);
      }
    }

    const tacticsRaw = await saveService.getTactics(save.id);

    let myTactics: TacticsSave;
    if (saveIdParam) {
      if (!tacticsRaw) {
        return Response.json({ error: "tactics not found for this save" }, { status: 404 });
      }
      if (!tacticsRaw.lineup || tacticsRaw.lineup.length !== 11) {
        return Response.json(
          {
            error:
              "starting lineup must have 11 players — open Formation & Tactics and click Save",
          },
          { status: 400 },
        );
      }
      myTactics = tacticsRaw;
    } else {
      const myFormationIdFallback = tacticsRaw?.formation ?? save.formation ?? "4-3-3";
      myTactics = tacticsRaw ?? {
        formation:      myFormationIdFallback,
        tactical_style: save.tactical_style ?? DEFAULT_TACTICAL_STYLE,
        lineup:         [],
      };
    }

    const myFormationId = myTactics.formation;
    const oppFormationId = "4-3-3";

    const myFormFile  = Bun.file(`${FORMATIONS_DIR}/${myFormationId}.json`);
    const oppFormFile = Bun.file(`${FORMATIONS_DIR}/${oppFormationId}.json`);

    if (saveIdParam && !(await myFormFile.exists())) {
      return Response.json({ error: `formation "${myFormationId}" not found` }, { status: 404 });
    }

    const myFormation  = (await myFormFile.exists())  ? await myFormFile.json()  : null;
    const oppFormation = (await oppFormFile.exists()) ? await oppFormFile.json() : null;

    const defaultFormation = {
      id: "4-3-3",
      attacking: [
        { role: "GK",  x: 10, y: 37 },
        { role: "LB",  x: 36, y: 11 },
        { role: "CB",  x: 38, y: 28 },
        { role: "CB",  x: 38, y: 46 },
        { role: "RB",  x: 36, y: 63 },
        { role: "CM",  x: 72, y: 24 },
        { role: "CM",  x: 72, y: 50 },
        { role: "CAM", x: 78, y: 37 },
        { role: "LW",  x: 95, y: 8  },
        { role: "ST",  x: 98, y: 37 },
        { role: "RW",  x: 95, y: 66 },
      ],
      defending: [
        { role: "GK",  x: 5,  y: 37 },
        { role: "LB",  x: 13, y: 11 },
        { role: "CB",  x: 14, y: 28 },
        { role: "CB",  x: 14, y: 46 },
        { role: "RB",  x: 13, y: 63 },
        { role: "CM",  x: 38, y: 24 },
        { role: "CM",  x: 38, y: 50 },
        { role: "CAM", x: 36, y: 37 },
        { role: "LW",  x: 50, y: 8  },
        { role: "ST",  x: 60, y: 37 },
        { role: "RW",  x: 50, y: 66 },
      ],
    };

    return Response.json({
      save,
      mySquad,
      mySquadId: myInternalId,
      fixture: matchFixture,
      opponentSquad,
      myFormation:  myFormation  ?? defaultFormation,
      oppFormation: oppFormation ?? defaultFormation,
      myLineup:     myTactics.lineup ?? [],
      myTactics,
    });
  },

  "/api/all-squads/:league": async () => {
    return Response.json({ error: "use /api/saves/:saveId/all-squads/:league" }, { status: 410 });
  },

  "/api/saves/:saveId/leagues/:leagueSlug/standings": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId, leagueSlug } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const standings = await saveService.getLeagueStandings(saveId!, leagueSlug!);
    if (!standings) return Response.json({ error: "standings not found" }, { status: 404 });
    return Response.json(standings);
  },

  "/api/saves/:saveId/leagues/:leagueSlug/fixtures": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId, leagueSlug } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const fixtures = await saveService.getAllFixturesForLeague(saveId!, leagueSlug!);
    return Response.json(fixtures);
  },

  "/api/saves/:saveId/leagues": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const meta = await saveService.getMeta(saveId!);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    return Response.json(meta.activeLeagues ?? []);
  },
} as const;
