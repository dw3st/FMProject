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
const { addOneDay } = await import("@/Domain/advanceDay/date");
const { applyHumanSeasonReaction, clubSeasonOutcome } = await import("@/Domain/aiFinance/seasonReaction");
const { applyTierFinanceChange } = await import("@/Domain/advanceDay/tierFinances");
const { isCupSlug } = await import("@/Domain/cups/cupIds");
const { isContinentalSlug, competitionsOf } = await import("@/Domain/continental/competitions");
const { totalsByKind } = await import("@/Domain/finance/ledger");
const { aiTransferBudgetOf, seasonalTransferBudgetFor, popularityOf } = await import("@/Domain/aiFinance/aiClubFinance");
const { AI_FINANCE_CONFIG } = await import("@/Domain/aiFinance/aiFinanceConfig");
const { leaguePrize } = await import("@/Domain/finance/prizes");
const { autoLineupDefaultFormation, autoLineupDefaultFormationWithFitness, resolveUserLineup } = await import("@/Domain/advanceDay/matchSimulationLineups");
const { isInjured } = await import("@/Domain/injury/injury");
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
  {
    const sq = (await plain().getSquadById(saveId, playerSquadId))!;
    await plain().saveTactics(saveId, {
      formation: DEFAULT_SIM_FORMATION_ID,
      tactical_style: "balanced",
      lineup: autoLineupDefaultFormation(sq),
      assistantRotation: true,
    });
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

  for (let guard = 0; guard < MAX_DAYS; guard++) {
    const svc = plain();
    const meta = (await svc.getMeta(saveId))!;
    const date = meta.currentDate!;
    const leaguesBefore = (meta.activeLeagues ?? []) as LeagueSeasonState[];
    const ending = leaguesBefore.filter((l) => date >= l.end);

    // Candidate rollover day: capture the closed season + the player squad before the day.
    let preIndex: Map<string, string> | null = null;
    let prePlayerSquad: Squad | null = null;
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
    if (playerFixtureToday) {
      const month = date.slice(0, 7);
      const opponentId = playerFixtureToday.home === playerSquadId ? playerFixtureToday.away : playerFixtureToday.home;
      preDayInjured = new Map<string, boolean>();
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
          const fitnessXI = autoLineupDefaultFormationWithFitness(squad);
          const plainXI = autoLineupDefaultFormation(squad);
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

    const td = performance.now();
    const outcome = await runBufferedDay(saveId);
    const ms = performance.now() - td;
    if (!outcome.ok) {
      check(false, `runBufferedDay ${date}: ${outcome.status} ${outcome.error}`);
      break;
    }
    days++;
    dayMsTotal += ms;
    const payload = outcome.payload as Record<string, unknown>;
    const playedMine = prePlayerFixtures.length > 0 || ms > 4000;
    if (playedMine) { matchDays++; matchDayMs += ms; }

    // Lesões: count every match played today (any league, engine or quickSim — both always write
    // `MatchEvent.injuries`, possibly empty) and check the player's league round against the
    // pre-day injury snapshot taken above.
    const dayLog = await plain().getDayLog(saveId, date);
    if (dayLog) {
      for (const event of dayLog.events) {
        if (event.kind !== "match") continue;
        totalMatchesLogged++;
        totalMatchInjuries += event.injuries?.length ?? 0;
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

    // Which leagues rolled today (year advanced).
    const leaguesAfter = (metaAfter.activeLeagues ?? []) as LeagueSeasonState[];
    const rolledToday = leaguesAfter
      .filter((l) => {
        const b = leaguesBefore.find((x) => x.leagueSlug === l.leagueSlug);
        return b && l.year > b.year;
      })
      .map((l) => l.leagueSlug);
    if (rolledToday.length > 0) rolls.push({ date, leagues: rolledToday });

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
        const homeFixturesToday = prePlayerFixtures
          .filter((f) => f.home === playerSquadId)
          .map((f) => ({ competition: f.competition, kind: "league" as const, label: f.competition, neutral: f.neutral }));
        const entries = computeAdvanceDayMoney({
          currentDate: date, playerSquad: prePlayerSquad, homeFixturesToday,
        });
        const delta = entries.reduce((s, e) => s + e.amount, 0);
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
          clubSeasonOutcome(archive.standings, playerSquadId, obsPlayer ? [obsPlayer] : []),
        ).followersAfter;
        check(followersAfter === expected, `human followers ${followersBefore} → ${followersAfter} (expected ${expected})`);
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
  const sudMetaEnd = await plain().getLeagueMeta(smokeSaveId, sudSlug);
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

  // ── Fôlego ───────────────────────────────────────────────────────────────
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
