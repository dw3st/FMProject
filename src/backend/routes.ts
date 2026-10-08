import { fileURLToPath } from "node:url";
import { saveRoutes } from "@/backend/saves";
import { advanceDayRoutes } from "@/backend/advanceDay";
import { advanceUntilRoutes } from "@/backend/advanceUntil";
import { transferRoutes } from "@/backend/transfers";
import { contractRoutes } from "@/backend/contractRoutes";
import { staffRoutes } from "@/backend/staffRoutes";
import { responsibilityRoutes } from "@/backend/responsibilityRoutes";
import { scoutingRoutes } from "@/backend/scoutingRoutes";
import { moraleRoutes } from "@/backend/moraleRoutes";
import { youthRoutes } from "@/backend/youthRoutes";
import { facilityRoutes } from "@/backend/facilityRoutes";
import { rebornRoutes } from "@/backend/rebornRoutes";
import { managerRoutes } from "@/backend/managerRoutes";
import { awardsRoutes } from "@/backend/awardsRoutes";
import { jobRoutes } from "@/backend/jobRoutes";
import { negotiationRoutes } from "@/backend/negotiationRoutes";
import { marketRoutes } from "@/backend/marketRoutes";
import { clubHistoryRoutes } from "@/backend/clubHistoryRoutes";
import { loadViewer, obscureSquadForViewer } from "@/backend/scoutingWorld";
import { inboxRoutes } from "@/backend/inbox";
import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import { readdir } from "fs/promises";
import type { Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { Formation } from "@/GameEngine/types";
import { aiMatchFormation, autoLineupForFormationWithFitness, resolveUserLineup } from "@/Domain/advanceDay/matchSimulationLineups";
import { sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID } from "@/Domain/formation/zones";
import { isSquadInSave, resolveSquadRoute } from "@/backend/squadRouteResolve";
import { clubLineRating, clubProfileStem, reputationStars } from "@/backend/clubProfile";
import { popularityOf } from "@/Domain/aiFinance/aiClubFinance";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { authRoutes } from "@/backend/auth/routes";
import { reportRoutes } from "@/backend/reports";
import { faceRoutes } from "@/backend/faces";
import { staticAssetRoutes } from "@/backend/staticAssets";
import { requireAuth, requireSaveOwner } from "@/backend/auth/middleware";
import { listUserSaveIds } from "@/backend/auth/saveOwnership";
import { parseScoutQuery, searchScout } from "@/backend/scoutSearch";
import { getStarPlayers } from "@/backend/starsIndex";
import { getCompetitionRankings } from "@/backend/statsRankings";
import { buildClubFinanceRows } from "@/Domain/aiFinance/financeRows";
import { totalsByKind, weeklyNet } from "@/Domain/finance/ledger";
import { getClubBudget } from "@/backend/FinancialService";
import { playerCupSlug } from "@/backend/cupWorld";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { groupTable } from "@/Domain/continental/groupTable";
import { matchPitchCondition } from "@/Domain/facilities/pitch";

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
  ...reportRoutes,
  ...faceRoutes,
  ...staticAssetRoutes,
  ...saveRoutes,
  ...advanceDayRoutes,
  ...advanceUntilRoutes,
  ...transferRoutes,
  ...contractRoutes,
  ...staffRoutes,
  ...responsibilityRoutes,
  ...scoutingRoutes,
  ...moraleRoutes,
  ...youthRoutes,
  ...facilityRoutes,
  ...rebornRoutes,
  ...managerRoutes,
  ...awardsRoutes,
  ...jobRoutes,
  ...negotiationRoutes,
  ...marketRoutes,
  ...clubHistoryRoutes,
  ...inboxRoutes,

  // Public runtime config for the frontend. PostHog is only enabled when
  // POSTHOG_KEY is set — the project key is a public client token.
  "/api/config": () => {
    const key = process.env.POSTHOG_KEY?.trim();
    const host = process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
    return Response.json({ posthog: key ? { key, host } : null });
  },

  "/api/logos/:league/:club": async (req: Request & { params: { league: string; club: string } }) => {
    // `{league}/{club}` is a `logoIndex.json` entry: the crest file's folder and stem.
    const { league, club } = req.params;

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

    const reputation = reputationStars(popularityOf(squad));
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
      attack:     clubLineRating(squad.players, "Forward"),
      midfield:   clubLineRating(squad.players, "Midfielder"),
      defense:    clubLineRating(squad.players, "Defender"),
      keyPlayers,
      annualRevenue: (squad.finances?.broadcasting ?? 0) + (squad.finances?.commercial ?? 0),
      weeklyWages:   squadWeeklyWages(squad.players, wageFactorOf(squad)),
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
    // The club param is resolved inside :league first, then as a squadId anywhere in
    // the save (a club that moved leagues keeps answering on its id).
    const loc = resolveSquadRoute(await saveService.getSquadIndex(saveId!), league!, club!);
    const found = loc ? await saveService.getSquad(saveId!, loc.leagueSlug, loc.stem) : null;
    if (!loc || !found) return Response.json({ error: "save squad not found" }, { status: 404 });
    let squad: Squad = { ...found, leagueSlug: loc.leagueSlug };
    // `?scouted=1`: the view of a club's players on the screens (squad, player sheet). Anyone
    // outside the user's own club is blurred by how well he knows each player
    // (`.claude/rules/game/scouting.md`); the engine paths (match setup, advance day) never pass it
    // and always get exact values.
    if (new URL(req.url).searchParams.get("scouted") === "1") {
      const viewer = await loadViewer(saveService, saveId!);
      if (viewer && viewer.ownClubId !== squad.id) squad = obscureSquadForViewer(viewer, squad);
    }
    if (req.method === "PUT") {
      // `finances` is never accepted from the client here — every money movement for the
      // player's club goes through the ledger (`FinancialService.recordMoney`), never a raw
      // squad PUT (design spec §2, "Brecha"). The body is otherwise unused today, and re-writing
      // the squad we just read back to disk achieved nothing but risk (no lock — a concurrent
      // advance-day or transfer write to this same squad could be clobbered by this stale copy).
      // So this is a no-op PUT: parse-and-discard the body, write nothing, echo the current squad.
      await req.json().catch(() => null);
    }
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

  /** Scout database: filter / sort / paginate every squad's players server-side (body: ScoutQuery). */
  "/api/saves/:saveId/scout-search": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400 });
    }
    const result = await searchScout(saveId!, parseScoutQuery(body));
    if (!result) return Response.json({ error: "save not found" }, { status: 404 });
    return Response.json(result);
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
    // Skip any catalogue squad whose id already lives ANYWHERE in the save — a club
    // that moved leagues must not be resurrected in its old folder. addNewSquads
    // re-checks each candidate and drops the index once, not once per file.
    const index = await saveService.getSquadIndex(saveId);
    const candidates: Array<{ leagueSlug: string; stem: string; squad: Squad }> = [];

    for (const league of leagues) {
      const srcDir = `${squadsRootSrc}/${league}`;
      for await (const p of squadGlob.scan(srcDir)) {
        const clubSlug = p.replace(".json", "");
        // File stems are squadIds: skip without reading when the stem is already known.
        if (isSquadInSave(index, league, clubSlug, clubSlug)) continue;

        const raw   = (await Bun.file(`${srcDir}/${p}`).json()) as Squad;
        if (isSquadInSave(index, league, clubSlug, raw.id)) continue;
        const squad: Squad = {
          ...raw,
          players: raw.players.map((pl) => ({
            ...pl,
            seasonLog: pl.seasonLog ?? emptySeasonLog(),
          })),
        };
        candidates.push({ leagueSlug: league, stem: clubSlug, squad });
      }
    }

    const copied = await saveService.addNewSquads(saveId, candidates);
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

    const mySquad = await saveService.getSquadById(save.id, save.clubId);
    if (!mySquad) return Response.json({ error: "squad not found" }, { status: 404 });
    const myInternalId = mySquad.id;

    let opponentSquad: Squad | null = null;
    let matchFixture: Fixture | null = null;

    if (saveIdParam) {
      const currentDate = save.currentDate ?? "";
      if (!currentDate) {
        return Response.json({ error: "save has no currentDate" }, { status: 400 });
      }
      const cupSlug = await playerCupSlug(save.leagueSlug);
      const continentalSlug = await playerContinentalSlug(saveService, save.id, myInternalId);
      const todayFixtures = await saveService.getFixturesForDate(save.id, currentDate);
      const todayFixture = todayFixtures.find(
        (f) =>
          (f.competition === save.leagueSlug || f.competition === cupSlug || f.competition === continentalSlug) &&
          (f.home === myInternalId || f.away === myInternalId) &&
          !f.played,
      );
      if (!todayFixture) {
        return Response.json(
          { error: "no unplayed match for your club on the current date" },
          { status: 400 },
        );
      }
      const oppId = todayFixture.home === myInternalId ? todayFixture.away : todayFixture.home;
      opponentSquad = await saveService.getSquadById(save.id, oppId);
      if (!opponentSquad) {
        return Response.json({ error: "opponent squad not found" }, { status: 404 });
      }
      matchFixture = todayFixture;
    } else {
      const index = await saveService.getSquadIndex(save.id);
      const oppRow = index.inLeague(save.leagueSlug).find((t) => t.squadId !== myInternalId);
      if (oppRow) opponentSquad = await saveService.getSquadById(save.id, oppRow.squadId);
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

    const isCustomForm = myFormationId === CUSTOM_FORMATION_ID && !!myTactics.customFormation;
    const myFormFile  = Bun.file(`${FORMATIONS_DIR}/${myFormationId}.json`);

    if (saveIdParam && !isCustomForm && !(await myFormFile.exists())) {
      return Response.json({ error: `formation "${myFormationId}" not found` }, { status: 404 });
    }

    const myFormation  = isCustomForm
      ? formationForTactics(myTactics)
      : (await myFormFile.exists()) ? await myFormFile.json() : null;

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

    const resolvedMyFormation = (myFormation ?? defaultFormation) as Formation;
    const matchDate = matchFixture?.date ?? save.currentDate ?? undefined;
    // The AI opponent plays its own formation — the same choice the headless path makes.
    const oppFormation = opponentSquad && matchDate
      ? aiMatchFormation(opponentSquad, mySquad, matchDate).formation
      : null;

    // An empty (or otherwise invalid) saved lineup — e.g. a career that never touched the
    // formation screen — is filled the same way the headless path resolves it
    // (`resolveUserLineup`/`computeMatchSimulationLineups`), so a live match starts the same XI a
    // skipped/simulated day for this same fixture would have used, instead of match-setup's own
    // plain per-slot `pickForRole` fallback (via `createMatchState`'s unfilled lineup slots).
    //
    // Even a VALID 11-player saved lineup can go stale between the day it was saved and the day
    // the fixture is played — `resolveUserLineup` swaps out any starter injured on `matchDate` for
    // the best eligible bench player, and we surface which slots changed (`injuredReplaced`) so the
    // preview screen can warn the user before kickoff.
    const resolved = resolveUserLineup(mySquad, resolvedMyFormation, myTactics.lineup ?? [], matchDate, {
      assistantRotation: myTactics.assistantRotation,
      override: save.rotationOverride,
    });
    myTactics = { ...myTactics, lineup: resolved.lineup };
    // Player instructions: slot instructions fitted to the formation actually played, today's
    // man-marking, and the opponent's probable XI (the marking target picker).
    const slotInstructions = sanitizeSlotInstructions(resolvedMyFormation, myTactics.slotInstructions);
    myTactics = { ...myTactics, slotInstructions: slotInstructions.length > 0 ? slotInstructions : undefined };
    const oppLineup = opponentSquad && oppFormation && matchDate
      ? autoLineupForFormationWithFitness(opponentSquad, oppFormation, matchDate)
      : [];
    const matchMarking = save.matchMarking && save.matchMarking.date === matchDate ? save.matchMarking : null;
    // Pitch of the stadium the match is played in (`src/Domain/facilities/pitch.ts`).
    let pitchCondition: number | null = null;
    if (matchFixture && opponentSquad && matchDate) {
      const homeSquad = matchFixture.home === myInternalId ? mySquad : opponentSquad;
      const homeLeague = (await saveService.getSquadIndex(save.id)).byId(homeSquad.id)?.leagueSlug;
      const window = (save.activeLeagues ?? []).find((l) => l.leagueSlug === homeLeague);
      pitchCondition = matchPitchCondition(homeSquad, matchFixture, window, matchDate);
    }

    return Response.json({
      save,
      mySquad,
      mySquadId: myInternalId,
      fixture: matchFixture,
      opponentSquad,
      myFormation:  resolvedMyFormation,
      oppFormation: oppFormation ?? defaultFormation,
      myLineup:     myTactics.lineup,
      myTactics,
      injuredReplaced: resolved.injuredReplaced,
      rotationSuggestion: resolved.rotationSuggestion,
      rotationApplied: resolved.rotationApplied,
      oppLineup,
      matchMarking,
      pitchCondition,
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

  // League "Finances" view: AI club tier / budgets / wages, computed server-side (one small row per club).
  "/api/saves/:saveId/leagues/:leagueSlug/ai-finances": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId, leagueSlug } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const meta = await saveService.getMeta(saveId!);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const squads = await saveService.getSquadsInLeague(saveId!, leagueSlug!);
    return Response.json(buildClubFinanceRows(squads, meta.clubId));
  },

  "/api/saves/:saveId/leagues/:leagueSlug/fixtures": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId, leagueSlug } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const fixtures = await saveService.getAllFixturesForLeague(saveId!, leagueSlug!);
    return Response.json(fixtures);
  },

  /** National cup: meta (stages, champion), every fixture, and club names. */
  "/api/saves/:saveId/cups/:cupSlug": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId, cupSlug } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    if (!/^cup_[a-z0-9_]+$/.test(cupSlug!)) return Response.json({ error: "not a cup" }, { status: 400 });
    const meta = await saveService.getLeagueMeta(saveId!, cupSlug!);
    if (!meta?.cup) return Response.json({ error: "cup not found" }, { status: 404 });
    const fixtures = await saveService.getAllFixturesForLeague(saveId!, cupSlug!);
    const index = await saveService.getSquadIndex(saveId!);
    const ids = new Set(fixtures.flatMap((f) => [f.home, f.away]));
    if (meta.cup.championId) ids.add(meta.cup.championId);
    const names = Object.fromEntries([...ids].map((id) => [id, index.byId(id)?.name ?? id]));
    return Response.json({ meta, fixtures, names });
  },

  /**
   * Continental competition (UCL/UEL/Libertadores/Sudamericana): meta (groups, stages, champion),
   * every fixture, club names, and group tables (`groupTable` over each group's own round-1..6
   * fixtures). Mirrors the national-cup route above.
   */
  "/api/saves/:saveId/continental/:slug": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId, slug } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    if (!isContinentalSlug(slug!)) {
      return Response.json({ error: "not a continental competition" }, { status: 400 });
    }
    const meta = await saveService.getLeagueMeta(saveId!, slug!);
    if (!meta?.continental) return Response.json({ error: "continental competition not found" }, { status: 404 });
    const fixtures = await saveService.getAllFixturesForLeague(saveId!, slug!);
    const index = await saveService.getSquadIndex(saveId!);
    const ids = new Set(meta.continental.groups.flatMap((g) => g.clubs));
    for (const f of fixtures) { ids.add(f.home); ids.add(f.away); }
    if (meta.continental.championId) ids.add(meta.continental.championId);
    const names = Object.fromEntries([...ids].map((id) => [id, index.byId(id)?.name ?? id]));
    const groupRounds = meta.continental.stages.find((s) => s.name === "group")?.rounds ?? [];
    const groupFixtures = fixtures.filter((f) => groupRounds.includes(f.round));
    const groups = meta.continental.groups.map((g) => ({ name: g.name, rows: groupTable(g.clubs, groupFixtures) }));
    return Response.json({ meta, fixtures, names, groups });
  },

  /** Top-20 player rankings of one competition (`?competition=<league|cup_x|ucl...>`). */
  "/api/saves/:saveId/stats": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const competition = new URL(req.url).searchParams.get("competition") ?? "";
    if (!/^[a-z0-9_]{1,80}$/.test(competition)) return Response.json({ error: "invalid competition" }, { status: 400 });
    const result = await getCompetitionRankings(saveId!, competition);
    if (result === null) return Response.json({ error: "save not found" }, { status: 404 });
    if (result === "not_found") return Response.json({ error: "competition not found" }, { status: 404 });
    return Response.json(result);
  },

  /** Star kind (gold/blue/green) per player id — badges next to player names. */
  "/api/saves/:saveId/stars": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const stars = await getStarPlayers(saveId!);
    if (!stars) return Response.json({ error: "save not found" }, { status: 404 });
    return Response.json({ stars });
  },

  /**
   * The player's club cash extract for one season: entries, per-kind totals, weekly net, the
   * seasons that have a ledger file, and the current balance. `?season=YYYY` picks a past season;
   * omitted defaults to the player's league's current year. 404 when that season has no ledger
   * file yet (see design spec §2 "Extrato" and §4).
   */
  "/api/saves/:saveId/ledger": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const meta = await saveService.getMeta(saveId!);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

    const seasons = await saveService.listLedgerSeasons(saveId!);
    const url = new URL(req.url);
    const seasonParam = url.searchParams.get("season");
    let season: number;
    if (seasonParam !== null) {
      season = Number(seasonParam);
      if (!Number.isInteger(season)) return Response.json({ error: "invalid season" }, { status: 400 });
    } else {
      const leagueMeta = await saveService.getLeagueMeta(saveId!, meta.leagueSlug);
      season = leagueMeta?.year ?? NaN;
    }
    if (!Number.isInteger(season) || !seasons.includes(season)) {
      return Response.json({ error: "ledger not found" }, { status: 404 });
    }

    const entries = await saveService.getLedger(saveId!, season);
    const squad = await saveService.getSquadById(saveId!, meta.clubId);
    const balance = squad ? getClubBudget(squad) : 0;
    // A season that changed club (`.claude/rules/game/jobs.md`): totals and the weekly chart are the
    // current club's only, from the last arrival on; the entries list stays complete.
    const lastArrival = entries.findLastIndex((e) => e.kind === "club_change" && e.ref?.stage === "arrive");
    const atCurrentClub = lastArrival >= 0 ? entries.slice(lastArrival) : entries;

    return Response.json({
      season,
      seasons,
      entries,
      totals: totalsByKind(atCurrentClub),
      weekly: weeklyNet(atCurrentClub.filter((e) => e.kind !== "club_change")),
      balance,
    });
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
