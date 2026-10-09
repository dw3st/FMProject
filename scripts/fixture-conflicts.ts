/**
 * Clubs with two official games (league, national cup, continental) on the same day or on consecutive days,
 * in the whole world, before and after the rescheduling of clashing league games
 * (`.claude/rules/game/rescheduling.md`). "Before" is the same calendar with every rescheduled game put back on
 * its original date (`rescheduledFrom`): cups and continental competitions never move.
 *
 * Creates a career the way the new-game wizard does (createSave + start kit + the presimulate pass), counts,
 * optionally advances N days (draws of the knockout stages, December rollovers) and counts again, then deletes
 * the save.
 *
 * Run:  bun scripts/fixture-conflicts.ts [--league premier_league] [--days 0] [--keep]
 */
import { fileURLToPath } from "node:url";

process.env.RUNTIME_DATA_DIR ||= fileURLToPath(new URL("../src/Data", import.meta.url));

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LEAGUE = argValue("--league") ?? "premier_league";
const DAYS = Math.max(0, parseInt(argValue("--days") ?? "0", 10) || 0);
const KEEP = args.includes("--keep");

const { SaveService, saveService } = await import("@/backend/SaveService");
const { FileSystemDAL } = await import("@/backend/dal/FileSystemDAL");
const { BufferingSaveDAL } = await import("@/backend/dal/BufferingSaveDAL");
const { advanceOneDay, getLeagueData } = await import("@/backend/advanceDay");
const { applyRandomStartKit } = await import("@/backend/startKits");
const { applyBroadcasting } = await import("@/backend/FinancialService");
const { getCountries } = await import("@/backend/continentalWorld");
const { rescheduleFixtureConflicts } = await import("@/backend/reschedulingWorld");
const { countConflicts } = await import("@/Domain/calendar/rescheduling");
const { isCupSlug } = await import("@/Domain/cups/cupIds");
const { isContinentalSlug } = await import("@/Domain/continental/competitions");
const { isYouthCompSlug } = await import("@/Domain/youthComps/youthCompIds");
type CalendarEntry = import("@/Domain/calendar/rescheduling").CalendarEntry;
type Fixture = import("@/types/calendarTypes").Fixture;

type LeagueEntry = { slug: string; name: string; country?: string; standings: Array<{ squadId: string; name?: string; colors?: [string, string] }> };
const leagueData = (await Bun.file(fileURLToPath(new URL("../src/Data/leagueData.json", import.meta.url))).json()) as LeagueEntry[];
const databases = (await Bun.file(fileURLToPath(new URL("../src/Data/databases.json", import.meta.url))).json()) as Array<{
  id: string; name: string; version: string; startDate: string;
}>;

async function createSave(): Promise<string> {
  const lg = leagueData.find((l) => l.slug === LEAGUE);
  const club = lg?.standings[0];
  if (!lg || !club) throw new Error(`${LEAGUE} not found in leagueData`);
  const db = databases[0]!;
  const meta = await saveService.createSave({
    leagueSlug: lg.slug, leagueName: lg.name, clubId: club.squadId, clubName: club.name ?? club.squadId,
    clubColors: club.colors ?? ["#888888", "#ffffff"],
    database: { id: db.id, name: db.name, version: db.version, startDate: db.startDate },
    manager: { name: "Conflicts", nationalityIso: "gb", backgroundId: "former-player" },
  });
  await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId);
  const kit = await applyRandomStartKit(meta.id);
  if (kit.applied) {
    await rescheduleFixtureConflicts({ service: saveService, saveId: meta.id, minDate: meta.currentDate!, catalog: await getLeagueData() });
  }
  console.log(`Save ${meta.id} — ${club.name} (${lg.name}), start ${meta.currentDate}, kit: ${kit.applied ? kit.kit : kit.reason}`);
  return meta.id;
}

async function worldEntries(saveId: string): Promise<CalendarEntry[]> {
  const out: CalendarEntry[] = [];
  for (const slug of await saveService.listCompetitionSlugs(saveId)) {
    if (isYouthCompSlug(slug)) continue;
    const kind = isCupSlug(slug) ? "cup" : isContinentalSlug(slug) ? "continental" : "league";
    const meta = await saveService.getLeagueMeta(saveId, slug);
    if (!meta) continue;
    for (let r = 1; r <= meta.totalRounds; r++) {
      const rf = await saveService.getRound(saveId, slug, r);
      for (const f of rf?.fixtures ?? []) out.push({ competition: slug, kind, fixture: f });
    }
  }
  return out;
}

async function report(saveId: string, label: string): Promise<void> {
  const catalog = await getLeagueData();
  const countries = await getCountries();
  const index = await saveService.getSquadIndex(saveId);
  const countryOf = new Map(catalog.map((l) => [l.slug, l.country]));
  const continentOf = (club: string): string => {
    const league = index.byId(club)?.leagueSlug;
    const country = league ? countryOf.get(league) : undefined;
    return (country && countries[country]?.continent) || "other";
  };
  const entries = await worldEntries(saveId);
  const original = entries.map((e): CalendarEntry =>
    e.fixture.rescheduledFrom ? { ...e, fixture: { ...e.fixture, date: e.fixture.rescheduledFrom } as Fixture } : e,
  );
  const moved = entries.filter((e) => e.fixture.rescheduledFrom).length;
  console.log(`\n${label}: ${entries.length} official games, ${moved} rescheduled`);
  console.log("region          | same day (clubs / pairs) before → after | consecutive days (clubs / pairs) before → after");
  for (const region of ["Europe", "South America", "other", "all"]) {
    // A pair counts in a region by the club's own league country.
    const keep = (list: CalendarEntry[]) => {
      const counts = { sameDayClubs: 0, adjacentClubs: 0, sameDayPairs: 0, adjacentPairs: 0 };
      const byClub = new Map<string, CalendarEntry[]>();
      for (const e of list) for (const c of [e.fixture.home, e.fixture.away]) {
        if (region !== "all" && continentOf(c) !== region) continue;
        (byClub.get(c) ?? byClub.set(c, []).get(c)!).push({ ...e, fixture: { ...e.fixture, home: c, away: `__${e.competition}:${e.fixture.id}` } });
      }
      for (const games of byClub.values()) {
        const k = countConflicts(games);
        counts.sameDayClubs += k.sameDayClubs > 0 ? 1 : 0;
        counts.adjacentClubs += k.adjacentClubs > 0 ? 1 : 0;
        counts.sameDayPairs += k.sameDayPairs;
        counts.adjacentPairs += k.adjacentPairs;
      }
      return counts;
    };
    const b = keep(original);
    const a = keep(entries);
    console.log(
      `${region.padEnd(15)} | ${`${b.sameDayClubs} / ${b.sameDayPairs}`.padStart(9)} → ${`${a.sameDayClubs} / ${a.sameDayPairs}`.padEnd(9)}` +
        `                | ${`${b.adjacentClubs} / ${b.adjacentPairs}`.padStart(9)} → ${a.adjacentClubs} / ${a.adjacentPairs}`,
    );
  }
}

const saveId = await createSave();
try {
  await report(saveId, "At career start");
  const t0 = performance.now();
  const meta = await saveService.getMeta(saveId);
  const pass = await rescheduleFixtureConflicts({ service: saveService, saveId, minDate: meta!.currentDate!, catalog: await getLeagueData() });
  console.log(`\nWhole-world pass (nothing left to move: ${pass.moves.length} moves): ${(performance.now() - t0).toFixed(0)} ms`);
  if (DAYS > 0) {
    for (let d = 0; d < DAYS; d++) {
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const outcome = await advanceOneDay(new SaveService(buffer), saveId);
      if (!outcome.ok) throw new Error(`advanceOneDay failed: ${outcome.status} ${outcome.error}`);
      await buffer.flush();
      if ((d + 1) % 30 === 0) console.log(`  … ${d + 1} days`);
    }
    const m = await saveService.getMeta(saveId);
    await report(saveId, `After ${DAYS} days (${m?.currentDate})`);
  }
} finally {
  if (!KEEP) await saveService.deleteSave(saveId);
  else console.log(`kept save ${saveId}`);
}
