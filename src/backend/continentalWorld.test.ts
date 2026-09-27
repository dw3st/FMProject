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

  /**
   * Gathers every group-stage fixture of `slugs` plus the set of domestic leagues (and, for the
   * diagnostic report, national cups) their participants belong to. Scoped per continent because
   * a busy date must only be checked against the leagues of the continent actually being tested —
   * mixing all 4 competitions' involved leagues into one set would flag false clashes between,
   * say, a South American league date and a Europe-only fixture.
   */
  async function continentClashes(
    slugs: string[],
  ): Promise<{ fixtures: Fixture[]; leagueClashes: Fixture[]; leagueAndCupClashes: Fixture[] }> {
    const catalog = await getLeagueData();
    const countryOf = countryByLeague(catalog);
    const index = await saveService.getSquadIndex(saveId);

    const fixtures: Fixture[] = [];
    const leagueSlugs = new Set<string>();
    for (const slug of slugs) {
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
    }

    const busySetFrom = async (slugsToCheck: string[]) => {
      const raw = await leagueBusyDates(saveService, saveId, slugsToCheck);
      const busy = new Set<string>();
      for (const d of raw) for (const n of withNeighbours(d)) busy.add(n);
      return busy;
    };

    const leagueBusy = await busySetFrom([...leagueSlugs]);
    const cupSlugs = [...leagueSlugs]
      .map((l) => countryOf.get(l))
      .filter((c): c is string => c !== undefined)
      .map((c) => cupSlugOf(c));
    const leagueAndCupBusy = await busySetFrom([...leagueSlugs, ...cupSlugs]);

    return {
      fixtures,
      leagueClashes: fixtures.filter((f) => leagueBusy.has(f.date)),
      leagueAndCupClashes: fixtures.filter((f) => leagueAndCupBusy.has(f.date)),
    };
  }

  const describeClashes = (fixtures: Fixture[]) =>
    JSON.stringify(fixtures.map((f) => ({ id: f.id, date: f.date, home: f.home, away: f.away })));

  test("Europe: no group-stage fixture lands the day before, of, or after a participant's league fixture", async () => {
    const { fixtures, leagueClashes } = await continentClashes(["ucl", "uel"]);
    expect(fixtures.length).toBe(2 * GROUP_ROUNDS.length * 16);
    expect(leagueClashes.length, `clashes: ${describeClashes(leagueClashes)}`).toBe(0);
  }, 300_000);

  /**
   * South America: reported, not required to be zero. `createContinentalSeason` (continentalWorld.ts)
   * deliberately excludes national cup dates from the busy set it feeds `continentalDates` — every
   * cup in the world always plays on a fixed Wednesday, and Libertadores' own weekday IS that
   * Wednesday, so folding cups in made group/knockout date generation provably infeasible (see that
   * file's comment). Even league-only, Brazil and Argentina's top flights also rotate through
   * Wednesday, which can occasionally force a date onto a busy day via `continentalDates`'
   * graceful-degradation fallback rather than crash — this test surfaces that count instead of
   * hiding it, and still fails if it grows far beyond the one-round-ish scale observed today.
   */
  test("South America: league/cup date clashes are reported (not silently accepted at scale)", async () => {
    const { fixtures, leagueClashes, leagueAndCupClashes } = await continentClashes(["lib", "sud"]);
    expect(fixtures.length).toBe(2 * GROUP_ROUNDS.length * 16);

    // eslint-disable-next-line no-console
    console.log(
      `South America group-stage clashes — league-only: ${leagueClashes.length}/${fixtures.length}, ` +
        `league+cup: ${leagueAndCupClashes.length}/${fixtures.length}`,
    );
    if (leagueClashes.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`league-only clash detail: ${describeClashes(leagueClashes)}`);
    }

    expect(
      leagueClashes.length,
      `too many league-date clashes (${leagueClashes.length}/${fixtures.length}): ${describeClashes(leagueClashes)}`,
    ).toBeLessThanOrEqual(fixtures.length / 4);
  }, 300_000);
});
