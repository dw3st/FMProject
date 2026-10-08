/**
 * Season rollover smoke test: a whole season, day by day, through the per-country rollover.
 *
 * Creates a career the way the new-game wizard does (createSave + applyBroadcasting +
 * applyRandomStartKit — same as bench-advance-day / membership-smoke) and advances it with
 * `runBufferedDay` — the exact unit of work of POST /api/advance-day and of each day of
 * POST /api/saves/:id/advance-until — until the player's country has rolled over, then 2 more days.
 *
 * Checks (exit 1 on any failure):
 *   - currentDate moves exactly one day per call (no date jump);
 *   - league membership only changes on the day that league's own country rolls, and never
 *     for a league outside every pyramid;
 *   - for every pyramid country that rolled: each group's bottom `relegate` clubs went one tier
 *     down, its top `promote` clubs one tier up, nobody else moved (tables from the archive);
 *   - the rollover payload (seasonEnded/moves/playerMove/playerChampionOf) matches what moved;
 *   - England: PL 20 / Championship 24, 3 down, 3 up; Italy: each Serie C group got exactly 1
 *     club from Serie B and sent its champion up;
 *   - 1273 squad files, no duplicate ids, no index duplicates;
 *   - every rolled league: new calendar has exactly its new clubs, each with 2 × (n − 1) games,
 *     zeroed standings with the same clubs; the closed season had every fixture dated ≤ its end
 *     played, and no fixture dated after its end (it would be lost at the rollover);
 *   - player club: age + 1, budget got the broadcasting credit, inbox season news;
 *   - at the end: no league has a fixture dated before currentDate that is still unplayed.
 *
 * The save is always deleted at the end.
 *
 * Run:  bun scripts/season-rollover-smoke.ts [--player-league <slug>] [--italy]
 *       (--italy = --player-league serie_a)
 */
import { fileURLToPath } from "node:url";
import { readdir } from "fs/promises";
import { seasonLabel } from "@/Domain/history/history";
import { rankManagers } from "@/Domain/managers/managers";

// Windows-safe default for the runtime dir; must be set before backend modules load.
process.env.RUNTIME_DATA_DIR ||= fileURLToPath(new URL("../src/Data", import.meta.url));

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PLAYER_LEAGUE = args.includes("--italy") ? "serie_a" : argValue("--player-league") ?? "premier_league";
const EXTRA_DAYS = 2;
const EXPECTED_SQUAD_FILES = 1273; // world size after the 2026/27 ESPN season import
const MAX_DAYS = 500;

const { SaveService, saveService } = await import("@/backend/SaveService");
const { FileSystemDAL } = await import("@/backend/dal/FileSystemDAL");
const { runBufferedDay, getPyramids } = await import("@/backend/advanceDay");
const { applyRandomStartKit } = await import("@/backend/startKits");
const { applyBroadcasting } = await import("@/backend/FinancialService");
const { RUNTIME_DATA_DIR } = await import("@/backend/runtimeDir");
const { pyramidByLeague, pyramidLeagueSlugs, tierOfLeague } = await import("@/Domain/season/countryRollover");
const { computeAdvanceDayMoney } = await import("@/Domain/advanceDay/financial");
const { addDays, addOneDay, daysBetween } = await import("@/Domain/dates");
const { applyHumanSeasonReaction, clubSeasonOutcome } = await import("@/Domain/aiFinance/seasonReaction");
const { applyTierFinanceChange } = await import("@/Domain/advanceDay/tierFinances");
const { continentalGoodClubsThisSeason } = await import("@/backend/continentalWorld");
const { isCupSlug } = await import("@/Domain/cups/cupIds");
const { isContinentalSlug, competitionsOf } = await import("@/Domain/continental/competitions");
const { totalsByKind } = await import("@/Domain/finance/ledger");
const { aiTransferBudgetOf, seasonalTransferBudgetFor, popularityOf } = await import("@/Domain/aiFinance/aiClubFinance");
const { AI_FINANCE_CONFIG } = await import("@/Domain/aiFinance/aiFinanceConfig");
const { leaguePrize } = await import("@/Domain/finance/prizes");
const { autoLineupDefaultFormation, resolveUserLineup } = await import("@/Domain/advanceDay/matchSimulationLineups");
const { isInjured } = await import("@/Domain/injury/injury");
const { isSuspended } = await import("@/Domain/discipline/discipline");
const { Player } = await import("@/Domain/Player");
const { variantFitsRole: ROLE_VARIANT_FITS } = await import("@/GameEngine/Configs/RoleVariantConfig");
const { followersAfterMood, stadiumFillRate } = await import("@/Domain/boardFans/boardFans");
const { gateRevenue } = await import("@/Domain/finance/gate");
type ClubMove = import("@/types/pyramidTypes").ClubMove;
type CountryPyramid = import("@/types/pyramidTypes").CountryPyramid;
type LeagueSeasonState = import("@/types/calendarTypes").LeagueSeasonState;
type Squad = import("@/types/playerTypes").Squad;
type SeasonArchive = import("@/types/calendarTypes").SeasonArchive;
type Fixture = import("@/types/calendarTypes").Fixture;
type LedgerEntry = import("@/Domain/finance/ledger").LedgerEntry;

type LeagueEntry = { slug: string; name: string; standings: Array<{ squadId: string; name?: string; colors?: [string, string] }> };
const leagueData = (await Bun.file(`${RUNTIME_DATA_DIR}/leagueData.json`).json()) as LeagueEntry[];
const databases = (await Bun.file(`${RUNTIME_DATA_DIR}/databases.json`).json()) as Array<{
  id: string; name: string; version: string; startDate: string;
}>;

const failures: string[] = [];
function check(ok: boolean, label: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
}

const fsDal = new FileSystemDAL();
/** Fresh service per read: nothing cached across days. */
const plain = () => new SaveService(new FileSystemDAL());

async function createSmokeSave(): Promise<string> {
  const lg = leagueData.find((l) => l.slug === PLAYER_LEAGUE);
  const club = lg?.standings[0];
  if (!lg || !club) throw new Error(`${PLAYER_LEAGUE} not found in leagueData`);
  const db = databases[0]!;
  const meta = await saveService.createSave({
    leagueSlug: lg.slug,
    leagueName: lg.name,
    clubId: club.squadId,
    clubName: club.name ?? club.squadId,
    clubColors: club.colors ?? ["#888888", "#ffffff"],
    database: { id: db.id, name: db.name, version: db.version, startDate: db.startDate },
    manager: { name: "Smoke Manager", nationalityIso: "gb", backgroundId: "former-player" },
    // Sacking off: a full season must run to the end; the section "Diretoria" checks it never sacks.
    sackingEnabled: false,
  });
  await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId);
  const kit = await applyRandomStartKit(meta.id);
  console.log(`Save ${meta.id} — ${club.name} (${lg.name}), start ${meta.currentDate}, kit: ${kit.applied ? kit.kit : kit.reason}\n`);
  return meta.id;
}

/** league → sorted file stems, straight from the folders (cheap; the membership truth). */
async function folderMembership(saveId: string): Promise<Map<string, string>> {
  const root = `${RUNTIME_DATA_DIR}/saves/${saveId}/squads`;
  const out = new Map<string, string>();
  for (const league of await readdir(root)) {
    const stems = (await readdir(`${root}/${league}`)).filter((f) => f.endsWith(".json")).sort();
    out.set(league, stems.join(","));
  }
  return out;
}

/** squadId → league, from a fresh index. */
async function idMembership(saveId: string): Promise<Map<string, string>> {
  const index = await plain().getSquadIndex(saveId);
  const out = new Map<string, string>();
  for (const slug of index.leagues()) for (const t of index.inLeague(slug)) out.set(t.squadId, slug);
  return out;
}

async function checkFiles(saveId: string, when: string): Promise<void> {
  const svc = plain();
  const files = await svc.listSquadFiles(saveId);
  const ids = files.map((f) => f.squad.id);
  check(files.length === EXPECTED_SQUAD_FILES, `${when}: ${files.length} squad files (expected ${EXPECTED_SQUAD_FILES})`);
  check(new Set(ids).size === ids.length, `${when}: no duplicate squad ids (${ids.length - new Set(ids).size} dupes)`);
  const dups = (await svc.getSquadIndex(saveId)).duplicates();
  check(dups.length === 0, `${when}: index reports no duplicates (${dups.length})`);
}

interface ClosedSeasonCapture { year: number; end: string; date: string; unplayedPast: number; today: number; afterEnd: number; total: number }

let saveId: string | null = null;
const t0 = performance.now();
try {
  saveId = await createSmokeSave();
  const pyramids = await getPyramids();
  const byLeague = pyramidByLeague(pyramids);
  const countryOf = (slug: string) => byLeague.get(slug)?.country ?? null;
  const playerCountry = countryOf(PLAYER_LEAGUE);
  const meta0 = (await plain().getMeta(saveId))!;
  const index0 = await plain().getSquadIndex(saveId);
  const playerSquadId = index0.byId(meta0.clubId)?.squadId
    ?? index0.inLeague(PLAYER_LEAGUE).find((t) => t.slug === meta0.clubId)?.squadId
    ?? meta0.clubId;
  const playerCountrySlugs = new Set(playerCountry ? pyramidLeagueSlugs(pyramids[playerCountry]!) : [PLAYER_LEAGUE]);
  console.log(`Player club ${playerSquadId}, country ${playerCountry ?? "(no pyramid)"}: ${[...playerCountrySlugs].join(", ")}\n`);
  await checkFiles(saveId, "fresh save");

  // Rotation assistant ON for the player's club, with a stat-only XI saved as its lineup.
  const { formationForSimId, DEFAULT_SIM_FORMATION_ID } = await import("@/Domain/matchFormations");
  const rotFormation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  let rotationDiffered = false;
  // Diretoria (`.claude/rules/game/board-fans.md`): meters every day, objectives seen, never sacked.
  const boardTrack = {
    days: 0, outOfRange: 0, ended: false,
    boardMin: Infinity, boardMax: -Infinity, fansMin: Infinity, fansMax: -Infinity,
    objectiveSeasons: new Set<string>(),
  };
  {
    const sq = (await plain().getSquadById(saveId, playerSquadId))!;
    await plain().saveTactics(saveId, {
      formation: DEFAULT_SIM_FORMATION_ID,
      tactical_style: "balanced",
      lineup: autoLineupDefaultFormation(sq),
      assistantRotation: true,
    });
  }
  // Negociação (`.claude/rules/game/negotiation.md`): two bench players on the sell list and one on
  // the loan list, so AI clubs send bids to the inbox during the run (never sold on their own).
  const negoListed: { sale: string[]; loan: string[] } = { sale: [], loan: [] };
  const negoMessages = new Map<string, string>(); // inbox message id -> kind
  {
    const sq = (await plain().getSquadById(saveId, playerSquadId))!;
    const xi = new Set(autoLineupDefaultFormation(sq));
    const bench = sq.players.filter((p) => !xi.has(p.id) && p.positions[0] !== "GK");
    negoListed.sale = bench.slice(0, 2).map((p) => p.id);
    negoListed.loan = bench.slice(2, 3).map((p) => p.id);
    const mk = (await plain().getMarket(saveId))!;
    await plain().saveMarket(saveId, {
      ...mk,
      playerSellList: negoListed.sale.map((playerId) => ({ playerId, priority: 1 })),
      playerLoanList: negoListed.loan,
    });
  }

  // Instalações (`.claude/rules/game/facilities.md`): a happy board (forced to 90 for the request,
  // then put back) approves a +1000-seat stand, funding part of it; it finishes within the run.
  const facTrack: { approved: boolean; projectId: string | null; cost: number; boardShare: number; seatsBefore: number } = {
    approved: false, projectId: null, cost: 0, boardShare: 0, seatsBefore: 0,
  };
  {
    const { apiRoutes } = await import("@/backend/routes");
    const { devAutoLogin } = await import("@/backend/auth/AuthService");
    const { recordSaveOwnership } = await import("@/backend/auth/saveOwnership");
    const { recordMoney } = await import("@/backend/FinancialService");
    // The save has a single owner row: this user is reused by the reborn/negotiation/jobs sections below.
    const { user, session } = devAutoLogin("smoke-reborn@test.local");
    recordSaveOwnership(saveId, user.id);
    const m = (await plain().getMeta(saveId))!;
    const sq = (await plain().getSquadById(saveId, playerSquadId))!;
    facTrack.seatsBefore = sq.venue?.capacity ?? 0;
    // Enough cash for any seat price (<= EUR 6k x 1000), recorded through the ledger like any money.
    if ((sq.finances?.budget ?? 0) < 6_000_000) {
      const e = index0.byId(playerSquadId)!;
      await recordMoney(plain(), saveId, (await plain().getLeagueMeta(saveId, PLAYER_LEAGUE))!.year,
        { leagueSlug: e.leagueSlug, clubSlug: e.stem },
        { date: m.currentDate!, kind: "board_funding", amount: 6_000_000, label: "Smoke: facilities funding", ref: { facility: "stand" } });
    }
    const boardBefore = m.board!;
    await plain().updateMeta(saveId, { board: { ...boardBefore, board: 90 } });
    const handler = apiRoutes["/api/saves/:saveId/facilities/request" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    const res = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/facilities/request`, {
        method: "POST", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
        body: JSON.stringify({ kind: "stand", stand: "east", seats: 1000 }),
      }),
      { params: { saveId } },
    ));
    const body = await res.json() as { approved?: boolean; boardShare?: number; project?: { id: string; cost: number } };
    await plain().updateMeta(saveId, { board: boardBefore });
    facTrack.approved = res.status === 200 && body.approved === true;
    facTrack.projectId = body.project?.id ?? null;
    facTrack.cost = body.project?.cost ?? 0;
    facTrack.boardShare = body.boardShare ?? 0;
    console.log(`Instalações: +1000 seats requested → ${res.status} ${JSON.stringify({ approved: body.approved, boardShare: body.boardShare, cost: facTrack.cost })}\n`);
  }

  // Instruções (`.claude/rules/game/player-instructions.md`): the human club plays the season with
  // inverted full-backs, a target man (pivô) and a midfielder pressing more, set through the tactics route;
  // the instructions survive a formation change (sanitized), and every match day it man-marks the
  // opponent's best outfield player (cleared by the next advance).
  const instrTrack = {
    putOk: false, sanitized: false, restored: false,
    markDays: 0, markOk: 0, markLeftOver: 0, pendingMarkDate: null as string | null,
  };
  const { saveRoutes: instrSaveRoutes } = await import("@/backend/saves");
  const { devAutoLogin: instrLogin } = await import("@/backend/auth/AuthService");
  // The save's single owner row was recorded above (smoke-reborn); a new session of the same user.
  const instrSession = instrLogin("smoke-reborn@test.local").session;
  const instrCall = async (route: string, path: string, body: unknown) => {
    const handler = (instrSaveRoutes as Record<string, (r: Request & { params: Record<string, string> }) => Promise<Response>>)[route]!;
    return handler(Object.assign(new Request(`http://localhost${path}`, {
      method: route.endsWith("/tactics") ? "PUT" : "POST",
      headers: { cookie: `fs_session=${instrSession.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }), { params: { id: saveId } }) as Request & { params: Record<string, string> });
  };
  const instrList = rotFormation.attacking.map((s, i) => {
    if (s.role === "LB" || s.role === "RB") return { variant: "fb_inverted" };
    if (s.role === "ST") return { variant: "st_target" };
    if (s.role === "CM" && rotFormation.attacking.findIndex((x) => x.role === "CM") === i) return { press: "more" };
    return null;
  });
  {
    const tacticsPath = `/api/saves/${saveId}/tactics`;
    instrTrack.putOk = (await instrCall("/api/saves/:id/tactics", tacticsPath, { slotInstructions: instrList })).status === 200;
    // A formation without full-backs keeps only what still fits (the pressing, the ST variant).
    await instrCall("/api/saves/:id/tactics", tacticsPath, { formation: "3-5-2" });
    const f352 = formationForSimId("3-5-2");
    const kept = (await plain().getTactics(saveId))?.slotInstructions ?? [];
    instrTrack.sanitized = kept.every((ins, i) => !ins?.variant || ROLE_VARIANT_FITS(ins.variant, f352.attacking[i]!.role));
    instrTrack.restored = (await instrCall("/api/saves/:id/tactics", tacticsPath, { formation: DEFAULT_SIM_FORMATION_ID, slotInstructions: instrList })).status === 200;
  }

  // Olheiros (`.claude/rules/game/scouting.md`): two field scouts hired; a foreign-country mission (chief),
  // a player mission (a foreign star) and a youth mission; a shortlist of foreign players whose contracts
  // end within ~6-10 months (a contract_ending alert falls inside the run).
  const scoutTrack = {
    setupOk: false, playerTarget: "", playerTargetSquad: "", playerScout: "", playerMaxK: 0, mondays: 0, travelMissing: [] as string[], reports: 0,
    prospectSigned: false, prospectChecks: [] as string[], kinds: new Set<string>(),
    // Scouting reports are a default-off inbox topic (`.claude/rules/game/responsibilities.md`): the
    // smoke first checks no report message lands, then switches the topic on for the checks below.
    reportsOn: false, reportsHiddenOk: false, reportsLeaked: 0,
    // Country knowledge (4.9): the chief's knowledge of the foreign country before its mission, and the
    // last Monday the mission worked (from the stored entry).
    chiefId: "", foreign: "", chiefKBefore: -1, chiefLast: "",
  };
  const { apiRoutes: scoutApi } = await import("@/backend/routes");
  const { countryKnowledgeOf, baseCountryKnowledge } = await import("@/Domain/scouting/countryKnowledge");
  const { headOf } = await import("@/Domain/staff/staff");
  const scoutSession = instrLogin("smoke-reborn@test.local").session;
  const scoutCall = async (route: string, method: string, body?: unknown, params: Record<string, string> = {}) => {
    const handler = (scoutApi as unknown as Record<string, (r: Request & { params: Record<string, string> }) => Promise<Response>>)[route]!;
    return handler(Object.assign(new Request(`http://localhost${route.replace(":saveId", saveId!)}`, {
      method, headers: { cookie: `fs_session=${scoutSession.token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }), { params: { saveId: saveId!, ...params } }) as Request & { params: Record<string, string> });
  };
  const scoutApiGet = async (url: string) => {
    const handler = (scoutApi as unknown as Record<string, (r: Request & { params: Record<string, string> }) => Promise<Response>>)["/api/saves/:saveId/staff/pool"]!;
    return handler(Object.assign(new Request(`http://localhost${url}`, {
      method: "GET", headers: { cookie: `fs_session=${scoutSession.token}` },
    }), { params: { saveId: saveId! } }) as Request & { params: Record<string, string> });
  };
  {
    const lc = new Map((leagueData as Array<LeagueEntry & { country?: string }>).map((l) => [l.slug, l.country ?? ""]));
    const ownCountry = lc.get(PLAYER_LEAGUE) ?? "";
    const foreign = ownCountry === "Spain" ? "England" : "Spain";
    const foreignLeague = foreign === "Spain" ? "la_liga" : "premier_league";
    const today = (await plain().getMeta(saveId))!.currentDate!;
    // Field scouts come from the coaching-staff pool (`.claude/rules/game/staff.md`): the two best listed.
    const poolRes = await scoutApiGet(`/api/saves/${saveId}/staff/pool?role=fieldScout&sort=stars&limit=2`);
    const pool = await poolRes.json() as { items: Array<{ id: string }> };
    const hired: string[] = [];
    for (const c of pool.items) {
      if ((await scoutCall("/api/saves/:saveId/staff/hire", "POST", { memberId: c.id, years: 1 })).status === 200) hired.push(c.id);
    }
    const index = await plain().getSquadIndex(saveId);
    const foreignSquads = (await Promise.all(index.inLeague(foreignLeague).map((t) => plain().getSquadById(saveId!, t.squadId))))
      .filter((x): x is Squad => !!x);
    const star = foreignSquads.flatMap((sq) => sq.players.map((p) => ({ p, sq })))
      .sort((a, b) => Player.computeOverallAvg(b.p) - Player.computeOverallAvg(a.p))[0]!;
    scoutTrack.playerTarget = star.p.id;
    scoutTrack.playerTargetSquad = star.sq.id;
    scoutTrack.playerScout = hired[0] ?? "";
    const statuses = [
      (await scoutCall("/api/saves/:saveId/scouting/missions", "POST", { scoutId: "chief", target: { kind: "country", country: foreign }, weeks: 12 })).status,
      (await scoutCall("/api/saves/:saveId/scouting/missions", "POST", { scoutId: hired[0], target: { kind: "player", playerId: star.p.id, squadId: star.sq.id }, weeks: 3 })).status,
      (await scoutCall("/api/saves/:saveId/scouting/missions", "POST", { scoutId: hired[1], target: { kind: "youth", country: foreign }, weeks: 8 })).status,
    ];
    const ending = foreignSquads.flatMap((sq) => sq.players.map((p) => ({ p, sq })))
      .filter(({ p }) => p.contract && p.contract.until > addDays(today, 200) && p.contract.until < addDays(today, 320) && !p.loan)
      .slice(0, 5);
    for (const { p, sq } of ending) await scoutCall("/api/saves/:saveId/scouting/shortlist", "POST", { playerId: p.id, squadId: sq.id });
    scoutTrack.setupOk = hired.length === 2 && statuses.every((s) => s === 200) && ending.length > 0;
    const chiefNow = headOf((await plain().getSquadById(saveId, playerSquadId))!, "scout");
    if (chiefNow) {
      scoutTrack.chiefId = chiefNow.id;
      scoutTrack.foreign = foreign;
      scoutTrack.chiefKBefore = countryKnowledgeOf(chiefNow, foreign, today);
    }
    console.log(`Olheiros: field scouts ${hired.length}, missions ${statuses.join("/")}, shortlist ${ending.length}, target ${star.p.name}\n`);
  }

  // Equipe técnica (`.claude/rules/game/staff.md`): the analyst's contract is forced to end inside the
  // season (the director, responsible by default, must renew it), a coach is dismissed in the first month
  // through the route and another hired from the free pool, the Monday staff line is compared with the
  // contracts, and the starting goalkeeper's reflex/jump are recorded (the Goalkeeping area trains them).
  const staffTrack = {
    forcedId: "", forcedKinds: new Set<string>(),
    firedId: "", firedDone: false, fireStatus: 0, hireStatus: 0, hiredId: "", severance: 0,
    gkId: "", gkReflex: 0, gkJump: 0,
    mondays: 0, mondayMismatch: [] as string[],
  };
  {
    const sq0 = (await plain().getSquadById(saveId, playerSquadId))!;
    const meta0s = (await plain().getMeta(saveId))!;
    const today = meta0s.currentDate!;
    const seasonEnd = meta0s.activeLeagues?.find((l) => l.leagueSlug === meta0s.leagueSlug)?.end ?? addDays(today, 120);
    const analyst = sq0.staff?.members.find((m) => m.role === "analyst");
    if (analyst?.contract) {
      staffTrack.forcedId = analyst.id;
      const until = [addDays(today, 75), addDays(seasonEnd, -7)].sort()[0]!;
      const { decision: _decision, ...contract } = analyst.contract;
      const members = sq0.staff!.members.map((m) => (m.id === analyst.id ? { ...m, contract: { ...contract, until } } : m));
      await plain().saveSquadById(saveId, { ...sq0, staff: { ...sq0.staff!, members } });
    }
    const gk = sq0.players.filter((p) => p.positions[0] === "GK")
      .sort((a, b) => Player.computeOverallAvg(b) - Player.computeOverallAvg(a))[0];
    if (gk) {
      staffTrack.gkId = gk.id;
      staffTrack.gkReflex = gk.stats.reflex ?? 0;
      staffTrack.gkJump = gk.stats.jump ?? 0;
    }
    console.log(`Equipe técnica: analyst forced to end ${staffTrack.forcedId ? "ok" : "MISSING"}, goalkeeper ${gk?.name ?? "none"}\n`);
  }

  // Cup year per country at creation — used later to detect which cups got regenerated.
  const cupYearsStart = new Map<string, number>();
  for (const slug of (await plain().listCompetitionSlugs(saveId)).filter(isCupSlug)) {
    const cm = await plain().getLeagueMeta(saveId, slug);
    if (cm?.cup) cupYearsStart.set(cm.cup.country, cm.year);
  }
  check(cupYearsStart.size > 0, `${cupYearsStart.size} national cup(s) generated at career creation`);

  // Continental competition years at creation — used later to detect which continent regenerated.
  const continentalYearsStart = new Map<string, number>(); // slug -> year
  for (const slug of (await plain().listCompetitionSlugs(saveId)).filter(isContinentalSlug)) {
    const cm = await plain().getLeagueMeta(saveId, slug);
    if (cm?.continental) continentalYearsStart.set(slug, cm.year);
  }
  check(continentalYearsStart.size === 4, `${continentalYearsStart.size} continental competition(s) generated at career creation (expected 4)`);

  const startDate = meta0.currentDate!;
  const startMembership = await idMembership(saveId);
  let folders = await folderMembership(saveId);
  const captures = new Map<string, ClosedSeasonCapture>(); // league → last capture before its roll
  const rolls: Array<{ date: string; leagues: string[] }> = [];
  const rolledCountries = new Map<string, { date: string; before: Map<string, string>; after: Map<string, string>; closed: Map<string, number> }>();
  let playerRollDay: string | null = null;
  let daysAfterRoll = 0;
  let days = 0;
  let dayMsTotal = 0;
  let matchDayMs = 0;
  let matchDays = 0;

  // ── Fôlego (see "Fôlego" section below) ──────────────────────────────────
  // Sampled on every player-club match day, before that day's matches are played, so the
  // fitness read is the starting fitness the fitness-aware XI selector actually saw.
  const oppFitnessSamples: Array<{ month: string; value: number }> = [];
  const leagueFitnessSamples: Array<{ month: string; value: number }> = [];
  let fitnessDifferedFromPlain = false;

  // ── Lesões (see "Lesões" section below) ───────────────────────────────────
  let totalMatchesLogged = 0;
  let totalMatchInjuries = 0;
  let injuredXIChecks = 0;
  let injuredXIViolations = 0;
  const trackedInjured = new Map<string, string>(); // playerId → returnDate last observed
  let healedObserved = 0;

  // ── Disciplina (see "Disciplina" section below) ──────────────────────────
  let discMatches = 0;
  const disc = { fouls: 0, yellows: 0, reds: 0, penalties: 0 };
  let suspendedXIChecks = 0;
  let suspendedXIViolations = 0;
  const trackedSuspended = new Map<string, number>(); // playerId → matches left last observed
  let suspensionsServedObserved = 0;

  // ── Contratos (see "Contratos" section below) ────────────────────────────
  // Contract end per player at career start; weekly-wage ledger line vs the sum of contracts.
  const startContractUntil = new Map<string, string>();
  for (const { squad } of await plain().listSquadFiles(saveId)) {
    for (const p of squad.players) if (p.contract) startContractUntil.set(p.id, p.contract.until);
  }
  const ROLE_MINIMUMS: Record<string, number> = { GK: 3, Defender: 7, Midfielder: 7, Forward: 4 };
  const { getMainRole: mainRoleOf } = await import("@/Domain/roles");
  let rollSquadsChecked = 0;
  const rollUnderMinimum: string[] = [];
  let wageLineChecks = 0;
  const wageLineMismatches: string[] = [];

  // ── Moral (see "Moral" section below, `.claude/rules/game/morale.md`) ────
  const moraleTrack = {
    days: 0, outOfRange: 0, missing: 0, min: Infinity, max: -Infinity,
    talksSeen: new Set<string>(), answered: [] as string[], resolved: new Set<string>(),
  };
  const { answerTalk } = await import("@/Domain/morale/morale");

  // ── Responsabilidades (see "Responsabilidades" section below) ──
  // The director (default) handles contracts; manager news is a default-off inbox topic.
  const respTrack = {
    summaries: new Set<string>(), expiring: new Set<string>(), managerNews: new Set<string>(),
    contractTalks: new Set<string>(), renewed: 0,
  };

  // ── Mercado vivo (see "Mercado vivo" section below, `.claude/rules/game/transfer-windows.md`) ──
  const { loadWindowContext } = await import("@/backend/marketWindowWorld");
  const { managerInvariantBreaks } = await import("@/Domain/managers/aiManagers");
  const livelyTrack = {
    moves: 0, outside: [] as string[], kinds: new Set<string>(),
    managerChecks: 0, invariantBreaks: [] as string[], openPassagesWithLeft: 0, closedWithoutLeft: 0, orphanInterims: [] as string[],
    vacancySince: new Map<string, string>(), vacancyFilled: 0, vacancyLate: [] as string[],
  };

  // ── Prêmios (see "Prêmios" section below, `.claude/rules/game/awards.md`) ──
  const { AWARDS } = await import("@/Domain/awards/awardsConfig");
  const { awardKindsByPlayer } = await import("@/Domain/awards/awardEffects");
  const awardsTrack = {
    leagues: 0, missing: [] as string[], xiBad: [] as string[], minAppsBad: [] as string[], xiComplement: 0,
    youngBad: [] as string[], gkBad: [] as string[], scorerBad: [] as string[],
    goalInQuick: [] as string[], goalMissing: [] as string[], goalLeagues: 0,
    rowMissing: [] as string[], boostMissing: [] as string[], boostReleased: 0, moraleUp: 0, moraleApplied: 0, moraleMissing: [] as string[],
    managerMissing: [] as string[], playerMessage: null as boolean | null,
  };
  async function checkAwardsOfDay(
    date: string, rolled: string[], before: LeagueSeasonState[], prePlayer: Squad | null,
    engineLeagues: Set<string>, playerLeague: string,
  ): Promise<void> {
    const svcA = plain();
    const saveIdA = saveId!;
    const file = await svcA.getAwardsYear(saveIdA, Number(date.slice(0, 4)));
    // Every player of the world (squads, free agents, retired) with his history rows.
    type Holder = { age: number | null; positions: string[]; history?: Squad["players"][number]["history"]; awardBoost?: unknown; squadId: string | null };
    const holders = new Map<string, Holder>();
    for (const sq of await svcA.getAllSquads(saveIdA)) {
      for (const p of sq.players) holders.set(p.id, { age: p.age - 1, positions: p.positions, history: p.history, awardBoost: p.awardBoost, squadId: sq.id });
    }
    for (const f of await svcA.getFreeAgents(saveIdA)) {
      if (!holders.has(f.player.id)) holders.set(f.player.id, { age: f.player.age - 1, positions: f.player.positions, history: f.player.history, squadId: null });
    }
    for (const r of await svcA.getRetired(saveIdA)) {
      if (!holders.has(r.id)) holders.set(r.id, { age: null, positions: r.positions, history: r.history, squadId: null });
    }
    const postPlayer = prePlayer ? await svcA.getSquadById(saveIdA, playerSquadId) : null;
    // Players signed from the free pool today (rollover refill, free-agent tick).
    const signedFreeToday = new Set(((await svcA.getDayLog(saveIdA, date))?.transfers ?? []).filter((m) => m.kind === "free").map((m) => m.playerId));
    const managers = await svcA.getManagers(saveIdA);
    for (const slug of rolled) {
      const b = before.find((l) => l.leagueSlug === slug);
      if (!b) continue;
      const season = seasonLabel(b.year, b.start, b.end);
      const entry = file?.leagues.find((l) => l.league === slug && l.season === season);
      if (!entry) { awardsTrack.missing.push(`${slug} ${season}`); continue; }
      awardsTrack.leagues++;
      const tag = `${slug} ${season}`;
      // The closing row (not a partial of an earlier club of the same league): the one the awards go on.
      const rowOf = (id: string) => {
        const rows = holders.get(id)?.history?.filter((r) => r.season === season && r.league === slug) ?? [];
        return rows.find((r) => !r.partial) ?? rows[0];
      };
      const leagueApps = (id: string) => { const r = rowOf(id); return r ? r.apps - r.cupApps - r.contApps : -1; };
      const minApps = Math.ceil(b.totalRounds * AWARDS.MIN_ROUNDS_SHARE);
      // XI: 11 unique players in the 4-3-3 slots (the complement below the minimum is only counted).
      const ids = entry.teamOfSeason.map((p) => p.playerId);
      const slots = entry.teamOfSeason.map((p) => p.slot ?? "").sort().join(",");
      if (ids.length !== 11 || new Set(ids).size !== 11 || slots !== [...AWARDS.XI_SLOTS].sort().join(",")) awardsTrack.xiBad.push(tag);
      awardsTrack.xiComplement += ids.filter((id) => leagueApps(id) < minApps).length;
      for (const [k, p] of [["best", entry.bestPlayer], ["young", entry.youngPlayer], ["gk", entry.bestGoalkeeper]] as const) {
        if (p && leagueApps(p.playerId) < minApps) awardsTrack.minAppsBad.push(`${tag} ${k} ${p.name} (${leagueApps(p.playerId)} < ${minApps})`);
      }
      if (entry.youngPlayer) {
        const age = holders.get(entry.youngPlayer.playerId)?.age;
        if (age !== null && age !== undefined && age > AWARDS.YOUNG_MAX_AGE) awardsTrack.youngBad.push(`${tag} ${entry.youngPlayer.name} (${age})`);
      }
      if (entry.bestGoalkeeper && holders.get(entry.bestGoalkeeper.playerId)?.positions[0] !== "GK") awardsTrack.gkBad.push(`${tag} ${entry.bestGoalkeeper.name}`);
      if (entry.topScorer) {
        let max = 0;
        for (const h of holders.values()) for (const r of h.history ?? []) {
          if (r.season === season && r.league === slug) max = Math.max(max, r.goals - r.cupGoals - r.contGoals);
        }
        if (entry.topScorer.value !== max) awardsTrack.scorerBad.push(`${tag} ${entry.topScorer.name} ${entry.topScorer.value} != ${max}`);
      }
      // Goal of the season: only in the full-engine leagues, and there whenever a candidate exists.
      if (!engineLeagues.has(slug)) {
        if (entry.goalOfSeason) awardsTrack.goalInQuick.push(tag);
      } else {
        const goals = (await svcA.getSeasonGoals(saveIdA, slug, b.year))?.goals ?? [];
        if (goals.length > 0 && !entry.goalOfSeason) awardsTrack.goalMissing.push(tag);
        if (entry.goalOfSeason) awardsTrack.goalLeagues++;
      }
      // Each winner: the award on his row; the value boost (value-boosting awards); morale on the human club.
      for (const [id, kinds] of awardKindsByPlayer(entry)) {
        const row = rowOf(id);
        if (!row || !kinds.every((k) => row.awards?.some((a) => a.kind === k && a.league === slug))) awardsTrack.rowMissing.push(`${tag} ${id}`);
        const h = holders.get(id);
        if (h?.squadId && kinds.some((k) => AWARDS.VALUE_MULT[k] !== undefined) && !h.awardBoost) {
          // The boost lives until the next rollover of his league, and `toFreeAgent` drops it: a
          // winner released at contract expiry (passo 8, after the awards) and re-signed from the
          // free pool the same day — by another club or his own — has none, by the rule. The day
          // log's `free` moves prove the re-signing; anyone else must have the boost.
          if (signedFreeToday.has(id)) awardsTrack.boostReleased++;
          else awardsTrack.boostMissing.push(`${tag} ${id}${row && h.squadId !== row.squadId ? ` (${row.squadId} -> ${h.squadId})` : ""}`);
        }
        if (prePlayer && postPlayer && h?.squadId === playerSquadId && kinds.some((k) => AWARDS.MORALE[k] !== undefined)) {
          // The award event is on his morale log (the day's drift and other events can still pull a
          // morale near 100 down, so the final value is only reported).
          const p1 = postPlayer.players.find((p) => p.id === id);
          const m0 = prePlayer.players.find((p) => p.id === id)?.morale ?? 65;
          const m1 = p1?.morale ?? 65;
          if (p1?.moraleLog?.awards?.includes(`league:${slug}:${season}`)) awardsTrack.moraleApplied++;
          else awardsTrack.moraleMissing.push(`${id} ${m0} -> ${m1}`);
          if (m1 > m0) awardsTrack.moraleUp++;
        }
      }
      const bm = entry.bestManager;
      if (bm && !managers.find((m) => m.id === bm.managerId)?.awards?.some((a) => a.kind === "best_manager" && a.competition === slug && a.season === season)) {
        awardsTrack.managerMissing.push(`${tag} ${bm.managerId}`);
      }
      if (slug === playerLeague) {
        awardsTrack.playerMessage = (await svcA.getInbox(saveIdA)).some((m) => m.id === `awards-league-${slug}-${season}`);
      }
    }
  }

  for (let guard = 0; guard < MAX_DAYS; guard++) {
    const svc = plain();
    const meta = (await svc.getMeta(saveId))!;
    const date = meta.currentDate!;
    const leaguesBefore = (meta.activeLeagues ?? []) as LeagueSeasonState[];
    const ending = leaguesBefore.filter((l) => date >= l.end);

    // Candidate rollover day: capture the closed season + the player squad before the day.
    let preIndex: Map<string, string> | null = null;
    let prePlayerSquad: Squad | null = null;
    // Continental final/title status as advanceDay reads it at the rollover (before the continental
    // metas are regenerated later the same day) — the human followers reaction depends on it.
    let preContinental: { good: Set<string>; title: Set<string> } | undefined;
    let prePlayerFixtures: import("@/types/calendarTypes").Fixture[] = [];
    if (ending.length > 0) {
      preIndex = await idMembership(saveId);
      for (const l of ending) {
        const fx = await svc.getAllFixturesForLeague(saveId, l.leagueSlug);
        captures.set(l.leagueSlug, {
          year: l.year, end: l.end, date,
          unplayedPast: fx.filter((f) => !f.played && f.date < date).length,
          today: fx.filter((f) => !f.played && f.date === date).length,
          afterEnd: fx.filter((f) => f.date > l.end).length,
          total: fx.length,
        });
      }
      if (ending.some((l) => playerCountrySlugs.has(l.leagueSlug))) {
        prePlayerSquad = await svc.getSquadById(saveId, playerSquadId);
        preContinental = await continentalGoodClubsThisSeason(svc, saveId);
        prePlayerFixtures = (await svc.getFixturesForDate(saveId, date)).filter((f) => f.competition === meta.leagueSlug);
      }
    }

    // Fôlego: on a player-club match day, sample starting fitness before today's matches are
    // played — the fitness-aware XI (`autoLineupDefaultFormationWithFitness`) is what the AI
    // actually fields; `autoLineupDefaultFormation` (plain, no fitness) is the baseline it's
    // compared against to detect a fatigue-driven substitution.
    const leagueFixturesToday = (await svc.getFixturesForDate(saveId, date)).filter((f) => f.competition === meta.leagueSlug);
    const playerFixtureToday = leagueFixturesToday.find((f) => f.home === playerSquadId || f.away === playerSquadId);
    // Lesões: pre-day injury status of every player involved in today's league round, read before
    // `runBufferedDay` runs — this is the state the lineup selectors actually saw. Also doubles as
    // an injury-bookkeeping sample point (tracked-injured set + healed transitions).
    let preDayInjured: Map<string, boolean> | null = null;
    // Disciplina: same pre-day snapshot, for suspensions.
    let preDaySuspended: Set<string> | null = null;
    if (playerFixtureToday) {
      const month = date.slice(0, 7);
      const opponentId = playerFixtureToday.home === playerSquadId ? playerFixtureToday.away : playerFixtureToday.home;
      preDayInjured = new Map<string, boolean>();
      preDaySuspended = new Set<string>();
      const sid: string = saveId;
      const playerSquadPreDay = await svc.getSquadById(sid, playerSquadId);
      const squadsToday = [
        ...(playerSquadPreDay ? [playerSquadPreDay] : []),
        ...(await Promise.all(
          [...new Set(leagueFixturesToday.flatMap((f) => [f.home, f.away]))]
            .filter((id): id is string => id !== playerSquadId)
            .map((id) => svc.getSquadById(sid, id)),
        )).filter((s): s is Squad => !!s),
      ];
      for (const squad of squadsToday) {
        for (const p of squad.players) {
          preDayInjured.set(p.id, isInjured(p, date));
          if (isSuspended(p)) preDaySuspended.add(p.id);
          const left = p.suspension?.matches ?? 0;
          const before = trackedSuspended.get(p.id);
          if (before !== undefined && left < before) suspensionsServedObserved += before - left;
          if (left > 0) trackedSuspended.set(p.id, left);
          else trackedSuspended.delete(p.id);
          if (p.injury) {
            trackedInjured.set(p.id, p.injury.returnDate);
          } else if (trackedInjured.has(p.id)) {
            healedObserved++;
            trackedInjured.delete(p.id);
          }
        }
      }
      for (const fx of leagueFixturesToday) {
        for (const squadId of [fx.home, fx.away]) {
          if (squadId === playerSquadId) continue;
          const squad = squadsToday.find((s) => s.id === squadId);
          if (!squad) continue;
          // The AI's own season formation (Etapa 18), as `computeMatchSimulationLineups` fields it.
          const aiF = (await import("@/Domain/matchFormations")).formationForSimId(squad.aiFormation?.id);
          const mm = await import("@/Domain/advanceDay/matchSimulationLineups");
          const fitnessXI = mm.autoLineupForFormationWithFitness(squad, aiF);
          const plainXI = mm.autoLineupForFormation(squad, aiF);
          if (JSON.stringify([...fitnessXI].sort()) !== JSON.stringify([...plainXI].sort())) {
            fitnessDifferedFromPlain = true;
          }
          const xiPlayers = fitnessXI.map((id) => squad.players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
          if (xiPlayers.length === 0) continue;
          const mean = xiPlayers.reduce((s, p) => s + (p.seasonLog?.fitness ?? 75), 0) / xiPlayers.length;
          leagueFitnessSamples.push({ month, value: mean });
          if (squadId === opponentId) oppFitnessSamples.push({ month, value: mean });
        }
      }
    }

    const playerAnyFixtureToday = (await svc.getFixturesForDate(saveId, date))
      .some((f) => f.home === playerSquadId || f.away === playerSquadId);
    if (playerAnyFixtureToday && !rotationDiffered) {
      const sq = await svc.getSquadById(saveId, playerSquadId);
      const tac = await svc.getTactics(saveId);
      if (sq && tac) {
        const r = resolveUserLineup(sq, rotFormation, tac.lineup, date, { assistantRotation: true });
        if (r.rotationApplied.length > 0) rotationDiffered = true;
      }
    }

    // Instruções: man-mark the opponent's best outfield player on every human match day.
    if (playerAnyFixtureToday) {
      const fx = (await svc.getFixturesForDate(saveId, date)).find((f) => (f.home === playerSquadId || f.away === playerSquadId) && !f.played);
      const opp = fx ? await svc.getSquadById(saveId, fx.home === playerSquadId ? fx.away : fx.home) : null;
      if (opp) {
        const outfield = opp.players.filter((p) => p.positions[0] !== "GK" && !isInjured(p, date) && !isSuspended(p));
        const best = outfield.sort((a, b) => Player.computeOverallAvg(b) - Player.computeOverallAvg(a))[0];
        const cmSlot = rotFormation.attacking.findIndex((s) => s.role === "CM");
        if (best) {
          instrTrack.markDays++;
          const res = await instrCall("/api/saves/:id/match-marking", `/api/saves/${saveId}/match-marking`, { date, marks: [{ slot: cmSlot, targetId: best.id }] });
          if (res.status === 200) { instrTrack.markOk++; instrTrack.pendingMarkDate = date; }
        }
      }
    }

    // Olheiros: missions that work this Monday (each one is charged travel on the day).
    const scoutMonday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1 && meta.clubId === playerSquadId;
    const scoutActive = scoutMonday ? (await plain().getScouting(saveId)).missions.filter((m) => m.start < date).length : 0;

    // Equipe técnica: dismiss a coach after the first week and hire another from the pool; Monday bill.
    const staffMonday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1 && meta.clubId === playerSquadId;
    let staffBillBefore = 0;
    if (meta.clubId === playerSquadId) {
      const { squadStaffWages } = await import("@/Domain/staff/staff");
      if (!staffTrack.firedDone && days >= 7) {
        staffTrack.firedDone = true;
        const sqF = (await plain().getSquadById(saveId, playerSquadId))!;
        const coach = sqF.staff?.members.find((m) => m.role === "coach");
        if (coach) {
          const fireRes = await scoutCall("/api/saves/:saveId/staff/fire", "POST", { memberId: coach.id });
          staffTrack.fireStatus = fireRes.status;
          staffTrack.firedId = coach.id;
          staffTrack.severance = ((await fireRes.json()) as { severance?: number }).severance ?? 0;
          const poolRes = await scoutApiGet(`/api/saves/${saveId}/staff/pool?role=coach&sort=stars&limit=5`);
          const candidate = ((await poolRes.json()) as { items: Array<{ id: string }> }).items.find((c) => c.id !== coach.id);
          if (candidate) {
            staffTrack.hireStatus = (await scoutCall("/api/saves/:saveId/staff/hire", "POST", { memberId: candidate.id, years: 2 })).status;
            staffTrack.hiredId = candidate.id;
          }
        }
      }
      if (staffMonday) staffBillBefore = squadStaffWages((await plain().getSquadById(saveId, playerSquadId))?.staff);
    }

    const td = performance.now();
    const outcome = await runBufferedDay(saveId);
    const ms = performance.now() - td;
    if (!outcome.ok) {
      check(false, `runBufferedDay ${date}: ${outcome.status} ${outcome.error}`);
      break;
    }
    days++;
    dayMsTotal += ms;
    if (instrTrack.pendingMarkDate) {
      if ((await plain().getMeta(saveId))?.matchMarking) instrTrack.markLeftOver++;
      instrTrack.pendingMarkDate = null;
    }
    for (const m of await plain().getInbox(saveId)) {
      if (m.category === "transfer") negoMessages.set(m.id, m.kind);
      if (m.category === "contract" && m.kind.startsWith("staff_") && (m.staff ?? []).some((x) => x.id === staffTrack.forcedId)) {
        staffTrack.forcedKinds.add(m.kind);
      }
    }
    if (staffMonday) {
      const { squadStaffWages } = await import("@/Domain/staff/staff");
      staffTrack.mondays++;
      const billAfter = squadStaffWages((await plain().getSquadById(saveId, playerSquadId))?.staff);
      const seasonsS = await plain().listLedgerSeasons(saveId);
      const line = (await Promise.all(seasonsS.map((y) => plain().getLedger(saveId!, y)))).flat()
        .filter((e) => e.date === date && e.kind === "staff" && e.ref?.stage !== "severance")
        .reduce((sum, e) => sum - e.amount, 0);
      // The contract step runs before the money: a renewal or an exit that same Monday shows in the bill after.
      if (Math.abs(line - staffBillBefore) > 1 && Math.abs(line - billAfter) > 1) {
        staffTrack.mondayMismatch.push(`${date}: line ${line}, contracts ${staffBillBefore}/${billAfter}`);
      }
    }
    // Olheiros: knowledge of the player target, travel lines, prospects signed into the academy.
    {
      for (const m of await plain().getInbox(saveId)) {
        if (m.category !== "scouting") continue;
        if (!scoutTrack.reportsOn && m.kind === "report") scoutTrack.reportsLeaked++;
        scoutTrack.kinds.add(m.kind);
      }
      const st = await plain().getScouting(saveId);
      // Reports exist but none reached the inbox: the default holds; switch the topic on.
      if (!scoutTrack.reportsOn && st.reports.length > 0) {
        scoutTrack.reportsHiddenOk = scoutTrack.reportsLeaked === 0;
        scoutTrack.reportsOn = (await scoutCall("/api/saves/:saveId/inbox-prefs", "PUT", { scouting_reports: true })).status === 200;
      }
      scoutTrack.playerMaxK = Math.max(scoutTrack.playerMaxK, st.knowledge[scoutTrack.playerTarget]?.k ?? 0);
      // A weak field scout may need a second player mission to reach 100 (up to 3 weeks each).
      if (scoutTrack.playerMaxK < 100 && !st.missions.some((m) => m.scoutId === scoutTrack.playerScout) && (await plain().getMeta(saveId))?.clubId === playerSquadId) {
        await scoutCall("/api/saves/:saveId/scouting/missions", "POST", {
          scoutId: scoutTrack.playerScout, target: { kind: "player", playerId: scoutTrack.playerTarget, squadId: scoutTrack.playerTargetSquad }, weeks: 3,
        });
      }
      scoutTrack.reports = Math.max(scoutTrack.reports, st.reports.length);
      if (scoutTrack.chiefId && (await plain().getMeta(saveId))?.clubId === playerSquadId) {
        const chiefM = (await plain().getSquadById(saveId, playerSquadId))?.staff?.members.find((m) => m.id === scoutTrack.chiefId);
        const last = chiefM?.countryKnowledge?.[scoutTrack.foreign]?.last;
        if (last && last > scoutTrack.chiefLast) scoutTrack.chiefLast = last;
      }
      if (scoutMonday) {
        scoutTrack.mondays++;
        const seasons = await plain().listLedgerSeasons(saveId);
        const lines = (await Promise.all(seasons.map((y) => plain().getLedger(saveId!, y)))).flat()
          .filter((e) => e.date === date && e.kind === "scouting" && e.ref?.stage !== "prospect").length;
        if (lines !== scoutActive) scoutTrack.travelMissing.push(`${date}: ${lines}/${scoutActive}`);
      }
      const pr = st.prospects.find((p) => p.expires >= addOneDay(date));
      if (!scoutTrack.prospectSigned && pr && (await plain().getMeta(saveId))?.clubId === playerSquadId) {
        const before = (await plain().getSquadById(saveId, playerSquadId))!;
        const res = await scoutCall("/api/saves/:saveId/scouting/prospects/:prospectId/sign", "POST", undefined, { prospectId: pr.player.id });
        if (res.status === 200) {
          scoutTrack.prospectSigned = true;
          const after = (await plain().getSquadById(saveId, playerSquadId))!;
          const youth = after.youth?.find((p) => p.id === pr.player.id);
          if (!youth) scoutTrack.prospectChecks.push("not in the academy");
          if (!youth?.contract) scoutTrack.prospectChecks.push("no contract");
          if ((after.finances?.budget ?? 0) !== (before.finances?.budget ?? 0) - pr.fee) scoutTrack.prospectChecks.push("fee not charged");
        } else if (res.status !== 400) {
          scoutTrack.prospectChecks.push(`sign ${res.status}`);
        }
      }
    }
    {
      const mb = await plain().getMeta(saveId);
      if (mb?.unemployed) boardTrack.ended = true;
      const b = mb?.board;
      if (b) {
        boardTrack.days++;
        if (b.board < 0 || b.board > 100 || b.fans < 0 || b.fans > 100) boardTrack.outOfRange++;
        boardTrack.boardMin = Math.min(boardTrack.boardMin, b.board);
        boardTrack.boardMax = Math.max(boardTrack.boardMax, b.board);
        boardTrack.fansMin = Math.min(boardTrack.fansMin, b.fans);
        boardTrack.fansMax = Math.max(boardTrack.fansMax, b.fans);
        if (b.objective) boardTrack.objectiveSeasons.add(`${b.objective.leagueSlug}:${b.objective.season}:${b.objective.kind}`);
      }
    }
    const payload = outcome.payload as Record<string, unknown>;
    const playedMine = prePlayerFixtures.length > 0 || ms > 4000;
    if (playedMine) { matchDays++; matchDayMs += ms; }

    // Lesões: count every match played today (any league, engine or quickSim — both always write
    // `MatchEvent.injuries`, possibly empty) and check the player's league round against the
    // pre-day injury snapshot taken above.
    const dayLog = await plain().getDayLog(saveId, date);
    // Mercado vivo: every fee transfer / loan start of the day inside the buyer's window.
    if (dayLog?.transfers?.length) {
      const wctx = await loadWindowContext(meta, await plain().getSquadIndex(saveId), date);
      for (const mv of dayLog.transfers) {
        if (mv.kind !== "transfer" && mv.kind !== "loan") continue;
        const st = mv.to === meta.clubId ? wctx.human() : wctx.ofSquad(mv.to);
        livelyTrack.moves++;
        if (!st.open) livelyTrack.outside.push(`${date} ${mv.playerId} -> ${mv.to}`);
        else livelyTrack.kinds.add(st.current?.kind ?? "grace");
      }
    }
    // Mercado vivo: vacancies filled within 21 days (daily, from the meta), managers checked on Mondays.
    {
      const mv = (await plain().getMeta(saveId))!;
      const vac = mv.managerVacancies ?? {};
      for (const [club, v] of Object.entries(vac)) if (!livelyTrack.vacancySince.has(club)) livelyTrack.vacancySince.set(club, v.since);
      for (const [club, since] of [...livelyTrack.vacancySince]) {
        if (vac[club]) continue;
        livelyTrack.vacancySince.delete(club);
        livelyTrack.vacancyFilled++;
        const waited = Math.round((Date.parse(date) - Date.parse(since)) / 86_400_000);
        if (waited > 22) livelyTrack.vacancyLate.push(`${club} ${since}..${date}`);
      }
      if (new Date(`${date}T12:00:00Z`).getUTCDay() === 1) {
        livelyTrack.managerChecks++;
        const ms = await plain().getManagers(saveId);
        const allIds = [...(await idMembership(saveId)).keys()];
        const br = managerInvariantBreaks(ms, allIds);
        if (br.missing.length + br.doubled.length > 0) livelyTrack.invariantBreaks.push(`${date}: missing ${br.missing.slice(0, 3).join(",")} doubled ${br.doubled.slice(0, 3).join(",")}`);
        if (new Set(ms.map((m) => m.id)).size !== ms.length) livelyTrack.invariantBreaks.push(`${date}: duplicate manager id`);
        for (const m of ms) {
          for (const c of m.clubs ?? []) {
            if (c.to && !c.left) livelyTrack.closedWithoutLeft++;
            if (!c.to && c.left) livelyTrack.openPassagesWithLeft++;
          }
          if (m.interim && m.squadId && !vac[m.squadId]) livelyTrack.orphanInterims.push(`${date} ${m.id}`);
        }
      }
    }
    if (dayLog) {
      for (const event of dayLog.events) {
        if (event.kind !== "match") continue;
        totalMatchesLogged++;
        totalMatchInjuries += event.injuries?.length ?? 0;
        const th = event.teamStats.home;
        const ta = event.teamStats.away;
        if (th.fouls !== undefined && ta.fouls !== undefined) {
          discMatches++;
          disc.fouls += th.fouls + ta.fouls;
          disc.yellows += (th.yellowCards ?? 0) + (ta.yellowCards ?? 0);
          disc.reds += (th.redCards ?? 0) + (ta.redCards ?? 0);
          disc.penalties += (th.penaltiesAwarded ?? 0) + (ta.penaltiesAwarded ?? 0);
        }
        if (preDaySuspended && event.competition === meta.leagueSlug) {
          for (const playerId of Object.keys(event.playerStats)) {
            suspendedXIChecks++;
            if (preDaySuspended.has(playerId)) suspendedXIViolations++;
          }
        }
        if (preDayInjured && event.competition === meta.leagueSlug) {
          for (const playerId of Object.keys(event.playerStats)) {
            injuredXIChecks++;
            if (preDayInjured.get(playerId) === true) injuredXIViolations++;
          }
        }
      }
    }

    const metaAfter = (await plain().getMeta(saveId))!;
    if (metaAfter.currentDate !== addOneDay(date)) {
      check(false, `day ${date}: currentDate went to ${metaAfter.currentDate} (expected ${addOneDay(date)})`);
    }

    // Moral: the human club's morale every day; the first talk requests are answered with a promise
    // (minutes / renewal / sale, by reason) so at least one promise gets resolved during the run.
    if (metaAfter.clubId === playerSquadId) {
      const mine = await plain().getSquadById(saveId, playerSquadId);
      if (mine) {
        moraleTrack.days++;
        for (const p of mine.players) {
          if (p.morale === undefined) { moraleTrack.missing++; continue; }
          if (!(p.morale >= 0 && p.morale <= 100)) moraleTrack.outOfRange++;
          moraleTrack.min = Math.min(moraleTrack.min, p.morale);
          moraleTrack.max = Math.max(moraleTrack.max, p.morale);
        }
        for (const t of mine.moraleClub?.talks ?? []) {
          moraleTrack.talksSeen.add(t.id);
          if (t.reason === "contract") respTrack.contractTalks.add(t.id);
        }
        const open = (mine.moraleClub?.talks ?? [])[0];
        if (open && moraleTrack.answered.length < 3) {
          const answer = open.reason === "contract" ? "promise_renewal" : open.reason === "wants_move" ? "promise_sale" : "promise_minutes";
          const r = answerTalk({
            squad: mine, playerId: open.playerId, answer, date: metaAfter.currentDate!,
            ...(answer === "promise_minutes" ? { minutes: 2 } : {}), ...(answer === "promise_sale" ? { days: 14 } : {}),
            newId: () => `smoke-${moraleTrack.answered.length}-${open.id}`,
          });
          if (!("error" in r)) {
            await plain().saveSquadById(saveId, r.squad);
            moraleTrack.answered.push(`${open.playerName} (${open.reason} → ${answer})`);
          }
        }
      }
      for (const m of await plain().getInbox(saveId)) {
        if (m.category === "player" && (m.kind === "promise_kept" || m.kind === "promise_broken")) moraleTrack.resolved.add(m.id);
        if (m.category === "contract" && m.kind === "director_summary") respTrack.summaries.add(m.id);
        if (m.category === "contract" && m.kind === "expiring") respTrack.expiring.add(m.id);
        if (m.category === "manager_news") respTrack.managerNews.add(m.id);
        if (m.category === "player" && m.kind === "talk" && m.reason === "contract") respTrack.contractTalks.add(m.id);
      }
      for (const d of Object.values(metaAfter.directorDecisions ?? {})) if (d.renew) respTrack.renewed++;
    }

    // Which leagues rolled today (year advanced).
    const leaguesAfter = (metaAfter.activeLeagues ?? []) as LeagueSeasonState[];
    const rolledToday = leaguesAfter
      .filter((l) => {
        const b = leaguesBefore.find((x) => x.leagueSlug === l.leagueSlug);
        return b && l.year > b.year;
      })
      .map((l) => l.leagueSlug);
    if (rolledToday.length > 0) rolls.push({ date, leagues: rolledToday });
    if (rolledToday.length > 0) {
      await checkAwardsOfDay(date, rolledToday, leaguesBefore, prePlayerSquad,
        new Set([meta.leagueSlug, ...(meta.followedLeagues ?? [])]), meta.leagueSlug);
    }

    // Membership may only change for leagues whose own country rolled today.
    const foldersAfter = await folderMembership(saveId);
    const changed = [...new Set([...folders.keys(), ...foldersAfter.keys()])]
      .filter((l) => folders.get(l) !== foldersAfter.get(l));
    const rolledSet = new Set(rolledToday);
    const illegal = changed.filter((l) => !rolledSet.has(l) || !countryOf(l));
    if (illegal.length > 0) check(false, `day ${date}: membership changed outside a country rollover: ${illegal.join(", ")}`);
    folders = foldersAfter;

    if (rolledToday.length > 0 && preIndex) {
      const after = await idMembership(saveId);
      const countries = new Set(rolledToday.map(countryOf).filter((c): c is string => c !== null));
      for (const c of countries) {
        const closed = new Map<string, number>();
        for (const l of leaguesBefore) if (pyramidLeagueSlugs(pyramids[c]!).includes(l.leagueSlug)) closed.set(l.leagueSlug, l.year);
        rolledCountries.set(c, { date, before: preIndex, after, closed });
      }
      console.log(`  ${date}: rolled ${rolledToday.length} league(s) — ${[...countries].join(", ") || "(single leagues)"}`
        + `${changed.length ? `; membership changed in ${changed.length}` : ""}`);
    }

    // The player's country rollover.
    if (!playerRollDay && rolledToday.some((l) => playerCountrySlugs.has(l))) {
      playerRollDay = date;
      console.log(`\n── Player country rolled on ${date} (day ${days}) ──`);
      check(payload.seasonEnded === true, `rollover payload has seasonEnded (${String(payload.seasonEnded)})`);
      const payloadMoves = (payload.moves as ClubMove[] | undefined) ?? [];
      const rc = playerCountry ? rolledCountries.get(playerCountry) : undefined;
      const observed: ClubMove[] = [];
      if (rc) {
        for (const [id, from] of rc.before) {
          const to = rc.after.get(id);
          if (to && to !== from && playerCountrySlugs.has(from)) {
            const p = pyramids[playerCountry!]!;
            observed.push({ squadId: id, from, to, kind: tierOfLeague(p, to)! < tierOfLeague(p, from)! ? "promoted" : "relegated" });
          }
        }
      }
      const key = (m: ClubMove) => `${m.squadId}:${m.from}>${m.to}:${m.kind}`;
      check(JSON.stringify(payloadMoves.map(key).sort()) === JSON.stringify(observed.map(key).sort()),
        `payload.moves (${payloadMoves.length}) == observed membership changes (${observed.length})`);
      const obsPlayer = observed.find((m) => m.squadId === playerSquadId) ?? null;
      check(JSON.stringify(payload.playerMove ?? null) === JSON.stringify(obsPlayer),
        `payload.playerMove ${JSON.stringify(payload.playerMove ?? null)} matches observed`);
      const archive = await fsDal.readLeagueSeasonArchive(saveId, PLAYER_LEAGUE, rc?.closed.get(PLAYER_LEAGUE) ?? -1);
      const top = archive?.standings[0]?.squadId;
      check((payload.playerChampionOf ?? null) === (top === playerSquadId ? PLAYER_LEAGUE : null),
        `payload.playerChampionOf ${String(payload.playerChampionOf ?? null)} (archive champion ${top})`);
      console.log(`  archiveYear ${String(payload.archiveYear)}, moves:`);
      for (const m of payloadMoves) console.log(`    ${m.kind.padEnd(9)} ${m.squadId.padEnd(8)} ${m.from} → ${m.to}`);

      // Player squad: age + 1, broadcasting credit.
      const postSquad = await plain().getSquadById(saveId, playerSquadId);
      // League merit prize (design spec §3 "Liga"), hoisted so the inbox-message-count check
      // below can also see it: paid on the ending season's broadcasting (before any tier change)
      // at the club's final table position — see advanceDay.ts's rollover loop and
      // .claude/rules/game/finances.md § "Premiação".
      let leaguePrizeAmount = 0;
      if (prePlayerSquad && postSquad) {
        const p0 = prePlayerSquad.players.find((p) => postSquad.players.some((q) => q.id === p.id));
        const p1 = p0 && postSquad.players.find((q) => q.id === p0.id);
        check(!!p0 && !!p1 && p1.age === p0.age + 1, `player ${p0?.name ?? "?"}: age ${p0?.age} → ${p1?.age}`);
        const b0 = prePlayerSquad.finances?.budget ?? 0;
        const b1 = postSquad.finances?.budget ?? 0;
        const tv = prePlayerSquad.finances?.broadcasting ?? 0;
        // Weekly lines from the pure function; the gate (stadium fill from the fans after today's
        // match) and the board bonus are read from the ledger lines of the day.
        const entries = computeAdvanceDayMoney({
          currentDate: date, playerSquad: prePlayerSquad, homeFixturesToday: [],
          ...(meta.managerContract?.squadId === prePlayerSquad.id ? { managerWage: meta.managerContract.wage } : {}),
        });
        const dayLedger: LedgerEntry[] = [];
        for (const season of await plain().listLedgerSeasons(saveId)) {
          dayLedger.push(...(await plain().getLedger(saveId, season)).filter((e) => e.date === date));
        }
        const gateToday = dayLedger.filter((e) => e.kind === "gate").reduce((s, e) => s + e.amount, 0);
        const boardBonusToday = dayLedger.filter((e) => e.ref?.stage === "board_bonus").reduce((s, e) => s + e.amount, 0);
        // Facilities instalments / board funding of the day (`.claude/rules/game/facilities.md`).
        const facilitiesToday = dayLedger.filter((e) => e.kind === "facilities" || e.kind === "board_funding").reduce((s, e) => s + e.amount, 0);
        const delta = entries.reduce((s, e) => s + e.amount, 0) + gateToday + boardBonusToday + facilitiesToday;
        const closedTable = archive?.standings ?? [];
        const playerTablePos = closedTable.findIndex((r) => r.squadId === playerSquadId);
        leaguePrizeAmount = playerTablePos >= 0 ? leaguePrize(tv, playerTablePos + 1, closedTable.length) : 0;
        // No clamp any more (see .claude/rules/game/finances.md — the ledger allows a negative
        // balance), so budget is expected to move by exactly `delta`, not max(0, ...).
        const expected = b0 + delta + tv + leaguePrizeAmount;
        if (obsPlayer) {
          console.log(`  budget ${b0} → ${b1} (club changed tier: exact check skipped; tv ${tv}, day delta ${delta}, league prize ${leaguePrizeAmount})`);
          check(b1 >= b0 + delta, `budget did not drop at the rollover (${b0} → ${b1})`);
        } else {
          check(Math.abs(b1 - expected) < 1,
            `budget ${b0} + day ${delta} + TV ${tv} + league prize ${leaguePrizeAmount} = ${expected} (got ${b1})`);
        }
      } else {
        check(false, "player squad readable before and after the rollover");
      }
      // Inbox: season news for champion / move.
      const inbox = await plain().getInbox(saveId);
      const season = inbox.filter((m) => m.category === "season");
      // Human followers react to the season (followers only; the rest of its finances is its own).
      const humanAfter = await plain().getSquadById(saveId, playerSquadId);
      const followersBefore = prePlayerSquad?.finances?.followers ?? 0;
      const followersAfter = humanAfter?.finances?.followers ?? 0;
      if (prePlayerSquad && humanAfter && archive) {
        // advanceDay applies the tier income change first (soft balancing uses the new income).
        const pyr = obsPlayer ? pyramids[playerCountry!]! : null;
        const base = obsPlayer && pyr
          ? applyTierFinanceChange(prePlayerSquad, tierOfLeague(pyr, obsPlayer.from)!, tierOfLeague(pyr, obsPlayer.to)!)
          : prePlayerSquad;
        const expected = applyHumanSeasonReaction(
          base,
          clubSeasonOutcome(archive.standings, playerSquadId, obsPlayer ? [obsPlayer] : [], preContinental),
        ).followersAfter;
        // The fans' mood scales the change × 0.8..1.2 (`.claude/rules/game/board-fans.md`).
        const lo = Math.min(followersAfterMood(followersBefore, expected, 0), followersAfterMood(followersBefore, expected, 100));
        const hi = Math.max(followersAfterMood(followersBefore, expected, 0), followersAfterMood(followersBefore, expected, 100));
        check(followersAfter >= lo && followersAfter <= hi,
          `human followers ${followersBefore} → ${followersAfter} (reaction ${expected}, fans' mood range ${lo}..${hi})`);
      }
      const followersNews = followersAfter !== followersBefore ? 1 : 0;
      // "league_prize" always fires once per rollover when a merit prize was paid (design spec
      // §3 "Liga" / inboxTypes.ts) — independent of champion/promoted/relegated/followers, and
      // never doubles up with those (`leaguePrizeAmount` computed just above).
      const leaguePrizeNews = leaguePrizeAmount > 0 ? 1 : 0;
      const expectedNews = (payload.playerChampionOf ? 1 : 0) + (payload.playerMove ? 1 : 0) + followersNews + leaguePrizeNews;
      check(season.length === expectedNews, `inbox season messages: ${season.length} (expected ${expectedNews})`);
      check(season.filter((m) => m.kind === "followers").length === followersNews, "inbox has the followers season line");
      check(season.filter((m) => m.kind === "league_prize").length === leaguePrizeNews, "inbox has the league_prize season line");
      if (obsPlayer) check(metaAfter.leagueSlug === obsPlayer.to, `meta.leagueSlug follows the club (${metaAfter.leagueSlug})`);
      // AI finances: every AI club of the country got a financial tier and a fresh transfer budget;
      // the human club got neither.
      for (const slug of playerCountrySlugs) {
        const squads = await plain().getSquadsInLeague(saveId, slug);
        const ai = squads.filter((s) => s.id !== playerSquadId);
        const missing = ai.filter((s) => !s.financialTier || !(typeof s.aiTransferBudget === "number" && s.aiTransferBudget > 0)).length;
        check(missing === 0, `${slug}: AI clubs have a financial tier + transfer budget after the rollover (${missing} missing)`);
      }
      check(!humanAfter?.financialTier && humanAfter?.aiTransferBudget === undefined, "human club has no AI financial tier / AI budget");
      await checkFiles(saveId, `after rollover ${date}`);
    } else if (playerRollDay) {
      daysAfterRoll++;
    }

    // Contratos: the weekly wages ledger line (Mondays) must equal the sum of the contracts of the
    // player's squad. Skipped on a rollover day (contracts change mid-day there).
    if (rolledToday.length === 0 && new Date(`${date}T12:00:00`).getDay() === 1) {
      const sq = await plain().getSquadById(saveId, playerSquadId);
      const seasons = await plain().listLedgerSeasons(saveId);
      const entries: LedgerEntry[] = [];
      for (const season of seasons) entries.push(...(await plain().getLedger(saveId, season)));
      const line = entries.find((e) => e.kind === "wages" && e.date === date);
      if (sq && line) {
        const sum = sq.players.reduce((n, p) => n + (p.contract?.wage ?? 0), 0);
        wageLineChecks++;
        // A sale/signing later the same day may legitimately move the sum; tolerate it.
        if (Math.abs(-line.amount - sum) > 1) wageLineMismatches.push(`${date}: ledger ${Math.round(-line.amount)} vs contracts ${Math.round(sum)}`);
      }
    }

    if (days % 20 === 0) {
      const el = (performance.now() - t0) / 1000;
      console.log(`[${days}] ${date} → ${metaAfter.currentDate}  ${ms.toFixed(0)} ms  avg ${(dayMsTotal / days).toFixed(0)} ms  elapsed ${el.toFixed(0)} s`);
    }
    if (playerRollDay && daysAfterRoll >= EXTRA_DAYS) break;
  }

  const endMeta = (await plain().getMeta(saveId))!;
  const endDate = endMeta.currentDate!;
  check(!!playerRollDay, `player country rolled over (on ${playerRollDay ?? "never"})`);
  check(days === Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000),
    `${days} days advanced one by one: ${startDate} → ${endDate}`);

  // ── Per-country promotion/relegation from the archived final tables ────────
  console.log("\n── Country rollovers in range ──");
  for (const [country, rc] of rolledCountries) {
    const p: CountryPyramid = pyramids[country]!;
    const slugs = pyramidLeagueSlugs(p);
    const expectedOut = new Map<string, string>(); // squadId → expected tier direction "up"/"down"
    const tables = new Map<string, string[]>();
    for (const lv of p.levels) {
      for (const g of lv.groups) {
        const arch = await fsDal.readLeagueSeasonArchive(saveId, g.leagueSlug, rc.closed.get(g.leagueSlug) ?? -1);
        const table = (arch?.standings ?? []).map((r) => r.squadId);
        tables.set(g.leagueSlug, table);
        check(table.length > 0, `${country}: archive ${g.leagueSlug} ${rc.closed.get(g.leagueSlug)} has a table (${table.length})`);
        for (const id of table.slice(0, g.promote)) expectedOut.set(id, "up");
        for (const id of g.relegate > 0 ? table.slice(-g.relegate) : []) expectedOut.set(id, "down");
      }
    }
    const moved: ClubMove[] = [];
    for (const [id, from] of rc.before) {
      if (!slugs.includes(from)) continue;
      const to = rc.after.get(id);
      if (to && to !== from) moved.push({ squadId: id, from, to, kind: tierOfLeague(p, to)! < tierOfLeague(p, from)! ? "promoted" : "relegated" });
    }
    let bad = 0;
    for (const m of moved) {
      const dir = expectedOut.get(m.squadId);
      const dt = tierOfLeague(p, m.to)! - tierOfLeague(p, m.from)!;
      if (!dir || (dir === "up" ? dt !== -1 : dt !== 1)) { bad++; console.log(`    unexpected move ${m.squadId} ${m.from} → ${m.to}`); }
    }
    for (const [id, dir] of expectedOut) {
      if (!moved.some((m) => m.squadId === id)) { bad++; console.log(`    ${id} should have gone ${dir} from ${rc.before.get(id)} but stayed`); }
    }
    const sizes = slugs.map((s) => {
      const before = [...rc.before.values()].filter((l) => l === s).length;
      const after = [...rc.after.values()].filter((l) => l === s).length;
      return `${s} ${before}→${after}`;
    });
    check(bad === 0, `${country} (${rc.date}): ${moved.length} moves, all = bottom relegate / top promote of the archived tables`);
    console.log(`    sizes: ${sizes.join(", ")}`);
    if (country === "England" || country === "Italy") {
      for (const m of moved) console.log(`    ${m.kind.padEnd(9)} ${m.squadId.padEnd(8)} ${(tables.get(m.from)!.indexOf(m.squadId) + 1).toString().padStart(2)}º ${m.from} → ${m.to}`);
    }

    // New calendars + zeroed standings from the new membership.
    const index = await plain().getSquadIndex(saveId);
    for (const slug of slugs) {
      const clubs = index.inLeague(slug).map((t) => t.squadId);
      const n = clubs.length;
      const fx = await plain().getAllFixturesForLeague(saveId, slug);
      const games = new Map<string, number>();
      for (const f of fx) for (const id of [f.home, f.away]) games.set(id, (games.get(id) ?? 0) + 1);
      const calClubs = [...games.keys()].sort();
      const okSet = JSON.stringify(calClubs) === JSON.stringify([...clubs].sort());
      const okCount = [...games.values()].every((g) => g === 2 * (n - 1));
      const standings = (await plain().getLeagueStandings(saveId, slug)) ?? [];
      const okStand = JSON.stringify(standings.map((r) => r.squadId).sort()) === JSON.stringify([...clubs].sort())
        && standings.every((r) => r.mp === 0 && r.pts === 0);
      const arrivals = moved.filter((m) => m.to === slug).map((m) => m.squadId);
      const okArr = arrivals.every((id) => games.has(id) && standings.some((r) => r.squadId === id));
      check(okSet && okCount && okStand && okArr,
        `${slug}: new calendar ${n} clubs × ${2 * (n - 1)} games (set ${okSet}, counts ${okCount}), zeroed standings ${okStand}, ${arrivals.length} arrivals in both ${okArr}`);

      // Closed season: everything dated ≤ end played, nothing scheduled after end.
      const cap = captures.get(slug);
      const arch = await fsDal.readLeagueSeasonArchive(saveId, slug, rc.closed.get(slug) ?? -1);
      const nOld = arch?.standings.length ?? 0;
      const archFull = !!arch && arch.standings.every((r) => r.mp === 2 * (nOld - 1));
      check(!!cap && cap.unplayedPast === 0 && cap.afterEnd === 0 && archFull,
        `${slug} ${cap?.year}: closed season (end ${cap?.end}, rolled ${cap?.date}) — ${cap?.total} fixtures, ` +
        `${cap?.unplayedPast} unplayed in the past, ${cap?.today} played on the last day, ${cap?.afterEnd} dated after the end; ` +
        `archive every club mp = ${2 * (nOld - 1)}: ${archFull}`);
    }

    if (country === "England") {
      check(index.inLeague("premier_league").length === 20, `inLeague(premier_league) = ${index.inLeague("premier_league").length} (20)`);
      check(index.inLeague("of_championship").length === 24, `inLeague(of_championship) = ${index.inLeague("of_championship").length} (24)`);
      const down = moved.filter((m) => m.from === "premier_league" && m.to === "of_championship").length;
      const up = moved.filter((m) => m.from === "of_championship" && m.to === "premier_league").length;
      check(down === 3 && up === 3, `England: ${down} relegated, ${up} promoted (3/3)`);
      const plTable = tables.get("premier_league")!;
      const chTable = tables.get("of_championship")!;
      check(plTable.slice(-3).every((id) => rc.after.get(id) === "of_championship"), "PL bottom 3 are in of_championship");
      check(chTable.slice(0, 3).every((id) => rc.after.get(id) === "premier_league"), "Championship top 3 are in premier_league");
    }
    if (country === "Italy") {
      for (const g of ["of_italian_serie_c_a", "of_italian_serie_c_b", "of_italian_serie_c_c"]) {
        const fromB = moved.filter((m) => m.from === "of_italian_serie_b" && m.to === g).length;
        const champ = tables.get(g)![0]!;
        check(fromB === 1, `${g} received ${fromB} club(s) from Serie B (1)`);
        check(rc.after.get(champ) === "of_italian_serie_b", `${g} champion ${champ} is now in of_italian_serie_b`);
      }
    }
  }
  const rolledCountryNames = [...rolledCountries.keys()];
  check(rolledCountryNames.includes("England") && rolledCountryNames.includes("Italy"),
    `England and Italy rolled in range (rolled: ${rolledCountryNames.join(", ")})`);
  const italyRoll = rolledCountries.get("Italy")?.date;
  check(italyRoll === "2027-05-18", `Italy rolled on ${italyRoll} (2027-05-18)`);

  // Leagues that rolled alone must not have changed membership (single-league countries).
  const endMembership = await idMembership(saveId);
  const drift = [...startMembership].filter(([id, l]) => endMembership.get(id) !== l && !countryOf(l));
  check(drift.length === 0, `no club left a non-pyramid league (${drift.length})`);
  const movedTotal = [...startMembership].filter(([id, l]) => endMembership.get(id) !== l).length;
  console.log(`  ${movedTotal} clubs changed league over the whole run; rollover days: ${rolls.map((r) => `${r.date}(${r.leagues.length})`).join(" ")}`);

  // ── No unplayed fixture left in the past, any league ───────────────────────
  let leaguesChecked = 0;
  let fixturesChecked = 0;
  let unplayedPast = 0;
  const offenders: string[] = [];
  for (const l of (endMeta.activeLeagues ?? []) as LeagueSeasonState[]) {
    const fx = await plain().getAllFixturesForLeague(saveId, l.leagueSlug);
    const past = fx.filter((f) => f.date < endDate);
    const bad = past.filter((f) => !f.played).length;
    leaguesChecked++;
    fixturesChecked += past.length;
    unplayedPast += bad;
    if (bad > 0) offenders.push(`${l.leagueSlug}(${bad})`);
  }
  check(unplayedPast === 0,
    `current calendars: ${leaguesChecked} leagues, ${fixturesChecked} fixtures dated before ${endDate}, ${unplayedPast} unplayed ${offenders.join(" ")}`);
  const capList = [...captures.entries()];
  const lostAfterEnd = capList.reduce((s, [, c]) => s + c.afterEnd, 0);
  const pastAtRoll = capList.reduce((s, [, c]) => s + c.unplayedPast, 0);
  console.log(`  closed seasons captured: ${capList.length} leagues, ${pastAtRoll} unplayed-in-past, ${lostAfterEnd} dated after end`
    + (lostAfterEnd ? ` (${capList.filter(([, c]) => c.afterEnd > 0).map(([s, c]) => `${s}:${c.afterEnd}`).join(" ")})` : ""));
  check(lostAfterEnd === 0, `no closed-season fixture scheduled after its league's end (${lostAfterEnd})`);

  // ── National cups ───────────────────────────────────────────────────────
  console.log("\n── National cups ──");
  const smokeSaveId = saveId;
  const allSlugsEnd = await plain().listCompetitionSlugs(smokeSaveId);
  const cupSlugsEnd = allSlugsEnd.filter(isCupSlug);
  const fixturesBySlugEnd = new Map<string, Fixture[]>();
  for (const slug of allSlugsEnd) fixturesBySlugEnd.set(slug, await plain().getAllFixturesForLeague(smokeSaveId, slug));

  // 1. Every cup folder has meta.cup; a regenerated cup's year advanced and the previous
  //    season's archive (read back through the DAL, same path as a league archive) has 1 title.
  let cupsMissingMeta = 0;
  let cupsRegenerated = 0;
  let cupsMissingArchive = 0;
  let englandArchive: SeasonArchive | null = null;
  for (const slug of cupSlugsEnd) {
    const cm = await plain().getLeagueMeta(saveId, slug);
    if (!cm?.cup) { cupsMissingMeta++; continue; }
    const initial = cupYearsStart.get(cm.cup.country);
    if (initial === undefined || cm.year <= initial) continue;
    cupsRegenerated++;
    const arch = await fsDal.readLeagueSeasonArchive(saveId, slug, initial);
    if (!arch || arch.titles.length !== 1) {
      cupsMissingArchive++;
      console.log(`    ${slug}: expected a 1-title archive for year ${initial}, got ${arch ? arch.titles.length : "no archive"}`);
    }
    if (cm.cup.country === "England") englandArchive = arch;
  }
  check(cupSlugsEnd.length > 0, `${cupSlugsEnd.length} cup folder(s) exist (${cupSlugsEnd.length} of ${allSlugsEnd.length} competitions)`);
  check(cupsMissingMeta === 0, `every cup folder has meta.cup (${cupsMissingMeta} missing)`);
  check(cupsMissingArchive === 0,
    `${cupsRegenerated} regenerated cup(s) archived the previous season with exactly 1 title (${cupsMissingArchive} bad)`);

  // 4. England: the finished cup (before its regeneration) had a champion.
  check(!!englandArchive && englandArchive.titles.length === 1,
    `England's finished cup had a champion (${englandArchive?.titles[0]?.clubName ?? "none"})`);

  // 2. No cup fixture dated before currentDate is still unplayed.
  let cupFixturesChecked = 0;
  let cupUnplayedPast = 0;
  const cupOffenders: string[] = [];
  for (const slug of cupSlugsEnd) {
    const past = (fixturesBySlugEnd.get(slug) ?? []).filter((f) => f.date < endDate);
    const bad = past.filter((f) => !f.played).length;
    cupFixturesChecked += past.length;
    cupUnplayedPast += bad;
    if (bad > 0) cupOffenders.push(`${slug}(${bad})`);
  }
  check(cupUnplayedPast === 0,
    `cup calendars: ${cupFixturesChecked} fixtures dated before ${endDate}, ${cupUnplayedPast} unplayed ${cupOffenders.join(" ")}`);

  // 3. No club has two fixtures (league + cup, any competitions) on the same date.
  const byClubDate = new Map<string, string[]>(); // "date|squadId" → competitions playing them that day
  for (const [slug, fx] of fixturesBySlugEnd) {
    for (const f of fx) {
      for (const club of [f.home, f.away]) {
        const key = `${f.date}|${club}`;
        byClubDate.set(key, [...(byClubDate.get(key) ?? []), slug]);
      }
    }
  }
  const doubleBooked = [...byClubDate.entries()].filter(([, comps]) => comps.length > 1);
  check(doubleBooked.length === 0,
    `no club has two fixtures on the same date across ${allSlugsEnd.length} competitions (${doubleBooked.length} clashes)`
    + (doubleBooked.length ? `: ${doubleBooked.slice(0, 5).map(([k, comps]) => `${k}→${comps.join(",")}`).join("; ")}` : ""));

  // ── Continental competitions ────────────────────────────────────────────
  console.log("\n── Continental competitions ──");
  const continentalSlugsEnd = allSlugsEnd.filter(isContinentalSlug);
  check(continentalSlugsEnd.length === 4, `${continentalSlugsEnd.length} continental competition(s) exist (expected 4)`);

  // 1. Every continental folder has meta.continental with exactly 32 clubs.
  const continentalClubs = new Map<string, string[]>(); // slug -> its 32 club ids
  let continentalMissingMeta = 0;
  let continentalWrongSize = 0;
  for (const slug of continentalSlugsEnd) {
    const cm = await plain().getLeagueMeta(smokeSaveId, slug);
    if (!cm?.continental) { continentalMissingMeta++; continue; }
    const clubs = cm.continental.groups.flatMap((g) => g.clubs);
    continentalClubs.set(slug, clubs);
    if (clubs.length !== 32) { continentalWrongSize++; console.log(`    ${slug}: ${clubs.length} clubs (expected 32)`); }
  }
  check(continentalMissingMeta === 0, `every continental folder has meta.continental (${continentalMissingMeta} missing)`);
  check(continentalWrongSize === 0, `every continental competition has exactly 32 clubs (${continentalWrongSize} bad)`);

  // 2. No club plays in two continental competitions.
  const clubComps = new Map<string, string[]>();
  for (const [slug, clubs] of continentalClubs) {
    for (const id of clubs) clubComps.set(id, [...(clubComps.get(id) ?? []), slug]);
  }
  const inTwoContinentals = [...clubComps.entries()].filter(([, comps]) => comps.length > 1);
  check(inTwoContinentals.length === 0,
    `no club plays in two continental competitions (${inTwoContinentals.length})`
    + (inTwoContinentals.length ? `: ${inTwoContinentals.slice(0, 5).map(([id, comps]) => `${id}→${comps.join(",")}`).join("; ")}` : ""));

  // 3. No club has two fixtures on the same date, across ALL competitions (league + cup +
  //    continental) — already checked above (`doubleBooked`, built from every slug in `allSlugsEnd`,
  //    which lists every folder under leagues/ regardless of kind).

  // 4. No continental fixture dated before currentDate is still unplayed.
  let contFixturesChecked = 0;
  let contUnplayedPast = 0;
  const contOffenders: string[] = [];
  for (const slug of continentalSlugsEnd) {
    const past = (fixturesBySlugEnd.get(slug) ?? []).filter((f) => f.date < endDate);
    const bad = past.filter((f) => !f.played).length;
    contFixturesChecked += past.length;
    contUnplayedPast += bad;
    if (bad > 0) contOffenders.push(`${slug}(${bad})`);
  }
  check(contUnplayedPast === 0,
    `continental calendars: ${contFixturesChecked} fixtures dated before ${endDate}, ${contUnplayedPast} unplayed ${contOffenders.join(" ")}`);

  // 5. Informational only (not a failure): the spec's ±1-day rule is soft-enforced by the date
  //    scheduler, not guaranteed for every club on every date (e.g. a club whose domestic cup stage
  //    date shifts after the continental calendar was generated). Count club/fixture instances where
  //    a continental fixture falls the day before or after a league/cup fixture for that same club.
  const subOneDay = (d: string): string => {
    const dt = new Date(`${d}T12:00:00`);
    dt.setDate(dt.getDate() - 1);
    return dt.toISOString().slice(0, 10);
  };
  const nonContinentalSlugs = allSlugsEnd.filter((s) => !isContinentalSlug(s));
  const clubDatesNonContinental = new Map<string, Set<string>>();
  for (const slug of nonContinentalSlugs) {
    for (const f of fixturesBySlugEnd.get(slug) ?? []) {
      for (const club of [f.home, f.away]) {
        if (!clubDatesNonContinental.has(club)) clubDatesNonContinental.set(club, new Set());
        clubDatesNonContinental.get(club)!.add(f.date);
      }
    }
  }
  let adjacentInstances = 0;
  const adjacentClubs = new Set<string>();
  for (const slug of continentalSlugsEnd) {
    for (const f of fixturesBySlugEnd.get(slug) ?? []) {
      for (const club of [f.home, f.away]) {
        const dates = clubDatesNonContinental.get(club);
        if (!dates) continue;
        if (dates.has(addOneDay(f.date)) || dates.has(subOneDay(f.date))) {
          adjacentInstances++;
          adjacentClubs.add(club);
        }
      }
    }
  }
  console.log(`  ${adjacentInstances} continental fixture/club instance(s) (${adjacentClubs.size} distinct clubs) fall the day `
    + `before/after a league or cup fixture for that club (informational only, not a failure)`);

  // 6. Europe: the first season's UCL/UEL must have gone through the European continental
  //    rollover by the end of this run (hard requirement — every European cross-year tier-1
  //    league ends 05-16..05-18, so the rollover is always reached well within a run that goes
  //    from world genesis (Aug 2026) through the player's own country rolling over in ~May 2027;
  //    if it isn't reached, that's a real bug, not a timing fluke). The finished season must be
  //    archived with exactly 1 title.
  const [uclComp, uelComp] = competitionsOf("Europe");
  const uclSlug = uclComp!.slug, uelSlug = uelComp!.slug;
  const uclInitialYear = continentalYearsStart.get(uclSlug);
  const uelInitialYear = continentalYearsStart.get(uelSlug);
  const uclMetaEnd = await plain().getLeagueMeta(smokeSaveId, uclSlug);
  const uelMetaEnd = await plain().getLeagueMeta(smokeSaveId, uelSlug);
  const europeRegenerated = uclInitialYear !== undefined && (uclMetaEnd?.year ?? uclInitialYear) > uclInitialYear;
  check(europeRegenerated,
    `European continental rollover reached by ${endDate} (UCL year ${uclInitialYear} → ${uclMetaEnd?.year ?? uclInitialYear})`);
  if (europeRegenerated) {
    const uclArchive = await fsDal.readLeagueSeasonArchive(saveId, uclSlug, uclInitialYear!);
    const uelArchive = await fsDal.readLeagueSeasonArchive(saveId, uelSlug, uelInitialYear!);
    check(!!uclArchive && uclArchive.titles.length === 1,
      `UCL ${uclInitialYear} archived at the European rollover with exactly 1 title (champion ${uclArchive?.titles[0]?.clubName ?? "none"})`);
    check(!!uelArchive && uelArchive.titles.length === 1,
      `UEL ${uelInitialYear} archived at the European rollover with exactly 1 title (champion ${uelArchive?.titles[0]?.clubName ?? "none"})`);
  } else {
    console.log(`    UCL ${uclInitialYear} champion at end of run: ${uclMetaEnd?.continental?.championId ?? "none"} (rollover not reached)`);
    console.log(`    UEL ${uelInitialYear} champion at end of run: ${uelMetaEnd?.continental?.championId ?? "none"} (rollover not reached)`);
  }

  // 7. South America: same check if the SA continental rollover was reached (unlikely in a
  //    default run rooted in a European player league — the calendar-year South American leagues
  //    only roll around November); otherwise confirm the Libertadores progressed past the group
  //    stage (r16 drawn) and every played r16 second leg carries an aggregate.
  const [libComp, sudComp] = competitionsOf("South America");
  const libSlug = libComp!.slug, sudSlug = sudComp!.slug;
  const libInitialYear = continentalYearsStart.get(libSlug);
  const sudInitialYear = continentalYearsStart.get(sudSlug);
  const libMetaEnd = await plain().getLeagueMeta(smokeSaveId, libSlug);
  const saRegenerated = libInitialYear !== undefined && (libMetaEnd?.year ?? libInitialYear) > libInitialYear;
  if (saRegenerated) {
    const libArchive = await fsDal.readLeagueSeasonArchive(saveId, libSlug, libInitialYear!);
    const sudArchive = await fsDal.readLeagueSeasonArchive(saveId, sudSlug, sudInitialYear!);
    check(!!libArchive && libArchive.titles.length === 1,
      `Libertadores ${libInitialYear} archived at the South American rollover with exactly 1 title (champion ${libArchive?.titles[0]?.clubName ?? "none"})`);
    check(!!sudArchive && sudArchive.titles.length === 1,
      `Sul-Americana ${sudInitialYear} archived at the South American rollover with exactly 1 title (champion ${sudArchive?.titles[0]?.clubName ?? "none"})`);
  } else {
    const r16Stage = libMetaEnd?.continental?.stages.find((s) => s.name === "r16");
    check(!!r16Stage?.drawn, `Libertadores ${libInitialYear} r16 drawn — progressed past the group stage`);
    if (r16Stage) {
      const leg2Round = r16Stage.rounds[1]!;
      const rf = await plain().getRound(smokeSaveId, libSlug, leg2Round);
      const playedLeg2 = (rf?.fixtures ?? []).filter((f) => f.played);
      const missingAgg = playedLeg2.filter((f) => f.aggregate === undefined).length;
      check(missingAgg === 0,
        `Libertadores r16 second-leg fixtures have an aggregate once played (${missingAgg} missing of ${playedLeg2.length} played)`);
    }
  }

  // ── Finanças ─────────────────────────────────────────────────────────────
  console.log("\n── Finanças ──");

  // 1. Sum of the player's ledger over every season == final budget. The budget starts at 0
  //    (SaveService.createSave) and every credit/debit since goes through recordMoney/applyMoney
  //    — see .claude/rules/game/finances.md.
  const ledgerSeasons = await plain().listLedgerSeasons(saveId);
  const allLedgerEntries: LedgerEntry[] = [];
  for (const season of ledgerSeasons) allLedgerEntries.push(...(await plain().getLedger(saveId, season)));
  const ledgerTotal = allLedgerEntries.reduce((s, e) => s + e.amount, 0);
  const finalPlayerSquad = await plain().getSquadById(saveId, playerSquadId);
  const finalBudget = finalPlayerSquad?.finances?.budget ?? 0;
  check(Math.abs(ledgerTotal - finalBudget) < 1,
    `ledger sum across ${ledgerSeasons.length} season(s) (${Math.round(ledgerTotal).toLocaleString("en-US")}) `
    + `== final budget (${Math.round(finalBudget).toLocaleString("en-US")})`);

  // 2. At least one league `prize` entry after the rollover — the merit prize always fires once
  //    per rollover (the "league_prize" inbox kind, advanceDay.ts).
  const leaguePrizeEntries = allLedgerEntries.filter(
    (e) => e.kind === "prize" && !!e.ref?.competition && !isCupSlug(e.ref.competition) && !isContinentalSlug(e.ref.competition),
  );
  check(leaguePrizeEntries.length > 0, `at least one league prize entry in the ledger (${leaguePrizeEntries.length})`);

  // 3. Some AI club with a continental campaign has its transfer budget boosted above its fresh
  //    seasonal grant by prize money (design spec §3 "IA"). Proxy: every club currently entered
  //    in a continental competition (`continentalClubs`, from the section above). Informational
  //    (not a failure) when none is found — the prize can already have been spent by the time we
  //    check, so this reports the max ratio observed instead of failing.
  const continentalClubIds = new Set<string>();
  for (const ids of continentalClubs.values()) for (const id of ids) continentalClubIds.add(id);
  let boostedCount = 0;
  let continentalMaxRatio = 0;
  for (const id of continentalClubIds) {
    const squad = await plain().getSquadById(saveId, id);
    if (!squad || squad.id === playerSquadId || !squad.financialTier) continue;
    const grant = seasonalTransferBudgetFor(squad.financialTier, popularityOf(squad));
    if (grant <= 0) continue;
    const ratio = aiTransferBudgetOf(squad) / grant;
    continentalMaxRatio = Math.max(continentalMaxRatio, ratio);
    if (ratio > 1.001) boostedCount++;
  }
  if (boostedCount > 0) {
    check(true, `${boostedCount} continental AI club(s) have aiTransferBudget above their fresh seasonal grant (max ratio ${continentalMaxRatio.toFixed(2)})`);
  } else {
    console.log(`  no continental AI club currently above its fresh seasonal grant (max ratio observed ${continentalMaxRatio.toFixed(2)}) — informational only`);
  }

  // 4. No AI transfer budget above MAX_BALANCE_RATIO × its seasonal grant, across the whole world.
  // 5. Every squad has a numeric wageFactor and wageRevenueBasis, across the whole world.
  const allFiles = await plain().listSquadFiles(saveId);
  let overCap = 0;
  let worldMaxRatio = 0;
  let missingWageFields = 0;
  for (const { squad } of allFiles) {
    if (squad.id !== playerSquadId && squad.financialTier) {
      const grant = seasonalTransferBudgetFor(squad.financialTier, popularityOf(squad));
      if (grant > 0) {
        const ratio = aiTransferBudgetOf(squad) / grant;
        worldMaxRatio = Math.max(worldMaxRatio, ratio);
        if (ratio > AI_FINANCE_CONFIG.TRANSFER_BUDGET.MAX_BALANCE_RATIO + 0.001) overCap++;
      }
    }
    if (typeof squad.wageFactor !== "number" || typeof squad.wageRevenueBasis !== "number") missingWageFields++;
  }
  check(overCap === 0,
    `no AI transfer budget above ${AI_FINANCE_CONFIG.TRANSFER_BUDGET.MAX_BALANCE_RATIO}x its seasonal grant `
    + `(${overCap} over cap of ${allFiles.length} squads, world max ratio ${worldMaxRatio.toFixed(2)})`);
  check(missingWageFields === 0,
    `every squad has a numeric wageFactor + wageRevenueBasis (${missingWageFields} missing of ${allFiles.length})`);

  // 6. Informational only: the player's season income/expense totals by kind.
  console.log("  player ledger totals by kind (all seasons):");
  for (const [kind, amount] of Object.entries(totalsByKind(allLedgerEntries))) {
    console.log(`    ${kind.padEnd(14)} ${Math.round(amount).toLocaleString("en-US").padStart(16)}`);
  }

  // ── Contratos ────────────────────────────────────────────────────────────
  // See `.claude/rules/game/contracts.md`. `allFiles` (final world state) already fetched above.
  console.log("\n── Contratos ──");
  const rolledLeagueSlugs = new Set(rolls.flatMap((r) => r.leagues));
  const rolledSquads = allFiles.map((f) => f.squad).filter((sq) => sq.leagueSlug && rolledLeagueSlugs.has(sq.leagueSlug));
  const lastRollDate = rolls.length > 0 ? rolls[rolls.length - 1]!.date : endDate;
  let expiredLeft = 0;
  let noContract = 0;
  let renewedPlayers = 0;
  for (const sq of rolledSquads) {
    for (const p of sq.players) {
      if (!p.contract) noContract++;
      else if (p.contract.until < lastRollDate) expiredLeft++;
      const start = startContractUntil.get(p.id);
      if (p.contract && start && p.contract.until > start) renewedPlayers++;
    }
  }
  const freeAfter = await plain().getFreeAgents(saveId);
  console.log(`  ${rolledSquads.length} squads in rolled leagues; ${renewedPlayers} renewed players; ${freeAfter.length} free agents left`);
  check(rolledSquads.length > 0, `contratos: ${rolledSquads.length} rolled squads inspected`);
  check(noContract === 0, `contratos: every player of a rolled squad has a contract (${noContract} without)`);
  check(expiredLeft === 0, `contratos: no expired contract left in a rolled squad (${expiredLeft})`);
  check(renewedPlayers > 0, `contratos: some players renewed (${renewedPlayers})`);
  check(freeAfter.length > 0 || rolledSquads.length === 0, `contratos: some players left as free agents (${freeAfter.length} in the pool)`);
  for (const sq of rolledSquads) {
    rollSquadsChecked++;
    const counts: Record<string, number> = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 };
    for (const p of sq.players) counts[mainRoleOf(p.positions[0] ?? "CM")]!++;
    if (Object.entries(ROLE_MINIMUMS).some(([role, min]) => (counts[role] ?? 0) < min)) {
      rollUnderMinimum.push(`${sq.name}(${sq.players.length}:${Object.values(counts).join("/")})`);
    }
  }
  check(rollSquadsChecked > 0 && rollUnderMinimum.length === 0,
    `contratos: at the end of the run no rolled club is below the role minimums (${rollUnderMinimum.length} of ${rollSquadsChecked}`
    + `${rollUnderMinimum.length ? ` — ${rollUnderMinimum.slice(0, 5).join(", ")}` : ""})`);
  check(wageLineChecks > 0 && wageLineMismatches.length <= Math.ceil(wageLineChecks * 0.05),
    `contratos: weekly wages ledger line == sum of the squad's contracts (${wageLineChecks - wageLineMismatches.length}/${wageLineChecks} Mondays)`
    + (wageLineMismatches.length ? ` — e.g. ${wageLineMismatches.slice(0, 3).join("; ")}` : ""));

  // ── Lesões ───────────────────────────────────────────────────────────────
  // See `.claude/rules/game/injuries.md`. `allFiles` (final world state) already fetched above.
  console.log("\n── Lesões ──");

  const injuryRate = totalMatchesLogged > 0 ? totalMatchInjuries / totalMatchesLogged : NaN;
  console.log(`  ${totalMatchInjuries} injuries across ${totalMatchesLogged} logged matches (${isNaN(injuryRate) ? "n/a" : injuryRate.toFixed(3)}/match)`);
  check(totalMatchesLogged > 0, `lesões: ${totalMatchesLogged} match(es) logged (engine + quickSim)`);
  check(injuryRate >= 0.15 && injuryRate <= 0.5,
    `lesões: ${isNaN(injuryRate) ? "n/a" : injuryRate.toFixed(3)} injuries/match within 0.15..0.5`);

  check(injuredXIChecks > 0, `lesões: ${injuredXIChecks} player-appearance(s) checked against the pre-day injury snapshot (player's league)`);
  check(injuredXIViolations === 0,
    `lesões: no player injured on the match date appeared in a played XI (${injuredXIViolations} of ${injuredXIChecks} violated)`);

  check(healedObserved > 0, `lesões: at least one tracked injury healed during the run (${healedObserved} observed)`);

  const endDateForInjuryCheck = (await plain().getMeta(saveId))!.currentDate!;
  const staleInjuries = allFiles.flatMap(({ squad }) =>
    squad.players.filter((p) => p.injury && p.injury.returnDate < endDateForInjuryCheck).map((p) => `${squad.id}/${p.id}`));
  check(staleInjuries.length === 0,
    `lesões: no injury.returnDate earlier than currentDate left set at the end (${staleInjuries.length} stale, e.g. ${staleInjuries.slice(0, 3).join(", ")})`);

  // ── Disciplina ───────────────────────────────────────────────────────────
  // See `.claude/rules/game/discipline.md`. Per-match averages over every logged match (engine and
  // quickSim), no suspended player in a played XI of the player's league (pre-day snapshot, like
  // injuries), and at least one ban served during the run.
  console.log("\n── Disciplina ──");
  const per = (v: number) => (discMatches > 0 ? v / discMatches : NaN);
  console.log(`  ${discMatches} matches: fouls ${per(disc.fouls).toFixed(2)}, yellows ${per(disc.yellows).toFixed(2)}, ` +
    `reds ${per(disc.reds).toFixed(3)}, penalties ${per(disc.penalties).toFixed(3)} per match`);
  check(discMatches > 0, `disciplina: ${discMatches} logged match(es) carry discipline stats`);
  check(per(disc.fouls) >= 8 && per(disc.fouls) <= 16, `disciplina: fouls/match ${per(disc.fouls).toFixed(2)} within 8..16`);
  check(per(disc.yellows) >= 1.5 && per(disc.yellows) <= 4.5, `disciplina: yellows/match ${per(disc.yellows).toFixed(2)} within 1.5..4.5`);
  check(per(disc.reds) <= 0.3, `disciplina: reds/match ${per(disc.reds).toFixed(3)} <= 0.3`);
  check(per(disc.penalties) >= 0.1 && per(disc.penalties) <= 0.4, `disciplina: penalties/match ${per(disc.penalties).toFixed(3)} within 0.1..0.4`);
  check(suspendedXIChecks > 0, `disciplina: ${suspendedXIChecks} player-appearance(s) checked against the pre-day suspension snapshot`);
  check(suspendedXIViolations === 0,
    `disciplina: no suspended player appeared in a played XI (${suspendedXIViolations} of ${suspendedXIChecks} violated)`);
  check(suspensionsServedObserved > 0, `disciplina: at least one suspension served during the run (${suspensionsServedObserved} observed)`);

  // ── Equipe técnica ───────────────────────────────────────────────────────
  // See `.claude/rules/game/staff.md`. Every role filled and the coaches within the tier's limit; no
  // contract past its end; the forced contract renewed (or warned); the dismissal's severance and the
  // dismissed professional back in the pool; the goalkeeper trained by the Goalkeeping area; the
  // Monday `staff` line equal to the contracts; AI clubs store no staff.
  console.log("\n── Equipe técnica ──");
  const humanFinal = allFiles.find(({ squad }) => squad.id === playerSquadId)?.squad;
  const finalStaff = humanFinal?.staff?.members ?? [];
  // Every role but the field scouts (`.claude/rules/game/scouting.md`, hired separately).
  const { STAFF_ROLES } = await import("@/Domain/staff/staffTypes");
  const { roleLimit } = await import("@/Domain/staff/staff");
  const staffRoles = STAFF_ROLES.filter((r) => r !== "fieldScout" && finalStaff.some((m) => m.role === r));
  const fieldScoutCount = finalStaff.filter((m) => m.role === "fieldScout").length;
  check(staffRoles.length === STAFF_ROLES.length - 1,
    `staff: the human club has every role at the end (${staffRoles.join(", ")}; ${fieldScoutCount} field scout(s))`);
  const coachCount = finalStaff.filter((m) => m.role === "coach").length;
  check(!!humanFinal && coachCount <= roleLimit(humanFinal, "coach"),
    `staff: ${coachCount} area coach(es), within the tier's limit (${humanFinal ? roleLimit(humanFinal, "coach") : "?"})`);
  const staffEnd = (await plain().getMeta(saveId))!.currentDate!;
  const overdue = finalStaff.filter((m) => !m.contract || m.contract.until < staffEnd);
  check(overdue.length === 0, `staff: no contract past its end on ${staffEnd} (${overdue.map((m) => `${m.name} ${m.contract?.until ?? "none"}`).join(", ") || "none"})`);
  check(staffTrack.forcedKinds.has("staff_renewed") || staffTrack.forcedKinds.has("staff_expiring"),
    `staff: the forced contract was renewed by the director or warned (${[...staffTrack.forcedKinds].join(", ") || "no message"})`);
  check(staffTrack.fireStatus === 200 && staffTrack.hireStatus === 200,
    `staff: a coach dismissed and another hired through the routes (fire ${staffTrack.fireStatus}, hire ${staffTrack.hireStatus})`);
  const severanceLine = allLedgerEntries.find((e) => e.kind === "staff" && e.ref?.stage === "severance");
  check(!!severanceLine && severanceLine.amount < 0 && severanceLine.amount === -staffTrack.severance,
    `staff: the dismissal's severance is a negative staff line (${severanceLine?.amount ?? "none"}, route ${staffTrack.severance})`);
  const staffPoolEnd = await plain().getStaffPool(saveId, staffEnd);
  check(staffPoolEnd.members.some((m) => m.id === staffTrack.firedId),
    `staff: the dismissed coach is back in the free pool (${staffPoolEnd.members.length} free professionals)`);
  const gkEnd = humanFinal?.players.find((p) => p.id === staffTrack.gkId);
  check(!!gkEnd && ((gkEnd.stats.reflex ?? 0) !== staffTrack.gkReflex || (gkEnd.stats.jump ?? 0) !== staffTrack.gkJump),
    `staff: the starting goalkeeper's reflex/jump evolved (${staffTrack.gkReflex}/${staffTrack.gkJump} -> ${gkEnd?.stats.reflex ?? "?"}/${gkEnd?.stats.jump ?? "?"})`);
  check(staffTrack.mondays > 0 && staffTrack.mondayMismatch.length === 0,
    `staff: the Monday staff line equals the contracts (${staffTrack.mondays} Mondays${staffTrack.mondayMismatch.length ? `; ${staffTrack.mondayMismatch.slice(0, 3).join(" | ")}` : ""})`);
  check(allFiles.every(({ squad }) => squad.id === playerSquadId || squad.staff === undefined),
    "staff: no AI club stores staff (they use the implicit tier rating)");
  const wageDates = new Set(allLedgerEntries.filter((e) => e.kind === "wages").map((e) => e.date));
  const staffDates = new Set(allLedgerEntries.filter((e) => e.kind === "staff").map((e) => e.date));
  check(staffDates.size > 0 && [...wageDates].every((d) => staffDates.has(d)),
    `staff: a staff ledger line on every Monday with wages (${staffDates.size} staff lines, ${wageDates.size} wage lines)`);
  const staffTotal = allLedgerEntries.filter((e) => e.kind === "staff").reduce((s, e) => s + e.amount, 0);
  check(staffTotal < 0, `staff: total staff cost is an expense (${Math.round(staffTotal).toLocaleString("en-US")})`);

  // ── Fôlego ───────────────────────────────────────────────────────────────
  // ── Diretoria ──
  // See `.claude/rules/game/board-fans.md`. The smoke save has sacking disabled.
  console.log("\n── Diretoria ──");
  console.log(`  board ${boardTrack.boardMin.toFixed(1)}..${boardTrack.boardMax.toFixed(1)}, `
    + `fans ${boardTrack.fansMin.toFixed(1)}..${boardTrack.fansMax.toFixed(1)}, objectives: ${[...boardTrack.objectiveSeasons].join(" | ")}`);
  check(boardTrack.days === days, `board: meta.board present after every day (${boardTrack.days}/${days})`);
  check(boardTrack.outOfRange === 0, `board: meters always within 0..100 (${boardTrack.outOfRange} day(s) out)`);
  check(boardTrack.objectiveSeasons.size >= 2, `board: a new objective was set at the rollover (${boardTrack.objectiveSeasons.size} seen)`);
  check(!boardTrack.ended, "board: sacking disabled never sacks (meta.unemployed never set)");
  {
    const finalMeta = (await plain().getMeta(saveId))!;
    check(finalMeta.sackingEnabled === false, "board: the smoke save has sacking disabled");
    const inboxNow = await plain().getInbox(saveId);
    check(inboxNow.some((m) => m.category === "board" && m.kind === "objective"),
      "board: the inbox has the objective message of the new season");
    // Gate: the league home gates come from the attendance (facilities: min(capacity, demand), demand
    // = anchor capacity x the fans' fill x followers x tier x season phase); each one sits in the fans'
    // fill range of the anchor stadium, widened by the phase (0.98..1.06) and the followers' change.
    const capacity = humanFinal?.facilities?.anchor.capacity ?? humanFinal?.venue?.capacity ?? 0;
    const leagueGates = allLedgerEntries.filter(
      (e) => e.kind === "gate" && !!e.ref?.competition && !isCupSlug(e.ref.competition) && !isContinentalSlug(e.ref.competition),
    );
    const lo = gateRevenue(capacity, "league", false, stadiumFillRate(0)) * 0.98 * 0.85;
    const hi = gateRevenue(capacity, "league", false, stadiumFillRate(100)) * 1.06 * 1.3;
    check(leagueGates.length > 0 && leagueGates.every((e) => e.amount >= lo - 1 && e.amount <= hi + 1),
      `board: ${leagueGates.length} league gate(s) within the fans' fill range ${Math.round(lo)}..${Math.round(hi)}`);
    check(new Set(leagueGates.map((e) => e.amount)).size > 1,
      `board: the gate varies with the fans (${new Set(leagueGates.map((e) => e.amount)).size} distinct amounts)`);
  }

  // ── Instalações (`.claude/rules/game/facilities.md`) ──
  console.log("\n── Instalações ──");
  {
    const human = (await plain().getSquadById(saveId, playerSquadId))!;
    const f = human.facilities;
    check(facTrack.approved, "instalações: the board approved the +1000-seat stand (board forced to 90)");
    check(!!f && f.completed.some((c) => c.id === facTrack.projectId),
      `instalações: the project finished within the run (completed: ${f?.completed.map((c) => c.id).join(", ") ?? "none"})`);
    check((human.venue?.capacity ?? 0) === facTrack.seatsBefore + 1000,
      `instalações: venue capacity ${facTrack.seatsBefore} → ${human.venue?.capacity} (+1000)`);
    const done = f?.completed.find((c) => c.id === facTrack.projectId);
    const rowsAfter = (f?.attendance ?? []).filter((r) => done && r.date > done.date);
    check(rowsAfter.length > 0 && rowsAfter.every((r) => r.capacity === facTrack.seatsBefore + 1000),
      `instalações: ${rowsAfter.length} home game(s) after the works used the new capacity`);
    check((f?.attendance ?? []).every((r) => r.attendance <= r.capacity), "instalações: attendance never above the capacity");
    const paid = allLedgerEntries.filter((e) => e.kind === "facilities" && e.ref?.facility === "stand").reduce((s, e) => s - e.amount, 0);
    const funded = allLedgerEntries.filter((e) => e.kind === "board_funding" && e.label !== "Smoke: facilities funding").reduce((s, e) => s + e.amount, 0);
    check(paid === facTrack.cost, `instalações: instalments sum to the cost (${paid} == ${facTrack.cost})`);
    check(funded === Math.round(facTrack.cost * facTrack.boardShare),
      `instalações: board funding ${funded} == ${Math.round(facTrack.boardShare * 100)}% of the cost`);
    // League gates match the logged attendance (x comfort price).
    const priceMult = 1 + 0.06 * ((f?.comfort ?? 1) - 1);
    const byDate = new Map((f?.attendance ?? []).map((r) => [`${r.date}:${r.competition}`, r]));
    const matched = allLedgerEntries.filter((e) => e.kind === "gate" && !!e.ref?.competition
      && !isCupSlug(e.ref.competition) && !isContinentalSlug(e.ref.competition) && byDate.has(`${e.date}:${e.ref.competition}`));
    check(matched.length > 0 && matched.every((e) => Math.abs(e.amount - byDate.get(`${e.date}:${e.ref!.competition}`)!.attendance * 25 * priceMult) <= 25 * priceMult),
      `instalações: ${matched.length} league gate(s) = logged attendance × ticket price`);
    const aiWith = allFiles.filter(({ squad }) => squad.id !== playerSquadId && !!squad.facilities).length;
    check(aiWith === 0, `instalações: no AI club stores facilities (${aiWith})`);
  }

  console.log("\n── Fôlego ──");

  function monthlyMeans(samples: Array<{ month: string; value: number }>): Map<string, number> {
    const byMonth = new Map<string, number[]>();
    for (const s of samples) byMonth.set(s.month, [...(byMonth.get(s.month) ?? []), s.value]);
    const out = new Map<string, number>();
    for (const [month, values] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.set(month, values.reduce((s, v) => s + v, 0) / values.length);
    }
    return out;
  }

  const oppMonthly = monthlyMeans(oppFitnessSamples);
  const leagueMonthly = monthlyMeans(leagueFitnessSamples);
  console.log("  month     opponent XI   league AI XIs");
  for (const month of [...new Set([...oppMonthly.keys(), ...leagueMonthly.keys()])].sort()) {
    const o = oppMonthly.get(month);
    const l = leagueMonthly.get(month);
    console.log(`  ${month}   ${(o !== undefined ? o.toFixed(1) : "n/a").padStart(11)}   ${(l !== undefined ? l.toFixed(1) : "n/a").padStart(13)}`);
  }

  const allFitnessSamples = [...oppFitnessSamples, ...leagueFitnessSamples];
  check(allFitnessSamples.length > 0, `fôlego: ${allFitnessSamples.length} sample(s) collected across ${oppMonthly.size} month(s)`);
  const seasonMean = allFitnessSamples.length > 0
    ? allFitnessSamples.reduce((s, x) => s + x.value, 0) / allFitnessSamples.length
    : NaN;
  check(seasonMean >= 55 && seasonMean <= 95, `fôlego: season mean starting fitness ${seasonMean.toFixed(1)} within 55..95`);

  // "Not stuck": informational only (per the plan, a narrow range is reported, not failed) —
  // use the league-wide series, since it has far more samples per month than the single-opponent one.
  const leagueMonthlyValues = [...leagueMonthly.values()];
  const monthlyRange = leagueMonthlyValues.length > 0 ? Math.max(...leagueMonthlyValues) - Math.min(...leagueMonthlyValues) : 0;
  if (monthlyRange >= 2) {
    check(true, `fôlego: monthly means vary by ${monthlyRange.toFixed(1)} points across the season (not stuck)`);
  } else {
    console.log(`  fôlego: monthly means vary by only ${monthlyRange.toFixed(1)} point(s) across the season — informational only, not a failure`);
  }

  check(fitnessDifferedFromPlain,
    "fôlego: at least one AI club fielded a fitness-aware XI different from the plain autoFillLineup XI (fatigue-driven substitution)");

  const badFitness = allFiles.filter(({ squad }) =>
    squad.players.some((p) => typeof p.seasonLog?.fitness === "number" && (p.seasonLog.fitness < 0 || p.seasonLog.fitness > 100)));
  check(badFitness.length === 0, `no player fitness outside 0..100 across the world (${badFitness.length} squad(s) with an out-of-range value)`);

  const badLoad = allFiles.filter(({ squad }) =>
    squad.players.some((p) => typeof p.seasonLog?.load === "number" && p.seasonLog.load < 0));
  check(badLoad.length === 0, `no player load below 0 across the world (${badLoad.length} squad(s) with a negative load)`);

  check(rotationDiffered,
    "rotação: with assistantRotation on, at least one player match day fielded an XI different from the saved lineup because of fitness");

  // ── Posições ─────────────────────────────────────────────────────────────
  console.log("\n── Posições ──");
  {
    const { autoLineupForFormation, slotRoles: slotRolesOf } = await import("@/Domain/advanceDay/matchSimulationLineups");
    const { formationForSimId } = await import("@/Domain/matchFormations");
    const { unsuitableWithAlternative } = await import("@/Domain/positions/positionLineup");
    let squadsChecked = 0;
    const offenders: string[] = [];
    for (const { squad } of allFiles) {
      if (squad.id === playerSquadId || squad.players.length < 15) continue;
      squadsChecked++;
      // Each AI club's own season formation (4-3-3 until its first match of the season).
      const f = formationForSimId(squad.aiFormation?.id);
      const n = unsuitableWithAlternative(squad.players, autoLineupForFormation(squad, f), slotRolesOf(f));
      if (n > 0) offenders.push(`${squad.id} (${n})`);
    }
    check(squadsChecked > 0, `posições: ${squadsChecked} AI squad(s) checked`);
    check(offenders.length === 0,
      `posições: no AI XI fields an unsuitable player when a same-line alternative existed (${offenders.length} squad(s): ${offenders.slice(0, 5).join(", ")})`);
  }

  // ── Formações ────────────────────────────────────────────────────────────
  // See `.claude/rules/game/formations.md`: every AI club that played keeps its season formation on
  // the squad; the human club never stores one.
  console.log("\n── Formações ──");
  {
    const { FORMATION_IDS } = await import("@/Domain/matchFormations");
    const counts = new Map<string, number>();
    let withRecord = 0;
    let badId = 0;
    for (const { squad } of allFiles) {
      if (squad.id === playerSquadId || !squad.aiFormation) continue;
      withRecord++;
      if (!FORMATION_IDS.includes(squad.aiFormation.id)) badId++;
      counts.set(squad.aiFormation.id, (counts.get(squad.aiFormation.id) ?? 0) + 1);
    }
    const human = allFiles.find(({ squad }) => squad.id === playerSquadId)?.squad;
    check(withRecord > 0, `formações: ${withRecord} AI squad(s) store a season formation`);
    check(badId === 0, `formações: every stored AI formation is a ready-made one (${badId} unknown)`);
    check(counts.size >= 3, `formações: AI clubs use ${counts.size} different formations`);
    check(!human?.aiFormation, "formações: the human club stores no AI formation");
    console.log(`  ${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(" · ")}`);
  }

  // ── Base ─────────────────────────────────────────────────────────────────
  // See `.claude/rules/game/youth.md`: at the rollover every club gets a 3-5 player intake. The human
  // club keeps it in `squad.youth`; AI clubs promote 1-2 into the squad (<= 30) and drop the rest.
  console.log("\n── Base ──");
  {
    // The academy also holds a prospect signed by the scouts (`prospect_*`, `scouting.md`) during the
    // season: 16-17 when signed, a year older after the rollover (the academy keeps players up to 18).
    const academy = humanFinal?.youth ?? [];
    const intake = academy.filter((p) => /^youth_.+_\d{4}_\d+$/.test(p.id));
    const youthN = intake.length;
    check(youthN >= 3 && youthN <= 5, `base: the human club has ${youthN} academy player(s) from the intake (3-5; ${academy.length} in the academy)`);
    const { YOUTH } = await import("@/Domain/youth/youthConfig");
    const badAcademy = academy.filter((p) => !p.contract || p.age < YOUTH.INTAKE_AGE_MIN
      || p.age > (intake.includes(p) ? YOUTH.INTAKE_AGE_MAX : YOUTH.RELEASE_AGE - 1));
    check(badAcademy.length === 0,
      `base: intake players are 16-17, the others under ${YOUTH.RELEASE_AGE}, all with a contract (${badAcademy.map((p) => `${p.id} ${p.age}${p.contract ? "" : " no contract"}`).join(", ") || "ok"})`);
    check(!(humanFinal?.players ?? []).some((p) => /^youth_.+_\d{4}_\d+$/.test(p.id)),
      "base: no academy player entered the human first team on its own");
    const rolledLeagues = new Set(["premier_league", "of_championship", "serie_a", "of_italian_serie_b"]);
    const rolledAI = allFiles.filter(({ squad }) => squad.id !== playerSquadId && rolledLeagues.has(squad.leagueSlug ?? ""));
    const withProm = rolledAI.filter(({ squad }) => squad.players.some((p) => p.id.startsWith("youth_")));
    check(rolledAI.length > 0 && withProm.length / rolledAI.length >= 0.85,
      `base: ${withProm.length}/${rolledAI.length} AI clubs of the rolled leagues promoted an academy player (>= 85%)`);
    check(allFiles.every(({ squad }) => squad.id === playerSquadId || squad.youth === undefined),
      "base: no AI club stores an academy list");
    const aboveCap = allFiles.filter(({ squad }) => squad.id !== playerSquadId && squad.players.length > 30);
    check(aboveCap.length === 0,
      `base: no AI squad above 30 players (${aboveCap.map(({ squad }) => `${squad.id} ${squad.name} ${squad.players.length}`).join(", ") || "ok"})`);
    const allIds = allFiles.flatMap(({ squad }) => [...squad.players, ...(squad.youth ?? [])].map((p) => p.id));
    check(new Set(allIds).size === allIds.length, `base: player ids unique across the world (${allIds.length - new Set(allIds).size} dupes)`);
    const inbox = await plain().getInbox(saveId);
    check(inbox.some((m) => m.category === "youth" && m.kind === "intake"), "base: inbox has the intake message");
  }

  // ── Histórico ────────────────────────────────────────────────────────────
  // See `.claude/rules/game/history.md`: at the country rollover every player with games gets a row
  // of the closed season; the league champion's rows carry the league title.
  console.log("\n── Histórico ──");
  {
    const rcH = [...rolledCountries.values()].find((r) => r.closed.has(PLAYER_LEAGUE));
    const closedYear = rcH?.closed.get(PLAYER_LEAGUE);
    const arch = closedYear !== undefined ? await fsDal.readLeagueSeasonArchive(saveId, PLAYER_LEAGUE, closedYear) : null;
    check(!!arch, `histórico: ${PLAYER_LEAGUE} archive found`);
    if (arch) {
      const files = await plain().listSquadFiles(saveId);
      const players = files.flatMap(({ squad }) => squad.players.map((p) => ({ p, squadId: squad.id })));
      const played = Object.entries(arch.playerLogs).filter(([, l]) => l.appearances > 0);
      // The archived log is the whole season; a player transferred into the league mid-season has
      // open-then-settled partial rows plus the row of this club, which together add up to it.
      const label = seasonLabel(arch.year, arch.start, arch.end);
      let withRow = 0;
      let appsMatch = 0;
      let openLeft = 0;
      for (const [pid, log] of played) {
        const hit = players.find(({ p }) => p.id === pid);
        if (!hit) continue; // retired or released
        const seasonRows = (hit.p.history ?? []).filter((h) => h.season === label);
        if (seasonRows.length > 0) withRow++;
        const rowApps = seasonRows.reduce((a, h) => a + h.apps, 0);
        if (rowApps === log.appearances) appsMatch++;
        else console.log(`  mismatch ${pid} (${hit.p.name}, now ${hit.squadId}): rows ${rowApps} vs archived ${log.appearances} — ${JSON.stringify(seasonRows.map((h) => ({ c: h.squadId, a: h.apps, p: h.partial ?? false, o: h.open ?? false })))}`);
        if (seasonRows.some((h) => h.open)) openLeft++;
      }
      const alive = played.filter(([pid]) => players.some(({ p }) => p.id === pid)).length;
      check(alive > 0 && withRow === alive, `histórico: ${withRow}/${alive} ${PLAYER_LEAGUE} players with games have a row`);
      check(appsMatch === alive, `histórico: ${appsMatch}/${alive} season rows add up to the archived appearances`);
      check(openLeft === 0, `histórico: no open partial row left after the rollover (${openLeft})`);
      const champ = arch.standings[0]?.squadId;
      const champRows = players.filter(({ squadId }) => squadId === champ)
        .flatMap(({ p }) => p.history ?? []).filter((h) => h.squadId === champ);
      check(champRows.length > 0 && champRows.some((h) => h.titles.includes(`league:${PLAYER_LEAGUE}`)),
        `histórico: champion ${String(champ)} rows carry the league title`);
    }
  }

  // ── História do clube ────────────────────────────────────────────────────
  // See `.claude/rules/game/club-history.md`: at the country rollover every club of a rolled league gets
  // the season row; the club's scorers add up to the career rows at the club; the champion has the title.
  console.log("\n── História do clube ──");
  {
    const files = await plain().listSquadFiles(saveId);
    const free = await plain().getFreeAgents(saveId);
    const retiredCH = await plain().getRetired(saveId);
    // Goals per club from every career row in the world (squads, free agents, retired players).
    const rowGoals = new Map<string, number>();
    const histories = [
      ...files.flatMap(({ squad }) => squad.players.map((p) => p.history ?? [])),
      ...free.map((f) => f.player.history ?? []),
      ...retiredCH.map((r) => r.history ?? []),
    ];
    for (const h of histories) for (const r of h) rowGoals.set(r.squadId, (rowGoals.get(r.squadId) ?? 0) + r.goals);
    let clubs = 0;
    let withRow = 0;
    let goalsMatch = 0;
    let champTitle = 0;
    let champs = 0;
    for (const rc of rolledCountries.values()) {
      for (const [slug, year] of rc.closed) {
        const arch = await fsDal.readLeagueSeasonArchive(saveId, slug, year);
        if (!arch || arch.standings.length === 0) continue;
        const label = seasonLabel(arch.year, arch.start, arch.end);
        for (const [i, st] of arch.standings.entries()) {
          clubs++;
          const h = await fsDal.readClubHistory(saveId, st.squadId);
          const row = h?.seasons.find((x) => x.season === label && x.league === slug);
          if (row) withRow++;
          const sum = Object.values(h?.scorers ?? {}).reduce((a, x) => a + x.goals, 0);
          if (sum === (rowGoals.get(st.squadId) ?? 0)) goalsMatch++;
          if (i === 0 && st.mp > 0) {
            champs++;
            if (row?.titles.includes(`league:${slug}`)) champTitle++;
          }
        }
      }
    }
    check(clubs > 0 && withRow === clubs, `história do clube: ${withRow}/${clubs} clubs of the rolled leagues have the season row`);
    check(goalsMatch === clubs, `história do clube: ${goalsMatch}/${clubs} clubs' scorers add up to the career rows`);
    check(champs > 0 && champTitle === champs, `história do clube: ${champTitle}/${champs} champions have the league title`);
    const mine = await fsDal.readClubHistory(saveId, playerSquadId);
    console.log(`  player club: ${mine?.seasons.length ?? 0} season(s), records ${Object.keys(mine?.records ?? {}).join(", ")}`);
  }

  // ── Prêmios ──────────────────────────────────────────────────────────────
  // See `.claude/rules/game/awards.md`: every rolled league gives its awards at its rollover; the goal of
  // the season only in the full-engine leagues; the world ceremony is in January (covered by a test).
  console.log("\n── Prêmios ──");
  {
    const t = awardsTrack;
    const rolledCount = rolls.reduce((n, r) => n + r.leagues.length, 0);
    console.log(`  ${t.leagues}/${rolledCount} rolled league(s) with awards; ${t.goalLeagues} with a goal of the season; `
      + `${t.xiComplement} team-of-the-season pick(s) below the minimum (complement, informative)`);
    check(t.leagues > 0 && t.missing.length === 0, `prêmios: every rolled league has its entry (${t.missing.length} missing: ${t.missing.slice(0, 5).join("; ")})`);
    check(t.xiBad.length === 0, `prêmios: team of the season = 11 unique players in the 4-3-3 slots (${t.xiBad.join("; ")})`);
    check(t.minAppsBad.length === 0, `prêmios: best player, young player and goalkeeper reach the minimum league games (${t.minAppsBad.slice(0, 5).join("; ")})`);
    check(t.youngBad.length === 0, `prêmios: young player aged <= ${AWARDS.YOUNG_MAX_AGE} in the season (${t.youngBad.join("; ")})`);
    check(t.gkBad.length === 0, `prêmios: best goalkeeper is a goalkeeper (${t.gkBad.join("; ")})`);
    check(t.scorerBad.length === 0, `prêmios: top scorer has the most league goals (${t.scorerBad.slice(0, 5).join("; ")})`);
    check(t.goalInQuick.length === 0, `prêmios: no goal of the season in a quick-sim league (${t.goalInQuick.join("; ")})`);
    check(t.goalMissing.length === 0, `prêmios: goal of the season whenever a full-engine league had a candidate (${t.goalMissing.join("; ")})`);
    check(t.rowMissing.length === 0, `prêmios: every winner has the award on his season row (${t.rowMissing.length}: ${t.rowMissing.slice(0, 5).join("; ")})`);
    check(t.boostMissing.length === 0, `prêmios: every winner in a squad has the value boost, except the ${t.boostReleased} released and re-signed the same day (${t.boostMissing.length}: ${t.boostMissing.slice(0, 5).join("; ")})`);
    check(t.moraleMissing.length === 0, `prêmios: ${t.moraleApplied} winner(s) of the player's club got the award morale event (${t.moraleUp} ended the day higher; missing: ${t.moraleMissing.join("; ")})`);
    check(t.managerMissing.length === 0, `prêmios: every best manager has the award on his record (${t.managerMissing.join("; ")})`);
    check(t.playerMessage === true, `prêmios: awards message of the player's league in the inbox (${String(t.playerMessage)})`);
    console.log("  mundial: coberto por awards.world.test.ts (a corrida não passa por janeiro)");
  }

  // ── Técnicos ─────────────────────────────────────────────────────────────
  // See `.claude/rules/game/managers.md`: one manager per club (the player's replacing his club's coach);
  // the league champion's manager scores the league title at the rollover; cup and continental
  // champions score on the day of the final.
  console.log("\n── Técnicos ──");
  {
    const managers = await plain().getManagers(saveId);
    const mine = managers.filter((m) => m.isPlayer);
    check(mine.length === 1 && mine[0]!.squadId === playerSquadId, `técnicos: exactly one player manager, at ${playerSquadId}`);
    // Since 4.0 free managers (`squadId` "") live in the same file (`.claude/rules/game/transfer-windows.md`).
    const employed = managers.filter((m) => m.squadId !== "");
    check(new Set(employed.map((m) => m.squadId)).size === employed.length, "técnicos: one manager per club");
    check(managers.every((m) => m.points >= 0), "técnicos: no manager with negative points");
    check(managers.every((m) => m.points === m.titles.reduce((a, t) => a + t.points, 0)), "técnicos: points add up to the titles");
    const rcT = [...rolledCountries.values()].find((r) => r.closed.has(PLAYER_LEAGUE));
    const closedYearT = rcT?.closed.get(PLAYER_LEAGUE);
    const archT = closedYearT !== undefined ? await fsDal.readLeagueSeasonArchive(saveId, PLAYER_LEAGUE, closedYearT) : null;
    const champT = archT?.standings[0]?.squadId;
    const champMgr = managers.find((m) => m.squadId === champT);
    check(!!champMgr && champMgr.titles.some((t) => t.kind === "league" && t.competition === PLAYER_LEAGUE && t.points > 0),
      `técnicos: ${PLAYER_LEAGUE} champion ${String(champT)}'s manager scored the league title`);
    const rolledLeagueSet = new Set(rolls.flatMap((r) => r.leagues));
    const rolledClubs = allFiles.filter(({ squad }) => rolledLeagueSet.has(squad.leagueSlug ?? "")).map(({ squad }) => squad.id);
    // A manager hired after his club's rollover (AI sackings since 4.0) has not completed a season there yet.
    const rollDateOf = new Map<string, string>();
    for (const r of rolls) for (const l of r.leagues) if (!rollDateOf.has(l)) rollDateOf.set(l, r.date);
    const leagueOfClub = new Map(allFiles.map(({ squad }) => [squad.id, squad.leagueSlug ?? ""] as const));
    const counted = rolledClubs.filter((id) => {
      const m = employed.find((x) => x.squadId === id);
      const spell = m?.clubs?.[m.clubs.length - 1];
      const rolledOn = rollDateOf.get(leagueOfClub.get(id) ?? "");
      // A rollover-day sacking (AI managers, 4.0) puts a new manager in on the rollover date itself.
      return !m || !spell || !rolledOn || spell.from < rolledOn;
    });
    const noSeason = counted.filter((id) => (employed.find((m) => m.squadId === id)?.seasons ?? 0) < 1);
    check(noSeason.length === 0,
      `técnicos: every manager in charge at the rollover of the ${counted.length}/${rolledClubs.length} rolled clubs has a season`
      + (noSeason.length ? ` — e.g. ${noSeason.slice(0, 3).map((id) => { const m = employed.find((x) => x.squadId === id); return `${id}:${m?.id ?? "none"}:${JSON.stringify(m?.clubs?.slice(-1) ?? [])}@${rollDateOf.get(leagueOfClub.get(id) ?? "")}`; }).join("; ")} (${noSeason.length})` : ""));
    const titles = managers.flatMap((m) => m.titles);
    check(titles.some((t) => t.kind === "cup"), "técnicos: at least one national cup title credited");
    check(titles.some((t) => t.kind === "continental"), "técnicos: at least one continental title credited");
    console.log(`  titles credited: ${titles.length} (league ${titles.filter((t) => t.kind === "league").length}, `
      + `cup ${titles.filter((t) => t.kind === "cup").length}, continental ${titles.filter((t) => t.kind === "continental").length}, `
      + `promotion ${titles.filter((t) => t.kind === "promotion").length})`);
    const top = rankManagers(managers).slice(0, 5);
    for (const [i, m] of top.entries()) console.log(`  ${i + 1}. ${m.name} (${m.squadId}) ${m.points} pts, ${m.titles.length} titles`);
    const myRank = rankManagers(managers).findIndex((m) => m.isPlayer) + 1;
    console.log(`  player manager: #${myRank} of ${managers.length}, ${mine[0]?.points ?? 0} pts`);
  }

  // ── Aposentadoria ────────────────────────────────────────────────────────
  // See `.claude/rules/game/retirement.md`: at each country rollover players >= 34 may retire (squads and
  // free agents), leaving a minimal record in `retired.json`. A world-class retiree of the human club
  // can be reborn in the academy (forced path below).
  console.log("\n── Aposentadoria ──");
  {
    const retired = await plain().getRetired(saveId);
    check(retired.length > 0, `aposentadoria: ${retired.length} player(s) retired during the run`);
    const byDate = new Map<string, number[]>();
    const fa = retired.filter((r) => r.freeAgent).length;
    console.log(`  retirees: ${retired.length - fa} from squads, ${fa} from the free-agent pool`);
    for (const r of retired) byDate.set(r.retiredOn, [...(byDate.get(r.retiredOn) ?? []), r.age]);
    for (const [d, ages] of [...byDate].sort()) {
      console.log(`  ${d}: ${ages.length} retirements, ages ${Math.min(...ages)}-${Math.max(...ages)}, `
        + `mean ${(ages.reduce((x, y) => x + y, 0) / ages.length).toFixed(1)}`);
    }
    check(retired.every((r) => r.age >= 33 && r.name && r.positions.length > 0 && r.statsAtRetirement && r.retiredOn),
      "aposentadoria: every record has age >= 33 (free agents retire at age + 1 >= 34), name, positions, stats and date");
    const retiredIds = new Set(retired.map((r) => r.id));
    check(new Set(retired.map((r) => r.id)).size === retired.length, "aposentadoria: retired ids are unique");
    const alive = new Set([
      ...allFiles.flatMap(({ squad }) => [...squad.players, ...(squad.youth ?? [])].map((p) => p.id)),
      ...(await plain().getFreeAgents(saveId)).map((f) => f.player.id),
    ]);
    check(![...retiredIds].some((id) => alive.has(id)), "aposentadoria: no retired player is still in a squad, academy or the free pool");
    const rolledAges = allFiles.filter(({ squad }) => new Set(rolls.flatMap((r) => r.leagues)).has(squad.leagueSlug ?? ""))
      .flatMap(({ squad }) => squad.players.map((p) => p.age));
    check(rolledAges.every((a) => a < 40), `aposentadoria: nobody aged 40+ in a rolled league (max ${Math.max(...rolledAges)})`);
    const pool = await plain().getFreeAgents(saveId);
    check(pool.every((f) => f.player.age < 40), "aposentadoria: nobody aged 40+ in the free pool");
    const humanRetired = retired.filter((r) => r.squadId === playerSquadId);
    const inboxR = await plain().getInbox(saveId);
    check(inboxR.filter((m) => m.category === "retirement").length >= humanRetired.length,
      `aposentadoria: inbox has a message for each of the ${humanRetired.length} human retiree(s)`);

    // Forced reborn: a pending world-class record, accepted through the route.
    const { apiRoutes } = await import("@/backend/routes");
    const { devAutoLogin } = await import("@/backend/auth/AuthService");
    // The Instalações section above already recorded the save's owner (smoke-reborn).
    const { session } = devAutoLogin("smoke-reborn@test.local");
    const template = humanFinal!.players[0]!;
    const legend = {
      id: "smoke_legend", name: "Smoke Legend", nationality: template.nationality ?? null, positions: ["ST"],
      preferredFoot: "left" as const, profile: template.profile, retiredOn: endDate, squadId: playerSquadId,
      age: 39, wasWorldClass: true, appearances: 30, goals: 20, rebornOffer: "pending" as const,
      statsAtRetirement: { ...template.stats, finishing: 10, tackling: 2 },
    };
    await plain().writeRetired(saveId, [...(await plain().getRetired(saveId)), legend]);
    const handler = apiRoutes["/api/saves/:saveId/reborn/:retiredId" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    const res = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/reborn/smoke_legend`, {
        method: "POST", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
        body: JSON.stringify({ accept: true }),
      }),
      { params: { saveId, retiredId: "smoke_legend" } },
    ));
    check(res.status === 200, `aposentadoria: forced reborn accepted (status ${res.status})`);
    const after = (await plain().listSquadFiles(saveId)).find(({ squad }) => squad.id === playerSquadId)?.squad;
    const born = after?.youth?.find((p) => p.reborn?.fromId === "smoke_legend");
    check(!!born && born.age === 17 && !!born.contract, "aposentadoria: the reborn player is a 17-year-old with a contract in the academy");
    check(!!born && (await plain().getRetired(saveId)).find((r) => r.id === "smoke_legend")?.rebornOffer === "accepted",
      "aposentadoria: the offer is marked accepted");
  }

  // ── Negociação (`.claude/rules/game/negotiation.md`) ──
  // Natural AI bids for the listed players during the run; then, through the routes: a purchase
  // with a counter-offer, a sale from an inbox bid (paying the clause the player carried), a loan in
  // and a loan out that both go back on their date, and a sell-on clause of the human paid on a resale.
  console.log("\n── Negociação ──");
  // Etapa 25: fee buys and loans need the human club's window open — advance to it (the run ends after
  // the player's country rollover, a few days before the summer window opens). No random rival here:
  // the deals below check exact counters (the "Mercado vivo" section forces its own rival).
  process.env.FM_NO_RIVALS = "1";
  {
    const { loadWindowContext: lwc } = await import("@/backend/marketWindowWorld");
    let waited = 0;
    for (; waited < 60; waited++) {
      const m = (await plain().getMeta(saveId))!;
      if ((await lwc(m, await plain().getSquadIndex(saveId))).human().open) break;
      const out = await runBufferedDay(saveId);
      if (!out.ok) { check(false, `negociação: day failed ${out.status} ${out.error}`); break; }
    }
    console.log(`  ${waited} day(s) advanced to the human club's transfer window`);
  }
  {
    const kinds = [...negoMessages.values()];
    const count = (k: string) => kinds.filter((x) => x === k).length;
    console.log(`  inbox: ${count("bid")} transfer bid(s), ${count("loan_bid")} loan bid(s) for the listed players`);
    check(count("bid") > 0, `negociação: AI clubs bid for the listed players through the inbox (${count("bid")})`);
    const sqN = (await plain().getSquadById(saveId, playerSquadId))!;
    check(negoListed.sale.every((id) => sqN.players.some((p) => p.id === id)) || count("bid") > 0,
      "negociação: listed players are never sold without the player's answer");

    const { apiRoutes } = await import("@/backend/routes");
    const { devAutoLogin } = await import("@/backend/auth/AuthService");
    const { session } = devAutoLogin("smoke-reborn@test.local");
    const call = async (key: string, path: string, params: Record<string, string>, body?: unknown) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      const res = await handler(Object.assign(
        new Request(`http://localhost${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
        { params },
      ));
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
    };
    const { Player: PlayerN } = await import("@/Domain/Player");
    const { playerOverallRating: ratingN, teamAvgRating: avgN } = await import("@/Domain/transfer/transferNeeds");
    const { addDays: addDaysN } = await import("@/Domain/dates");
    const metaN = (await plain().getMeta(saveId))!;
    const dateN = metaN.currentDate!;
    // Plenty of money for the forced deals (the ledger is checked elsewhere; this only moves budget).
    await plain().saveSquadById(saveId, { ...sqN, finances: { ...sqN.finances!, budget: (sqN.finances?.budget ?? 0) + 500_000_000 } });
    // Keep the ledger summing to the balance (section "Convites" checks it again).
    await plain().appendLedger(saveId, (await plain().getLeagueMeta(saveId, metaN.leagueSlug))!.year, [
      { date: dateN, kind: "prize", amount: 500_000_000, label: "Smoke: negotiation money", ref: { stage: "board_bonus" } },
    ]);

    // 1. Purchase with a counter-offer.
    const aiClubs = (await plain().getSquadsInLeague(saveId, metaN.leagueSlug)).filter((s) => s.id !== playerSquadId && s.players.length >= 22);
    let bought: { id: string; from: string } | null = null;
    for (const club of aiClubs) {
      const avg = avgN(club);
      const target = club.players.find((p) => !p.loan && p.positions[0] !== "GK" && p.age <= 30 && Math.abs(ratingN(p) - avg) < 0.25);
      if (!target) continue;
      const value = new PlayerN(ratingN(target), target.age).price;
      const first = await call("/api/saves/:saveId/transfers", `/api/saves/${saveId}/transfers`, { saveId },
        { playerId: target.id, fromSquadId: club.id, fee: Math.round(value * 0.85 / 100_000) * 100_000, sellOnPct: 10 });
      const resp = first.body.response as { kind: string; counterFee?: number } | undefined;
      if (resp?.kind !== "counter") continue;
      const second = await call("/api/saves/:saveId/transfers", `/api/saves/${saveId}/transfers`, { saveId },
        { playerId: target.id, fromSquadId: club.id, fee: resp.counterFee, sellOnPct: 10 });
      check((second.body.response as { kind: string } | undefined)?.kind === "accept",
        `negociação: counter of ${target.name} (${club.name}) accepted at ${resp.counterFee}`);
      bought = { id: target.id, from: club.id };
      break;
    }
    check(!!bought, "negociação: a purchase went through a counter-offer");
    const mine1 = (await plain().getSquadById(saveId, playerSquadId))!;
    const boughtPlayer = bought ? mine1.players.find((p) => p.id === bought!.id) : undefined;
    check(!!boughtPlayer?.sellOn && boughtPlayer.sellOn.clubId === bought?.from && boughtPlayer.sellOn.pct === 10,
      "negociação: the bought player carries the seller's 10% sell-on clause");

    // 2. Sale from an inbox bid: the bought player, to another club, asking a 20% clause. The 10%
    //    clause he carried goes to his old club.
    const liveBids = ((await call("/api/saves/:saveId/negotiation", `/api/saves/${saveId}/negotiation`, { saveId })).body.bids ?? []) as import("@/types/transferMarketTypes").MarketBid[];
    console.log(`  live bids at the end of the run: ${liveBids.length}`);
    if (boughtPlayer && bought) {
      // A buyer the route accepts: room under the AI cap and the player's wage under its wage cap.
      const { aiClubFinance: finB, passesWageGate: gateB, estimateWeeklyWage: wageB } = await import("@/Domain/aiFinance/aiClubFinance");
      const { wageFactorOf: factorB } = await import("@/Domain/finance/wages");
      const fresh = await Promise.all(aiClubs.map(async (c) => (await plain().getSquadById(saveId!, c.id))!));
      const buyer = fresh.find((c) => c.id !== bought!.from && c.players.length < 30
        && gateB(finB(c), wageB(boughtPlayer, factorB(c)), 0)) ?? fresh.find((c) => c.id !== bought!.from)!;
      await plain().saveSquadById(saveId, { ...(await plain().getSquadById(saveId, buyer.id))!, aiTransferBudget: 200_000_000 });
      const mkB = (await plain().getMarket(saveId))!;
      const bid = {
        id: "smoke-bid", kind: "transfer" as const, playerId: boughtPlayer.id, playerName: boughtPlayer.name,
        clubId: buyer.id, clubName: buyer.name, date: dateN, expires: addDaysN(dateN, 5), fee: 10_000_000, maxFee: 40_000_000, sellOnPct: 0,
      };
      await plain().saveMarket(saveId, { ...mkB, pendingBids: [...(mkB.pendingBids ?? []), bid] });
      const oldClubBudget = aiTransferBudgetOf((await plain().getSquadById(saveId, bought.from))!);
      const counter = await call("/api/saves/:saveId/bids/:bidId", `/api/saves/${saveId}/bids/smoke-bid`, { saveId, bidId: "smoke-bid" },
        { action: "counter", fee: 30_000_000, sellOnPct: 20 });
      check(counter.status === 200, `negociação: counter on an inbox bid answered (${counter.status} ${String(counter.body.status ?? counter.body.error)}; ${buyer.name} ${buyer.players.length} players)`);
      // A counter inside the AI club's max closes the sale at once; otherwise accept its answer.
      const sale = counter.body.status === "sold"
        ? counter
        : await call("/api/saves/:saveId/bids/:bidId", `/api/saves/${saveId}/bids/smoke-bid`, { saveId, bidId: "smoke-bid" }, { action: "accept" });
      check(sale.status === 200 && sale.body.status === "sold", `negociação: inbox bid accepted, ${boughtPlayer.name} sold to ${buyer.name}`);
      const sold = (await plain().getSquadById(saveId, buyer.id))!.players.find((p) => p.id === boughtPlayer.id);
      check(sold?.sellOn?.clubId === playerSquadId && sold.sellOn.pct === 20, "negociação: the human keeps a 20% sell-on clause on the sold player");
      check(aiTransferBudgetOf((await plain().getSquadById(saveId, bought.from))!) > oldClubBudget,
        "negociação: the old 10% clause was paid to the first club (transfer budget up)");

      // 3. Sell-on of the human paid on a resale (the AI market's own code path).
      if (sold) {
        const third = aiClubs.find((c) => c.id !== buyer.id && c.id !== bought!.from)!;
        const { squadsAfterAcceptedTransfer } = await import("@/Domain/transfer/transferAcceptance");
        const { executeTransferFee } = await import("@/backend/FinancialService");
        const { sellOnFor, settleSellOn } = await import("@/backend/negotiationWorld");
        const svcN = plain();
        const sellerN = (await svcN.getSquadById(saveId, buyer.id))!;
        const buyerN = (await svcN.getSquadById(saveId, third.id))!;
        const moved = squadsAfterAcceptedTransfer(sold, sellerN, buyerN, buyerN.id, sold.id);
        const owed = sellOnFor(sold, sellerN.id, 25_000_000);
        const sRef = (await svcN.resolveSquadId(saveId, sellerN.id))!;
        const bRef = (await svcN.resolveSquadId(saveId, buyerN.id))!;
        await executeTransferFee(saveId, metaN, { squad: moved.buying, ...bRef, isPlayerClub: false }, { squad: moved.selling, ...sRef, isPlayerClub: false },
          25_000_000, svcN, { playerName: sold.name, playerId: sold.id, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) });
        const news = await settleSellOn(svcN, saveId, metaN, owed, sold, sellerN.name, dateN);
        check(owed?.amount === 5_000_000 && news?.kind === "sell_on", "negociação: a resale paid the human's 20% clause (5M)");
        const entries: LedgerEntry[] = [];
        for (const season of await plain().listLedgerSeasons(saveId)) entries.push(...(await plain().getLedger(saveId, season)));
        check(entries.some((e) => e.kind === "transfer_in" && e.ref?.stage === "sell_on" && e.amount === 5_000_000),
          "negociação: the sell-on money is a transfer_in ledger line");
      }
    }

    // 4. Loan in (≤ 23, not a starter of his club), then back on its date.
    let loanedIn: string | null = null;
    for (const club of aiClubs) {
      const xi = new Set(autoLineupDefaultFormation(club));
      const kid = club.players.find((p) => p.age <= 23 && !xi.has(p.id) && !p.loan && p.positions[0] !== "GK");
      if (!kid) continue;
      let r = await call("/api/saves/:saveId/loans", `/api/saves/${saveId}/loans`, { saveId }, { playerId: kid.id, fromSquadId: club.id, wageShare: 50, fee: 0 });
      let resp = r.body.response as { kind: string; wageShare?: number; fee?: number } | undefined;
      if (resp?.kind === "counter") {
        r = await call("/api/saves/:saveId/loans", `/api/saves/${saveId}/loans`, { saveId },
          { playerId: kid.id, fromSquadId: club.id, wageShare: Math.round((resp.wageShare ?? 1) * 100), fee: resp.fee ?? 0 });
        resp = r.body.response as { kind: string } | undefined;
      }
      if (resp?.kind !== "accept") continue;
      loanedIn = kid.id;
      break;
    }
    check(!!loanedIn, "negociação: a loan in was agreed");

    // 5. Loan out: a natural loan bid if one is live, else a forced one.
    const mine2 = (await plain().getSquadById(saveId, playerSquadId))!;
    let loanBid = liveBids.find((b) => b.kind === "loan" && mine2.players.some((p) => p.id === b.playerId));
    if (!loanBid) {
      const out = mine2.players.find((p) => !p.loan && p.positions[0] !== "GK" && p.id !== loanedIn)!;
      loanBid = {
        id: "smoke-loan", kind: "loan", playerId: out.id, playerName: out.name, clubId: aiClubs[0]!.id, clubName: aiClubs[0]!.name,
        date: dateN, expires: addDaysN(dateN, 5), fee: 0, wageShare: 0.7, until: addDaysN(dateN, 30),
      };
      const mkL = (await plain().getMarket(saveId))!;
      await plain().saveMarket(saveId, { ...mkL, pendingBids: [...(mkL.pendingBids ?? []), loanBid] });
    }
    const lo = await call("/api/saves/:saveId/bids/:bidId", `/api/saves/${saveId}/bids/${loanBid.id}`, { saveId, bidId: loanBid.id }, { action: "accept" });
    check(lo.status === 200 && lo.body.status === "loaned", `negociação: ${loanBid.playerName} loaned out to ${loanBid.clubName} (${count("loan_bid") > 0 ? "natural" : "forced"} bid)`);

    // Both loans end in 2 days: the day advance sends them back.
    const mkE = (await plain().getMarket(saveId))!;
    const soon = addDaysN(dateN, 2);
    const ids = new Set([loanedIn, loanBid.playerId].filter((x): x is string => !!x));
    await plain().saveMarket(saveId, { ...mkE, loans: (mkE.loans ?? []).map((l) => (ids.has(l.playerId) ? { ...l, until: soon } : l)) });
    for (const l of (mkE.loans ?? []).filter((x) => ids.has(x.playerId))) {
      const holder = (await plain().getSquadById(saveId, l.toClubId))!;
      await plain().saveSquadById(saveId, { ...holder, players: holder.players.map((p) => (p.id === l.playerId && p.loan ? { ...p, loan: { ...p.loan, until: soon } } : p)) });
    }
    const humanWithLoan = (await plain().getSquadById(saveId, playerSquadId))!;
    const { squadWeeklyWages, wageFactorOf } = await import("@/Domain/finance/wages");
    const borrowed = humanWithLoan.players.find((p) => p.id === loanedIn);
    if (borrowed?.loan) {
      check(squadWeeklyWages([borrowed], wageFactorOf(humanWithLoan)) === Math.round((borrowed.contract?.wage ?? 0) * borrowed.loan.wageShare),
        "negociação: the borrowed player costs only the agreed share of his wage");
    }
    for (let g = 0; g < 3; g++) {
      const out = await runBufferedDay(saveId);
      if (!out.ok) { check(false, `negociação: day failed ${out.status} ${out.error}`); break; }
    }
    const mine3 = (await plain().getSquadById(saveId, playerSquadId))!;
    check(!!loanedIn && !mine3.players.some((p) => p.id === loanedIn), "negociação: the borrowed player went back to his club on the date");
    check(mine3.players.some((p) => p.id === loanBid!.playerId && !p.loan), "negociação: the loaned-out player came back on the date");
    const inboxN = await plain().getInbox(saveId);
    check(inboxN.some((m) => m.category === "transfer" && m.kind === "loan_back") && inboxN.some((m) => m.category === "transfer" && m.kind === "loan_home"),
      "negociação: inbox news for both loans ending");
    const back = mine3.players.find((p) => p.id === loanBid!.playerId);
    console.log(`  history row of the loaned-out player: ${JSON.stringify((back?.history ?? []).slice(-1))}`);
  }

  delete process.env.FM_NO_RIVALS;

  // ── Mercado vivo (`.claude/rules/game/transfer-windows.md`, Etapa 25) ──
  // Every fee transfer / loan start inside the buyer's window, transfers in both windows crossed; one
  // manager per club every Monday, passages closed with a reason, AI sackings and vacancies filled in
  // 21 days; the manager's wage every Monday; a rival that wins the deadline takes the player.
  console.log("\n── Mercado vivo ──");
  {
    console.log(`  ${livelyTrack.moves} fee transfer(s)/loan start(s) logged; windows seen: ${[...livelyTrack.kinds].join(", ")}`);
    check(livelyTrack.moves > 0, `mercado vivo: transfers logged in the day logs (${livelyTrack.moves})`);
    check(livelyTrack.outside.length === 0, `mercado vivo: no fee transfer or loan start outside the buyer's window (${livelyTrack.outside.slice(0, 3).join("; ")})`);
    check(livelyTrack.kinds.has("pre") && livelyTrack.kinds.has("mid"), `mercado vivo: transfers in both windows (${[...livelyTrack.kinds].join(", ")})`);
    const ms = await plain().getManagers(saveId);
    const sacked = ms.flatMap((m) => (m.clubs ?? []).filter((c) => c.left === "sacked")).length;
    console.log(`  ${livelyTrack.managerChecks} Monday manager check(s); ${sacked} sacking(s); ${livelyTrack.vacancyFilled} vacancy(ies) filled; ` +
      `${ms.filter((m) => !m.isPlayer && !m.squadId && !m.retired).length} free manager(s)`);
    check(livelyTrack.managerChecks > 0 && livelyTrack.invariantBreaks.length === 0,
      `mercado vivo: one manager per club on every Monday (${livelyTrack.invariantBreaks.slice(0, 2).join("; ")})`);
    check(livelyTrack.closedWithoutLeft === 0 && livelyTrack.openPassagesWithLeft === 0,
      `mercado vivo: closed passages carry a reason (${livelyTrack.closedWithoutLeft} without, ${livelyTrack.openPassagesWithLeft} open with one)`);
    check(sacked > 0, `mercado vivo: AI managers were sacked during the run (${sacked})`);
    check(livelyTrack.vacancyFilled > 0 && livelyTrack.vacancyLate.length === 0,
      `mercado vivo: vacancies filled within 21 days (${livelyTrack.vacancyFilled} filled, late: ${livelyTrack.vacancyLate.slice(0, 3).join("; ")})`);
    check(livelyTrack.orphanInterims.length === 0, `mercado vivo: every interim waits on a vacancy (${livelyTrack.orphanInterims.slice(0, 3).join("; ")})`);

    // The manager's wage: a `manager` line every Monday with the contract's wage.
    const mm = (await plain().getMeta(saveId))!;
    const ledgerAll: LedgerEntry[] = [];
    for (const season of await plain().listLedgerSeasons(saveId)) ledgerAll.push(...(await plain().getLedger(saveId, season)));
    const wageMondays = new Set(ledgerAll.filter((e) => e.kind === "wages").map((e) => e.date));
    const managerLines = ledgerAll.filter((e) => e.kind === "manager" && e.ref?.stage !== "severance");
    const managerMondays = new Set(managerLines.map((e) => e.date));
    check(wageMondays.size > 0 && [...wageMondays].every((d) => managerMondays.has(d)),
      `mercado vivo: a manager wage line on every Monday with wages (${managerMondays.size}/${wageMondays.size})`);
    check(!!mm.managerContract && managerLines.every((e) => -e.amount === mm.managerContract!.wage),
      `mercado vivo: the manager line is the contract wage (${mm.managerContract?.wage})`);
    const share = mm.managerContract ? (mm.managerContract.wage * 52) / Math.max(1, (await plain().getSquadById(saveId, playerSquadId))!.wageRevenueBasis ?? 1) : 0;
    console.log(`  manager wage ${mm.managerContract?.wage}/week = ${(100 * share).toFixed(2)}% of the club's revenue; earnings ${mm.managerEarnings}`);
    check(share >= 0.015 && share <= 0.04, `mercado vivo: manager wage 1,5..4% of the revenue (${(100 * share).toFixed(2)}%)`);

    // A rival wins the deadline: forced on an AI target of the player's league.
    const { Player: PlayerM } = await import("@/Domain/Player");
    const { playerOverallRating: ratingM } = await import("@/Domain/transfer/transferNeeds");
    const { contractDemand: demandM } = await import("@/Domain/contracts/contracts");
    const clubsM = (await plain().getSquadsInLeague(saveId, mm.leagueSlug)).filter((s) => s.id !== playerSquadId && s.players.length >= 22);
    const seller = clubsM[0]!;
    const rival = clubsM.find((c) => c.id !== seller.id && c.players.length < 29)!;
    const target = seller.players.find((p) => !p.loan && p.positions[0] !== "GK" && p.age <= 29)!;
    const fee = Math.round(new PlayerM(ratingM(target), target.age).price * 1.3);
    await plain().saveSquadById(saveId, { ...rival, aiTransferBudget: fee * 2 });
    const mkM = (await plain().getMarket(saveId))!;
    const dateM = mm.currentDate!;
    await plain().saveMarket(saveId, {
      ...mkM,
      rivalBids: [...(mkM.rivalBids ?? []), {
        playerId: target.id, playerName: target.name, fromClubId: seller.id, clubId: rival.id, clubName: rival.name,
        fee, wage: demandM(target, rival, dateM), date: dateM, deadline: dateM, sellerAccepts: true,
      }],
    });
    const outM = await runBufferedDay(saveId);
    check(outM.ok, "mercado vivo: the deadline day ran");
    const atRival = (await plain().getSquadById(saveId, rival.id))!.players.some((p) => p.id === target.id);
    const lostNews = (await plain().getInbox(saveId)).some((m) => m.category === "transfer" && m.kind === "lost_to_rival" && m.playerId === target.id);
    check(atRival && lostNews, `mercado vivo: ${target.name} went to the rival ${rival.name} on the deadline, inbox lost_to_rival (${atRival}, ${lostNews})`);
  }

  // ── Moral (`.claude/rules/game/morale.md`) ──
  // Morale present and in 0..100 on the human club every day; no AI club stores morale; at least one
  // talk request and one resolved promise during the run.
  console.log("\n── Moral ──");
  console.log(`  ${moraleTrack.days} day(s) read; morale range ${moraleTrack.min}..${moraleTrack.max}; ` +
    `${moraleTrack.talksSeen.size} talk request(s); answered: ${moraleTrack.answered.join("; ") || "none"}; ` +
    `${moraleTrack.resolved.size} promise(s) resolved`);
  check(moraleTrack.days > 0 && moraleTrack.missing === 0, `moral: every human-club player has morale every day (${moraleTrack.missing} missing)`);
  check(moraleTrack.outOfRange === 0, `moral: morale within 0..100 (${moraleTrack.outOfRange} out of range)`);
  {
    const aiWithMorale = allFiles.filter(({ squad }) => squad.id !== playerSquadId
      && (squad.moraleClub !== undefined || squad.players.some((p) => p.morale !== undefined || p.moraleLog !== undefined || p.squadStatus !== undefined)));
    check(aiWithMorale.length === 0, `moral: no AI club stores morale (${aiWithMorale.length}: ${aiWithMorale.slice(0, 3).map(({ squad }) => squad.id).join(", ")})`);
  }
  check(moraleTrack.talksSeen.size > 0, `moral: at least one talk request during the run (${moraleTrack.talksSeen.size})`);
  check(moraleTrack.resolved.size > 0, `moral: at least one promise resolved during the run (${moraleTrack.resolved.size})`);

  // ── Responsabilidades (`.claude/rules/game/responsibilities.md`) ──
  // The director (default) renews and sends a summary; no 90-day warning, no contract talk; the
  // default-off topics (manager news; scouting reports, checked under "Olheiros") never land.
  console.log("\n── Responsabilidades ──");
  console.log(`  ${respTrack.summaries.size} director summary(ies); renewals seen ${respTrack.renewed}; `
    + `expiring ${respTrack.expiring.size}; contract talks ${respTrack.contractTalks.size}; manager news ${respTrack.managerNews.size}`);
  check(respTrack.summaries.size > 0, `responsabilidades: at least one director summary (${respTrack.summaries.size})`);
  check(respTrack.renewed > 0, "responsabilidades: the director renewed at least one contract");
  check(respTrack.expiring.size === 0, `responsabilidades: no 90-day warning with the director (${respTrack.expiring.size})`);
  check(respTrack.contractTalks.size === 0, `responsabilidades: no contract talk reached the manager (${respTrack.contractTalks.size})`);
  check(respTrack.managerNews.size === 0, `responsabilidades: no manager news with the default prefs (${respTrack.managerNews.size})`);

  // ── Personalidade (`.claude/rules/game/personality.md`) ──
  // Every player of the world has a personality in 1..20 (derived from the id); the reborn player
  // accepted above has the original's; discipline stays in the band checked under "Disciplina";
  // at least one demand of the demand route is shaped by personality; morale stays in 0..100.
  console.log("\n── Personalidade ──");
  {
    const { personalityOf, PERSONALITY_TRAITS } = await import("@/Domain/personality/personality");
    const finalFiles = await plain().listSquadFiles(saveId);
    const everyone = [
      ...finalFiles.flatMap(({ squad }) => [...squad.players, ...(squad.youth ?? [])]),
      ...(await plain().getFreeAgents(saveId)).map((f) => f.player),
    ];
    const bad = everyone.filter((p) => {
      const pers = personalityOf(p);
      return PERSONALITY_TRAITS.some((t) => !Number.isInteger(pers[t]) || pers[t] < 1 || pers[t] > 20);
    });
    const mean = (t: (typeof PERSONALITY_TRAITS)[number]) =>
      everyone.reduce((a, p) => a + personalityOf(p)[t], 0) / Math.max(1, everyone.length);
    console.log(`  ${everyone.length} players; mean ${PERSONALITY_TRAITS.map((t) => `${t} ${mean(t).toFixed(2)}`).join(", ")}`);
    check(everyone.length > 0 && bad.length === 0, `personalidade: every player has traits in 1..20 (${bad.length} of ${everyone.length} invalid)`);
    const human = finalFiles.find(({ squad }) => squad.id === playerSquadId)?.squad;
    const born = human?.youth?.find((p) => p.reborn?.fromId === "smoke_legend");
    check(!!born && JSON.stringify(personalityOf(born)) === JSON.stringify(personalityOf({ id: "smoke_legend" })),
      "personalidade: the accepted reborn player has the original's personality");
    check(per(disc.fouls) >= 8 && per(disc.fouls) <= 16 && per(disc.yellows) >= 1.5 && per(disc.yellows) <= 4.5,
      `personalidade: discipline with personalities still in the bands (fouls ${per(disc.fouls).toFixed(2)}, yellows ${per(disc.yellows).toFixed(2)})`);

    // Demand route on players of other clubs: the parts shaped by the personality.
    const { apiRoutes } = await import("@/backend/routes");
    const { devAutoLogin } = await import("@/backend/auth/AuthService");
    // The save's single owner row was recorded earlier (smoke-reborn); a new session of the same user.
    const { session } = devAutoLogin("smoke-reborn@test.local");
    const demandHandler = apiRoutes["/api/saves/:saveId/players/:playerId/demand" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    // The personality lines of another club's player only show when the user knows him well (scout
    // noise < 0.5, `scouting.md`): most of the world is barely known, so the well-known players
    // (knowledge ≥ 80: the player mission, shortlist, sold players) go first, then a plain sample.
    const knownK = (await plain().getScouting(saveId)).knowledge;
    const aiPlayers = finalFiles.filter(({ squad }) => squad.id !== playerSquadId)
      .flatMap(({ squad }) => squad.players.filter((p) => !p.loan).map((p) => ({ p, from: squad.id })));
    const wellKnown = aiPlayers.filter(({ p }) => (knownK[p.id]?.k ?? 0) >= 80).slice(0, 60);
    const sample = finalFiles.filter(({ squad }) => squad.id !== playerSquadId)
      .flatMap(({ squad }) => squad.players.filter((p) => !p.loan).slice(0, 2).map((p) => ({ p, from: squad.id })))
      .filter(({ p }) => !wellKnown.some((w) => w.p.id === p.id))
      .slice(0, 120);
    const others = [...wellKnown, ...sample];
    console.log(`  demand route: ${wellKnown.length} well-known player(s) (knowledge >= 80) + ${sample.length} sampled`);
    let shaped = 0, smaller = 0, refusals = 0, compatriots = 0, asked = 0;
    for (const { p, from } of others) {
      const res = await demandHandler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/players/${p.id}/demand?from=${from}`, { headers: { cookie: `fs_session=${session.token}` } }),
        { params: { saveId, playerId: p.id } },
      ));
      if (res.status !== 200) continue;
      asked++;
      const d = (await res.json()) as { ambition?: number; compatriot?: number; smallerClub?: number; refusesSmallerClub?: boolean };
      if ((d.ambition ?? 1) !== 1 || (d.compatriot ?? 1) !== 1 || (d.smallerClub ?? 1) !== 1) shaped++;
      if ((d.smallerClub ?? 1) > 1) smaller++;
      if ((d.compatriot ?? 1) < 1) compatriots++;
      if (d.refusesSmallerClub) refusals++;
    }
    console.log(`  demand route: ${asked} asked, ${shaped} shaped by personality, ${smaller} smaller-club premium, ${refusals} refusal(s), ${compatriots} compatriot discount(s)`);
    check(asked > 0 && shaped > 0, `personalidade: at least one demand shaped by personality (${shaped} of ${asked})`);
    check(moraleTrack.outOfRange === 0, "personalidade: human-club morale stays in 0..100 with personalities");
  }

  // ── Instruções (`.claude/rules/game/player-instructions.md`) ──
  console.log("\n── Instruções ──");
  console.log(`  ${instrTrack.markDays} human match day(s); marking saved on ${instrTrack.markOk}; left over after the advance: ${instrTrack.markLeftOver}`);
  check(instrTrack.putOk, "instruções: slot instructions saved through PUT /tactics");
  check(instrTrack.sanitized, "instruções: a formation change keeps only the variants the new slots accept");
  check(instrTrack.restored, "instruções: instructions restored with the 4-3-3 for the season");
  check(instrTrack.markDays > 0 && instrTrack.markOk === instrTrack.markDays, `instruções: man-marking saved on every human match day (${instrTrack.markOk}/${instrTrack.markDays})`);
  check(instrTrack.markLeftOver === 0, `instruções: match marking cleared by the next advance (${instrTrack.markLeftOver} left over)`);
  {
    // The AI never gets instructions: a simulated AI × AI fixture carries none, and no squad stores any.
    const { computeMatchSimulationLineups } = await import("@/Domain/advanceDay/matchSimulationLineups");
    const aiPair = allFiles.filter(({ squad }) => squad.id !== playerSquadId).slice(0, 2).map(({ squad }) => squad);
    const sim = computeMatchSimulationLineups(
      { id: "smoke-ai", date: (await plain().getMeta(saveId))!.currentDate!, competition: PLAYER_LEAGUE, round: 1, home: aiPair[0]!.id, away: aiPair[1]!.id, played: false } as import("@/types/calendarTypes").Fixture,
      aiPair[0]!, aiPair[1]!, playerSquadId, await plain().getTactics(saveId), null, (await plain().getMeta(saveId))!.matchMarking,
    );
    const aiInstr = [sim.tactics.A, sim.tactics.B].some((t) => t.slotInstructions || t.manMarks);
    const storing = allFiles.filter(({ squad }) => JSON.stringify(squad).includes("slotInstructions") || JSON.stringify(squad).includes("manMark"));
    check(!aiInstr && storing.length === 0, `instruções: no AI club plays or stores instructions (${storing.length} squad file(s))`);
  }

  // ── Olheiros (`.claude/rules/game/scouting.md`) ──
  console.log("\n── Olheiros ──");
  {
    const st = await plain().getScouting(saveId);
    console.log(`  ${scoutTrack.mondays} Monday(s), ${scoutTrack.reports} report(s), knowledge entries ${Object.keys(st.knowledge).length}, inbox kinds ${[...scoutTrack.kinds].join(",")}`);
    check(scoutTrack.setupOk, "olheiros: field scouts hired, three missions and a shortlist created through the routes");
    check(scoutTrack.playerMaxK >= 100, `olheiros: the player mission brought knowledge to 100 (${scoutTrack.playerMaxK})`);
    check(scoutTrack.reportsHiddenOk, `olheiros: with the default inbox prefs no report message lands (${scoutTrack.reportsLeaked} leaked)`);
    check(scoutTrack.reportsOn, "olheiros: scouting reports switched on through PUT /inbox-prefs");
    check(scoutTrack.reports > 0 && scoutTrack.kinds.has("report"), `olheiros: reports written and announced (${scoutTrack.reports})`);
    check(scoutTrack.kinds.has("mission_done"), "olheiros: a mission finished with its message");
    check(scoutTrack.mondays > 0 && scoutTrack.travelMissing.length === 0, `olheiros: a travel line per active mission every Monday (${scoutTrack.travelMissing.slice(0, 3).join("; ") || "ok"})`);
    check(scoutTrack.kinds.has("shortlist"), "olheiros: at least one shortlist alert");
    check(scoutTrack.prospectSigned && scoutTrack.prospectChecks.length === 0, `olheiros: a prospect signed into the academy with contract and compensation (${scoutTrack.prospectChecks.join(", ") || (scoutTrack.prospectSigned ? "ok" : "none signed")})`);
    const aiScouting = allFiles.filter(({ squad }) => squad.id !== playerSquadId && (squad.staff?.members ?? []).some((m) => m.role === "fieldScout"));
    check(aiScouting.length === 0, `olheiros: no AI club stores field scouts (${aiScouting.length})`);
    // Country knowledge (4.9, `.claude/rules/game/scouting.md` → "Conhecimento por país").
    {
      const endDate = (await plain().getMeta(saveId))!.currentDate!;
      const own = await plain().getSquadById(saveId, playerSquadId);
      const scouts = (own?.staff?.members ?? []).filter((m) => m.role === "scout" || m.role === "fieldScout");
      const chiefM = scouts.find((m) => m.id === scoutTrack.chiefId);
      const entry = chiefM?.countryKnowledge?.[scoutTrack.foreign];
      const after = chiefM ? countryKnowledgeOf(chiefM, scoutTrack.foreign, scoutTrack.chiefLast || endDate) : -1;
      check(!!chiefM && !!entry && after > scoutTrack.chiefKBefore && new Date(`${scoutTrack.chiefLast}T12:00:00Z`).getUTCDay() === 1
        && entry.last === scoutTrack.chiefLast,
        `olheiros: the chief's knowledge of ${scoutTrack.foreign} grew on the mission (${scoutTrack.chiefKBefore} → ${after}, last ${scoutTrack.chiefLast || "none"})`);
      const belowNative = scouts.filter((m) => countryKnowledgeOf(m, m.nationality, endDate) < 90);
      check(scouts.length > 0 && belowNative.length === 0, `olheiros: every scout knows his own country at 90+ (${belowNative.length} of ${scouts.length} below)`);
      const aiCountry = allFiles.filter(({ squad }) => squad.id !== playerSquadId && (squad.staff?.members ?? []).some((m) => m.countryKnowledge));
      check(aiCountry.length === 0, `olheiros: no AI club stores country knowledge (${aiCountry.length})`);
      const idle = scouts.flatMap((m) => Object.entries(m.countryKnowledge ?? {})
        .filter(([c, e]) => c !== m.nationality && daysBetween(e.last, endDate) > 210)
        .map(([c, e]) => ({ m, c, e })));
      if (idle.length === 0) {
        console.log("  note: no country entry idle for 210+ days at the end of the run (decay covered by countryKnowledge.test.ts)");
      } else {
        const wrong = idle.filter(({ m, c, e }) => {
          const k = countryKnowledgeOf(m, c, endDate);
          return !(k < e.k || k === baseCountryKnowledge(m.nationality, c)) || k < baseCountryKnowledge(m.nationality, c);
        });
        check(wrong.length === 0, `olheiros: idle country knowledge decays toward the base (${wrong.length} of ${idle.length} off)`);
      }
    }
    // The search blurs every row by its knowledge: hidden below 20, a range from ±0.5, exact at 100.
    const { searchScout, parseScoutQuery } = await import("@/backend/scoutSearch");
    const foreignLeague = (leagueData.find((l) => l.slug === PLAYER_LEAGUE) as { country?: string } | undefined)?.country === "Spain" ? "premier_league" : "la_liga";
    const res = (await searchScout(saveId, parseScoutQuery({ filters: { league: foreignLeague }, pageSize: 200 })))!;
    const incoherent = res.rows.filter((r) => r.knowledge === undefined
      || (r.knowledge < 20) !== !!r.hiddenAttrs
      || ((r.statNoise ?? 0) >= 0.5) !== !!r.avgRange
      || (r.knowledge >= 100 && (r.statNoise ?? 0) > 0));
    check(res.rows.length > 0 && incoherent.length === 0, `olheiros: search rows show ranges and "?" coherent with knowledge (${incoherent.length} of ${res.rows.length})`);
    // Sorted by what the user sees (4.3.1): the middle of the shown range, never the real rating;
    // the salary of a little-known player is a range (the row never carries the exact wage).
    const { rangeMid } = await import("@/Domain/scouting/seen");
    const { computeOverallAvg } = await import("@/Domain/playerRating");
    const realById = new Map(allFiles.flatMap(({ squad }) => squad.players.map((p) => [p.id, p] as const)));
    const ranged = res.rows.filter((r) => r.avgRange);
    const viewBroken = ranged.filter((r) => r.avg !== rangeMid(r.avgRange!) || r.valueMillions !== rangeMid(r.valueRange!));
    const orderBroken = res.rows.some((r, i) => i > 0 && r.avg > res.rows[i - 1]!.avg);
    let realInversions = 0;
    for (let i = 1; i < ranged.length; i++) {
      const a = realById.get(ranged[i - 1]!.id), b = realById.get(ranged[i]!.id);
      if (a && b && computeOverallAvg(b) > computeOverallAvg(a)) realInversions++;
    }
    check(ranged.length > 1 && viewBroken.length === 0 && !orderBroken && realInversions > 0,
      `olheiros: search sorted by the seen overall, not the real one (${ranged.length} ranged rows, ${viewBroken.length} off the view, ${realInversions} real-rating inversions)`);
    const wageLeaks = ranged.filter((r) => {
      const real = realById.get(r.id)?.contract?.wage;
      return !r.wageRange || !r.salary.includes("–") || r.wage !== Math.round(rangeMid(r.wageRange)) || (real !== undefined && r.wage === real && r.wageRange[0] !== r.wageRange[1]);
    });
    check(wageLeaks.length === 0, `olheiros: little-known players' salary shown as a range, never the exact wage (${wageLeaks.length} of ${ranged.length})`);
    // Index build cost: the per-player blur against the old uniform one (informative; fails above 2x).
    const { loadViewer, obscureSquadForViewer } = await import("@/backend/scoutingWorld");
    const { obscureSquad } = await import("@/Domain/staff/staff");
    const { mapSquadsToScoutPlayers } = await import("@/Domain/scout/scoutQuery");
    const squads = allFiles.map(({ squad }) => squad);
    const t0 = performance.now();
    mapSquadsToScoutPlayers(squads.map((sq) => (sq.id === playerSquadId ? sq : obscureSquad(sq, 0.6, saveId!))));
    const tOld = performance.now() - t0;
    const t1 = performance.now();
    const viewer = (await loadViewer(plain(), saveId, { squads }))!;
    mapSquadsToScoutPlayers(squads.map((sq) => obscureSquadForViewer(viewer, sq)));
    const tNew = performance.now() - t1;
    console.log(`  search index blur: ${tNew.toFixed(0)} ms vs ${tOld.toFixed(0)} ms uniform (x${(tNew / tOld).toFixed(2)})`);
    check(tNew <= 2 * tOld, `olheiros: search index build within 2x of the uniform blur (x${(tNew / tOld).toFixed(2)})`);
  }

  // ── Convites (`.claude/rules/game/jobs.md`) ──
  // A forced offer from a club of the calendar-year league that ends first (another country) is
  // accepted through the route; the career goes on in the new league until that country rolls over.
  console.log("\n── Convites ──");
  {
    const metaC = (await plain().getMeta(saveId))!;
    const dateC = metaC.currentDate!;
    console.log(`  offers pending after the player's rollover window: ${(metaC.jobOffers ?? []).length}`);
    check((metaC.jobOffers ?? []).every((o) => o.expires >= dateC && o.squadId !== playerSquadId),
      "convites: pending offers are valid and never from the own club");
    const target = [...(metaC.activeLeagues ?? [])]
      .filter((l) => l.end > dateC && l.start <= dateC && countryOf(l.leagueSlug) !== playerCountry)
      .sort((a, b) => a.end.localeCompare(b.end))[0];
    check(!!target, `convites: a league in season to move to (${target?.leagueSlug ?? "none"})`);
    if (target) {
      const indexC = await plain().getSquadIndex(saveId);
      const newClub = indexC.inLeague(target.leagueSlug)[0]!;
      const offer: import("@/types/jobTypes").JobOffer = {
        id: "job_smoke", squadId: newClub.squadId, clubName: newClub.name, leagueSlug: target.leagueSlug,
        leagueName: target.leagueName, window: "season_end", date: dateC, expires: dateC, objective: null,
        budget: 5_000_000, compensation: 1_000_000, expectedPosition: 1, leagueSize: indexC.inLeague(target.leagueSlug).length, prestige: 0.5,
      };
      await plain().updateMeta(saveId, { jobOffers: [...(metaC.jobOffers ?? []), offer] });
      const { apiRoutes } = await import("@/backend/routes");
      const { devAutoLogin } = await import("@/backend/auth/AuthService");
      // The reborn section above already recorded the save's owner (smoke-reborn).
      const { session } = devAutoLogin("smoke-reborn@test.local");
      const handler = apiRoutes["/api/saves/:saveId/jobs/:offerId" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      const res = await handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/jobs/job_smoke`, {
          method: "POST", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
          body: JSON.stringify({ accept: true }),
        }),
        { params: { saveId, offerId: "job_smoke" } },
      ));
      check(res.status === 200, `convites: forced offer from ${newClub.name} (${target.leagueSlug}) accepted (status ${res.status})`);

      const ledgerSum = async () => {
        let sum = 0;
        for (const season of await plain().listLedgerSeasons(saveId!)) {
          for (const e of await plain().getLedger(saveId!, season)) sum += e.amount;
        }
        return sum;
      };
      const managerChecks = async (when: string) => {
        const ms = await plain().getManagers(saveId!);
        const me = ms.filter((m) => m.isPlayer);
        check(me.length === 1 && me[0]!.squadId === newClub.squadId, `convites (${when}): the player's manager is at ${newClub.squadId}`);
        const clubs = ms.filter((m) => m.squadId).map((m) => m.squadId);
        check(new Set(clubs).size === clubs.length, `convites (${when}): one manager per club (${clubs.length - new Set(clubs).size} duplicate(s))`);
        return me[0];
      };

      const metaA = (await plain().getMeta(saveId))!;
      // Etapa 25 (D3/D4): the new club compensated the old one (arrival below the offer's budget),
      // the old club has an interim and a vacancy, the manager a contract at the new club.
      {
        const arrive = (await plain().getLedger(saveId, (await plain().getLeagueMeta(saveId, target.leagueSlug))!.year))
          .filter((e) => e.kind === "club_change" && e.ref?.stage === "arrive").at(-1);
        console.log(`  arrival balance ${arrive?.amount} (offer budget 5M, compensation 1M)`);
        check(arrive?.amount === 4_000_000, "convites: the compensation to the old club came out of the arrival balance");
        const msA = await plain().getManagers(saveId);
        check(msA.find((m) => !m.isPlayer && m.squadId === playerSquadId)?.interim === true && !!metaA.managerVacancies?.[playerSquadId],
          "convites: the old club has an interim and a vacancy (no manager swap)");
        check(metaA.managerContract?.squadId === newClub.squadId, "convites: the manager has a contract at the new club");
      }
      check(metaA.clubId === newClub.squadId && metaA.leagueSlug === target.leagueSlug,
        `convites: the career follows the new club (${metaA.clubId} in ${metaA.leagueSlug})`);
      check(metaA.board?.board === 60 && metaA.board.objective?.leagueSlug === target.leagueSlug,
        "convites: board at 60 with an objective in the new league");
      const oldClub = (await plain().getSquadById(saveId, playerSquadId))!;
      check(oldClub.staff === undefined && oldClub.youth === undefined && oldClub.styleFamiliarity === undefined,
        "convites: the old club became AI (no staff, academy or familiarity)");
      check(!!oldClub.financialTier && (oldClub.aiTransferBudget ?? 0) > 0, "convites: the old club got an AI tier and transfer budget");
      const mine0 = (await plain().getSquadById(saveId, newClub.squadId))!;
      check((mine0.staff?.members.length ?? 0) > 0 && mine0.financialTier === undefined,
        "convites: the new club has the player's staff and no AI tier");
      check(Math.abs((await ledgerSum()) - (mine0.finances?.budget ?? 0)) < 1,
        `convites: ledger sums to the new club's balance (${Math.round(mine0.finances?.budget ?? 0)})`);
      const tacC = (await plain().getTactics(saveId))!;
      check(tacC.lineup.filter((id) => mine0.players.some((p) => p.id === id)).length === 11,
        `convites: the tactic has an XI of the new club (${tacC.formation})`);
      const meBefore = await managerChecks("after the switch");

      // The career goes on in the new league until its country rolls over.
      const rolledFrom = target.year;
      let rolled = false;
      let daysC = 0;
      // The 1-season contract ends with this season: the board stays happy so it offers a renewal,
      // which the smoke accepts. A pre-contract with a player of the same league joins at the rollover.
      let renewalAccepted = false;
      let preSigned: { id: string; from: string } | null = null;
      const { addDays: addDaysC } = await import("@/Domain/dates");
      const callC = async (key: string, path: string, params: Record<string, string>, body: unknown) => {
        const h = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
        const r = await h(Object.assign(new Request(`http://localhost${path}`, {
          method: "POST", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" }, body: JSON.stringify(body),
        }), { params }));
        return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
      };
      for (let g = 0; g < 260 && !rolled; g++) {
        const before = (await plain().getMeta(saveId))!;
        if (before.board && before.board.board < 65) await plain().updateMeta(saveId, { board: { ...before.board, board: 65 } });
        if (before.managerRenewal && !renewalAccepted) {
          const r = await callC("/api/saves/:saveId/manager-contract", `/api/saves/${saveId}/manager-contract`, { saveId }, { accept: true });
          renewalAccepted = r.status === 200;
        }
        const st0 = (before.activeLeagues ?? []).find((l) => l.leagueSlug === target.leagueSlug);
        if (!preSigned && st0 && before.currentDate! >= addDaysC(st0.end, -150)) {
          // Room for him (squad of 30 at most): the weakest players of the new club go to the free agents.
          {
            const mineP = (await plain().getSquadById(saveId, newClub.squadId))!;
            if (mineP.players.length > 27) {
              const { toFreeAgent } = await import("@/Domain/contracts/freeAgents");
              const { overallAvg } = await import("@/Domain/playerRating");
              const out = [...mineP.players].filter((p) => !p.loan).sort((a, b) => overallAvg(a) - overallAvg(b)).slice(0, mineP.players.length - 27);
              const gone = new Set(out.map((p) => p.id));
              await plain().saveSquadById(saveId, { ...mineP, players: mineP.players.filter((p) => !gone.has(p.id)) });
              await plain().writeFreeAgents(saveId, [...(await plain().getFreeAgents(saveId)), ...out.map((p) => toFreeAgent(p, before.currentDate!))]);
              const tacP = await plain().getTactics(saveId);
              if (tacP) await plain().saveTactics(saveId, { ...tacP, lineup: tacP.lineup.map((id) => (gone.has(id) ? "" : id)) });
            }
          }
          // Several candidates: one that prefers to renew with his club is skipped.
          const others = (await plain().getSquadsInLeague(saveId, target.leagueSlug)).filter((c) => c.id !== newClub.squadId && c.players.length >= 20);
          let last = "";
          for (const other of others.slice(0, 6)) {
            const pl = other.players.find((p) => !p.loan && p.age <= 30 && p.positions[0] !== "GK");
            if (!pl) continue;
            await plain().saveSquadById(saveId, { ...other, players: other.players.map((p) => (p.id === pl.id ? { ...p, contract: { until: st0.end, wage: p.contract?.wage ?? 1000 } } : p)) });
            const r = await callC("/api/saves/:saveId/pre-contracts", `/api/saves/${saveId}/pre-contracts`, { saveId },
              { playerId: pl.id, fromSquadId: other.id, wage: Math.max(50_000, (pl.contract?.wage ?? 0) * 5), years: 2 });
            last = `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`;
            if (r.status === 200 && r.body.accepted === true) { preSigned = { id: pl.id, from: other.id }; break; }
          }
          check(!!preSigned, `convites: a pre-contract signed with a player of ${target.leagueSlug} (${last})`);
          if (!preSigned) preSigned = { id: "", from: "" };
        }
        const out = await runBufferedDay(saveId);
        if (!out.ok) { check(false, `convites: day failed ${out.status} ${out.error}`); break; }
        daysC++;
        const m = (await plain().getMeta(saveId))!;
        const st = (m.activeLeagues ?? []).find((l) => l.leagueSlug === target.leagueSlug);
        if (st && st.year > rolledFrom) rolled = true;
      }
      check(renewalAccepted, "convites: the board offered a contract renewal before the rollover (accepted)");
      if (preSigned?.id) {
        const joined = (await plain().getSquadById(saveId, newClub.squadId))!.players.some((p) => p.id === preSigned!.id);
        const gone = !(await plain().getSquadById(saveId, preSigned.from))!.players.some((p) => p.id === preSigned!.id);
        check(joined && gone, "convites: the pre-contracted player joined at his club's rollover");
      }
      console.log(`  ${daysC} day(s) at ${newClub.name} until ${target.leagueSlug} rolled`);
      check(rolled, `convites: ${target.leagueSlug} rolled over with the player's new club (${daysC} days)`);
      const metaR = (await plain().getMeta(saveId))!;
      check(metaR.clubId === newClub.squadId && !metaR.unemployed, "convites: still at the new club after the rollover");
      check(metaR.board?.objective?.season !== metaA.board?.objective?.season,
        `convites: a new objective at the new club's rollover (${metaR.board?.objective?.season})`);
      const mineR = (await plain().getSquadById(saveId, newClub.squadId))!;
      check(mineR.financialTier === undefined && mineR.aiTransferBudget === undefined,
        "convites: the new club rolled over as the human club (no AI tier/budget)");
      check(Math.abs((await ledgerSum()) - (mineR.finances?.budget ?? 0)) < 1, "convites: ledger still sums to the balance after the rollover");
      const meAfter = await managerChecks("after the rollover");
      check((meAfter?.seasons ?? 0) > (meBefore?.seasons ?? 0), `convites: the season at the new club counted (${meAfter?.seasons})`);
    }
  }

  await checkFiles(saveId, "end");
  const el = (performance.now() - t0) / 1000;
  console.log(`\nSummary: ${days} days (${startDate} → ${endDate}), ${el.toFixed(0)} s total, avg ${(dayMsTotal / days).toFixed(0)} ms/day, `
    + `${matchDays} player match days avg ${(matchDayMs / Math.max(1, matchDays)).toFixed(0)} ms`);
} catch (e) {
  failures.push(`exception: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  console.error(e);
} finally {
  if (saveId) {
    await saveService.deleteSave(saveId);
    console.log(`\nDeleted save ${saveId}`);
  }
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll season rollover checks passed.");
process.exit(0);
