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
 *   - England: PL 20 / Championship 19, 3 down, 3 up; Italy: each Serie C group got exactly 1
 *     club from Serie B and sent its champion up;
 *   - 1227 squad files, no duplicate ids, no index duplicates;
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
const EXPECTED_SQUAD_FILES = 1227;
const MAX_DAYS = 500;

const { SaveService, saveService } = await import("@/backend/SaveService");
const { FileSystemDAL } = await import("@/backend/dal/FileSystemDAL");
const { runBufferedDay, getPyramids } = await import("@/backend/advanceDay");
const { applyRandomStartKit } = await import("@/backend/startKits");
const { applyBroadcasting } = await import("@/backend/FinancialService");
const { RUNTIME_DATA_DIR } = await import("@/backend/runtimeDir");
const { pyramidByLeague, pyramidLeagueSlugs, tierOfLeague } = await import("@/Domain/season/countryRollover");
const { computeAdvanceDayMoneyDelta } = await import("@/Domain/advanceDay/financial");
const { addOneDay } = await import("@/Domain/advanceDay/date");
const { applyHumanSeasonReaction, clubSeasonOutcome } = await import("@/Domain/aiFinance/seasonReaction");
const { applyTierFinanceChange } = await import("@/Domain/advanceDay/tierFinances");
type ClubMove = import("@/types/pyramidTypes").ClubMove;
type CountryPyramid = import("@/types/pyramidTypes").CountryPyramid;
type LeagueSeasonState = import("@/types/calendarTypes").LeagueSeasonState;
type Squad = import("@/types/playerTypes").Squad;

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
    budget: 0,
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
      if (prePlayerSquad && postSquad) {
        const p0 = prePlayerSquad.players.find((p) => postSquad.players.some((q) => q.id === p.id));
        const p1 = p0 && postSquad.players.find((q) => q.id === p0.id);
        check(!!p0 && !!p1 && p1.age === p0.age + 1, `player ${p0?.name ?? "?"}: age ${p0?.age} → ${p1?.age}`);
        const b0 = prePlayerSquad.finances?.budget ?? 0;
        const b1 = postSquad.finances?.budget ?? 0;
        const tv = prePlayerSquad.finances?.broadcasting ?? 0;
        const delta = computeAdvanceDayMoneyDelta({
          currentDate: date, todayFixtures: prePlayerFixtures, playerSquadId, playerSquad: prePlayerSquad,
        });
        const expected = Math.max(0, b0 + delta) + tv;
        if (obsPlayer) {
          console.log(`  budget ${b0} → ${b1} (club changed tier: exact check skipped; tv ${tv}, day delta ${delta})`);
          check(b1 >= Math.max(0, b0 + delta), `budget did not drop at the rollover (${b0} → ${b1})`);
        } else {
          check(Math.abs(b1 - expected) < 1, `budget ${b0} + day ${delta} + TV ${tv} = ${expected} (got ${b1})`);
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
      const expectedNews = (payload.playerChampionOf ? 1 : 0) + (payload.playerMove ? 1 : 0) + followersNews;
      check(season.length === expectedNews, `inbox season messages: ${season.length} (expected ${expectedNews})`);
      check(season.filter((m) => m.kind === "followers").length === followersNews, "inbox has the followers season line");
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
      check(index.inLeague("of_championship").length === 19, `inLeague(of_championship) = ${index.inLeague("of_championship").length} (19)`);
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
  check(italyRoll === "2025-05-18", `Italy rolled on ${italyRoll} (2025-05-18)`);

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
