import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { getLeagueData } from "@/backend/advanceDay";
import { countryByLeague, leagueBusyDates } from "@/backend/cupWorld";
import { CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import type { Fixture } from "@/types/calendarTypes";
import type { LeagueZone } from "@/types/playerTypes";

const GROUP_ROUNDS = [1, 2, 3, 4, 5, 6];
const DAY_MS = 86_400_000;

/** `d` plus the day before and the day after it. */
function withNeighbours(d: string): string[] {
  const ms = Date.parse(`${d}T00:00:00Z`);
  return [new Date(ms - DAY_MS).toISOString().slice(0, 10), d, new Date(ms + DAY_MS).toISOString().slice(0, 10)];
}

describe("createSave generates continental competitions", () => {
  let saveId = "";
  let createSaveMs = 0;

  beforeAll(async () => {
    const start = Date.now();
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
      budget: 1,
    });
    createSaveMs = Date.now() - start;
    saveId = meta.id;
  }, 300_000);

  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("createSave timing (reported, not asserted)", () => {
    // eslint-disable-next-line no-console
    console.log(`createSave with continentals took ${createSaveMs}ms`);
    expect(createSaveMs).toBeGreaterThan(0);
  });

  test("all 4 competitions exist with 32 clubs, 8 groups of 4, rounds 1-6 with 16 fixtures", async () => {
    for (const slug of CONTINENTAL_SLUGS) {
      const compMeta = await saveService.getLeagueMeta(saveId, slug);
      expect(compMeta?.kind).toBe("continental");
      const cont = compMeta!.continental!;
      expect(cont.groups.length).toBe(8);
      for (const g of cont.groups) expect(g.clubs.length).toBe(4);
      const clubs = cont.groups.flatMap((g) => g.clubs);
      expect(new Set(clubs).size).toBe(32);
      expect(cont.championId).toBeNull();

      for (const round of GROUP_ROUNDS) {
        const r = await saveService.getRound(saveId, slug, round);
        expect(r!.fixtures.length).toBe(16);
      }
    }
  }, 300_000);

  test("no club is a participant in two continental competitions", async () => {
    const allClubs: string[] = [];
    for (const slug of CONTINENTAL_SLUGS) {
      const compMeta = await saveService.getLeagueMeta(saveId, slug);
      allClubs.push(...compMeta!.continental!.groups.flatMap((g) => g.clubs));
    }
    const duplicates = allClubs.filter((id, i) => allClubs.indexOf(id) !== i);
    expect(duplicates, `clubs in more than one continental: ${JSON.stringify([...new Set(duplicates)])}`).toEqual([]);
    expect(allClubs.length).toBe(4 * 32);
  }, 300_000);

  test("Premier League clubs in UCL match the league's ucl zone span", async () => {
    const catalog = (await getLeagueData()) as unknown as Array<{ slug: string; zones?: LeagueZone[] }>;
    const pl = catalog.find((l) => l.slug === "premier_league")!;
    const uclZone = pl.zones!.find((z) => z.id === "ucl")!;
    const expected = (uclZone.to ?? uclZone.from!) - uclZone.from! + 1;

    const index = await saveService.getSquadIndex(saveId);
    const ucl = await saveService.getLeagueMeta(saveId, "ucl");
    const plClubs = new Set(index.inLeague("premier_league").map((t) => t.squadId));
    const uclClubs = ucl!.continental!.groups.flatMap((g) => g.clubs);
    const plInUcl = uclClubs.filter((id) => plClubs.has(id));
    expect(plInUcl.length).toBe(expected);
  }, 300_000);

  interface CompetitionClashes {
    slug: string;
    fixtures: Fixture[];
    /** Exact-day clash with a participant's own league/cup fixture — must never happen. */
    hardClashes: Fixture[];
    /** Day-before/after clash — merely reported/bounded, not a hard requirement. */
    softClashes: Fixture[];
  }

  /**
   * Group-stage fixtures of `slug` plus the exact ("hard") and ±1-day ("soft") clash sets, scoped
   * to ONLY that competition's own participants' countries — using the wider continent-shared busy
   * set `createContinentalSeason` actually schedules against would flag false clashes from the
   * sibling competition's countries (e.g. a South American league date against a Europe-only
   * fixture), since a club is never in both competitions of a continent.
   */
  async function competitionClashes(slug: string): Promise<CompetitionClashes> {
    const catalog = await getLeagueData();
    const countryOf = countryByLeague(catalog);
    const index = await saveService.getSquadIndex(saveId);

    const fixtures: Fixture[] = [];
    const leagueSlugs = new Set<string>();
    for (const round of GROUP_ROUNDS) {
      const r = await saveService.getRound(saveId, slug, round);
      for (const f of r!.fixtures) {
        fixtures.push(f);
        for (const clubId of [f.home, f.away]) {
          const entry = index.byId(clubId);
          if (entry) leagueSlugs.add(entry.leagueSlug);
        }
      }
    }
    const cupSlugs = [...leagueSlugs]
      .map((l) => countryOf.get(l))
      .filter((c): c is string => c !== undefined)
      .map((c) => cupSlugOf(c));

    // Exact dates — league AND cup, including every undrawn cup-stage date (leagueBusyDates reads
    // the cup's date-index, which already carries every stage's date from generation onward).
    const hardBusy = await leagueBusyDates(saveService, saveId, [...leagueSlugs, ...cupSlugs]);
    const softBusy = new Set<string>();
    for (const d of hardBusy) for (const n of withNeighbours(d)) softBusy.add(n);

    return {
      slug,
      fixtures,
      hardClashes: fixtures.filter((f) => hardBusy.has(f.date)),
      softClashes: fixtures.filter((f) => softBusy.has(f.date) && !hardBusy.has(f.date)),
    };
  }

  const describeClashes = (fixtures: Fixture[]) =>
    JSON.stringify(fixtures.map((f) => ({ id: f.id, date: f.date, home: f.home, away: f.away })));

  test("(a) same-day double-booking is impossible, across all 4 competitions (league + cup, incl. undrawn cup stages)", async () => {
    for (const slug of CONTINENTAL_SLUGS) {
      const { fixtures, hardClashes } = await competitionClashes(slug);
      expect(fixtures.length).toBe(GROUP_ROUNDS.length * 16);
      expect(hardClashes.length, `${slug}: same-day clash(es): ${describeClashes(hardClashes)}`).toBe(0);
    }
  }, 300_000);

  /**
   * (b) Adjacent-day (day before/after) clashes: merely a preference, not a guarantee — reported per
   * competition rather than hidden. 0 is NOT achieved for Europe either, honestly: the group
   * window's own last round (round 6) and the round before it (round 5) both need the same single
   * remaining Tuesday before the window closes on 12-15 — whichever one doesn't get it lands on an
   * adjacent day instead. South America's rate is higher: Brazil and Argentina's own top flights
   * rotate through the same weekday every national cup in the world uses, so almost every Tuesday
   * (Libertadores) / Thursday (Sul-Americana) is adjacent to some domestic fixture somewhere. The
   * ceilings below are generous so a real regression still fails the test.
   */
  test("(b) adjacent-day clashes are reported per competition; bounded for all 4", async () => {
    const bySlug = new Map<string, CompetitionClashes>();
    for (const slug of CONTINENTAL_SLUGS) bySlug.set(slug, await competitionClashes(slug));

    for (const slug of CONTINENTAL_SLUGS) {
      const c = bySlug.get(slug)!;
      // eslint-disable-next-line no-console
      console.log(`${slug}: adjacent-day clashes ${c.softClashes.length}/${c.fixtures.length}`);
    }

    for (const slug of ["ucl", "uel"]) {
      const c = bySlug.get(slug)!;
      expect(
        c.softClashes.length,
        `${slug}: too many adjacent-day clashes (${c.softClashes.length}/${c.fixtures.length}): ${describeClashes(c.softClashes)}`,
      ).toBeLessThanOrEqual(c.fixtures.length / 4);
    }
    for (const slug of ["lib", "sud"]) {
      const c = bySlug.get(slug)!;
      expect(
        c.softClashes.length,
        `${slug}: too many adjacent-day clashes (${c.softClashes.length}/${c.fixtures.length}): ${describeClashes(c.softClashes)}`,
      ).toBeLessThanOrEqual(c.fixtures.length / 2);
    }
  }, 300_000);

  /**
   * (c) Consecutive continental round dates (all 13: group + knockout, drawn or not) closer than
   * the intended 6-day gap. Reported per competition; a small number is expected wherever
   * `continentalDates`' graceful degradation had to pack dates tighter than the ideal gap (the same
   * scarcity (a)/(b) describe) — bounded generously so an actual regression (e.g. duplicate or
   * out-of-order dates) still fails loudly.
   */
  test("(c) continental round-to-round gaps under 6 days are reported per competition", async () => {
    for (const slug of CONTINENTAL_SLUGS) {
      const meta = await saveService.getLeagueMeta(saveId, slug);
      const dates = meta!.continental!.stages.flatMap((s) => s.dates);
      expect(dates).toHaveLength(13);
      for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);

      let shortGaps = 0;
      const detail: string[] = [];
      for (let i = 1; i < dates.length; i++) {
        const gapDays = (Date.parse(dates[i]!) - Date.parse(dates[i - 1]!)) / DAY_MS;
        if (gapDays < 6) {
          shortGaps++;
          detail.push(`${dates[i - 1]}->${dates[i]} (${gapDays}d)`);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`${slug}: ${shortGaps}/12 round gap(s) under 6 days${detail.length ? ` — ${detail.join(", ")}` : ""}`);
      expect(shortGaps, `${slug}: ${detail.join(", ")}`).toBeLessThanOrEqual(2);
    }
  }, 300_000);
});
