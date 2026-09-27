import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, getLeagueData, getPyramids } from "@/backend/advanceDay";
import { countryByLeague, leagueBusyDates } from "@/backend/cupWorld";
import { continentalGoodClubsThisSeason, continentalTier1LeagueStates, playerContinentalSlug } from "@/backend/continentalWorld";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { CONTINENTAL, CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import type { RoundFixtures } from "@/types/calendarTypes";
import type { LeagueZone } from "@/types/playerTypes";
import type { TacticsSave } from "@/types/tacticsTypes";

const GROUP_ROUNDS = [1, 2, 3, 4, 5, 6];
const DAY_MS = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

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

  interface CompetitionMetrics {
    slug: string;
    dates: string[];
    /** 32 — one exact-date set per participant club's own country (league + cup, incl. undrawn stages). */
    participantDates: Set<string>[];
    /** Σ over (participant, date): 1 if the participant plays exactly on that date. Must be 0. */
    sameDayCount: number;
    detail: string[];
    /** Σ over (participant, date): 1 if the participant plays the day before or after (not same-day). */
    adjacentDayCount: number;
    /** Of the 13 dates, how many fall on the competition's own weekday (`CONTINENTAL[slug].weekday`). */
    onWeekdayCount: number;
    /** Smallest gap (days) between two consecutive dates. */
    minGapDays: number;
  }

  /**
   * Per-participant, per-date clash counts for `slug` — the SAME unit `continentalDates`' scheduler
   * itself optimises (`hard[d]`/`soft[d]` in `continentalDates.ts`), over all 13 dates (group +
   * knockout, drawn or not), scoped to ONLY this competition's own 32 participants (not the
   * continent's other competition, and not every country in the continent).
   */
  async function competitionMetrics(slug: string): Promise<CompetitionMetrics> {
    const catalog = await getLeagueData();
    const countryOf = countryByLeague(catalog);
    const index = await saveService.getSquadIndex(saveId);
    const compMeta = await saveService.getLeagueMeta(saveId, slug);
    const cont = compMeta!.continental!;
    const clubs = cont.groups.flatMap((g) => g.clubs);
    const dates = cont.stages.flatMap((s) => s.dates);
    const weekday = CONTINENTAL[slug as keyof typeof CONTINENTAL].weekday;

    const leagueDatesCache = new Map<string, Set<string>>();
    const datesOfLeague = async (leagueSlug: string): Promise<Set<string>> => {
      const cached = leagueDatesCache.get(leagueSlug);
      if (cached) return cached;
      const country = countryOf.get(leagueSlug);
      const d = await leagueBusyDates(saveService, saveId, country ? [leagueSlug, cupSlugOf(country)] : [leagueSlug]);
      leagueDatesCache.set(leagueSlug, d);
      return d;
    };

    const participantDates: Set<string>[] = [];
    for (const clubId of clubs) {
      const leagueSlug = index.byId(clubId)?.leagueSlug;
      participantDates.push(leagueSlug ? await datesOfLeague(leagueSlug) : new Set());
    }

    let sameDayCount = 0;
    let adjacentDayCount = 0;
    let onWeekdayCount = 0;
    const detail: string[] = [];
    for (const d of dates) {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() === weekday) onWeekdayCount++;
      const before = toIso(toMs(d) - DAY_MS);
      const after = toIso(toMs(d) + DAY_MS);
      for (const pd of participantDates) {
        if (pd.has(d)) {
          sameDayCount++;
          detail.push(d);
        } else if (pd.has(before) || pd.has(after)) {
          adjacentDayCount++;
        }
      }
    }

    let minGapDays = Infinity;
    for (let i = 1; i < dates.length; i++) {
      minGapDays = Math.min(minGapDays, (toMs(dates[i]!) - toMs(dates[i - 1]!)) / DAY_MS);
    }

    return { slug, dates, participantDates, sameDayCount, detail, adjacentDayCount, onWeekdayCount, minGapDays };
  }

  test("(a) same-day double-booking is impossible, across all 4 competitions, over all 13 dates (league + cup, incl. undrawn cup stages)", async () => {
    for (const slug of CONTINENTAL_SLUGS) {
      const m = await competitionMetrics(slug);
      expect(m.dates).toHaveLength(13);
      expect(m.participantDates).toHaveLength(32);
      expect(m.sameDayCount, `${slug}: same-day clash date(s): ${m.detail.join(", ")}`).toBe(0);
    }
  }, 300_000);

  /**
   * (b)/(c) reported together: per-club adjacent-day clash rate (over all 32 participants × 13
   * dates = 416 participant-date instances), how many of the 13 dates land on the competition's
   * own weekday, and the minimum gap between two consecutive dates (must stay >= 3, the scheduler's
   * hard constraint — see `continentalDates.ts`'s `MIN_GAP_DAYS`).
   */
  test("(b) per-club adjacent-day rate and weekday count are reported per competition; (c) min gap >= 3", async () => {
    for (const slug of CONTINENTAL_SLUGS) {
      const m = await competitionMetrics(slug);
      const total = m.participantDates.length * m.dates.length; // 32 * 13 = 416
      // eslint-disable-next-line no-console
      console.log(
        `${slug}: adjacent-day ${m.adjacentDayCount}/${total}, on-weekday ${m.onWeekdayCount}/13, ` +
          `min gap ${m.minGapDays}d`,
      );
      expect(m.minGapDays, `${slug}: dates ${JSON.stringify(m.dates)}`).toBeGreaterThanOrEqual(3);
    }
  }, 300_000);

  test("playerContinentalSlug: a qualified Premier League club returns ucl or uel; a Championship club returns null", async () => {
    const index = await saveService.getSquadIndex(saveId);
    const plClubs = new Set(index.inLeague("premier_league").map((t) => t.squadId));
    const ucl = await saveService.getLeagueMeta(saveId, "ucl");
    const uel = await saveService.getLeagueMeta(saveId, "uel");
    const uclClubs = ucl!.continental!.groups.flatMap((g) => g.clubs);
    const uelClubs = uel!.continental!.groups.flatMap((g) => g.clubs);
    const qualifiedClub = [...uclClubs, ...uelClubs].find((id) => plClubs.has(id));
    expect(qualifiedClub).toBeTruthy();

    const contSlug = await playerContinentalSlug(saveService, saveId, qualifiedClub!);
    expect(["ucl", "uel"]).toContain(contSlug!);

    const championshipClub = index.inLeague("of_championship")[0]?.squadId;
    expect(championshipClub).toBeTruthy();
    expect(await playerContinentalSlug(saveService, saveId, championshipClub!)).toBeNull();
  }, 300_000);

  test("GET /api/saves/:id/continental/:slug returns meta, fixtures, names and 8 group tables of 4 rows each", async () => {
    const { user, session } = devAutoLogin(`continental-route-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const handler = apiRoutes["/api/saves/:saveId/continental/:slug"];

    const contSlug = "ucl";
    const okReq = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/continental/${contSlug}`, {
        headers: { cookie: `fs_session=${session.token}` },
      }),
      { params: { saveId, slug: contSlug } },
    );
    const okRes = await handler(okReq as Request & { params: Record<string, string> });
    expect(okRes.status).toBe(200);
    const body = (await okRes.json()) as {
      meta: { continental: { groups: { name: string; clubs: string[] }[] } };
      fixtures: unknown[];
      names: Record<string, string>;
      groups: { name: string; rows: unknown[] }[];
    };
    expect(body.meta.continental.groups.length).toBe(8);
    expect(body.fixtures.length).toBeGreaterThan(0);
    expect(body.groups.length).toBe(8);
    for (const g of body.groups) expect(g.rows.length).toBe(4);
    for (const g of body.meta.continental.groups) {
      for (const clubId of g.clubs) expect(body.names[clubId]).toBeTruthy();
    }

    const badReq = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/continental/xyz`, {
        headers: { cookie: `fs_session=${session.token}` },
      }),
      { params: { saveId, slug: "xyz" } },
    );
    const badRes = await handler(badReq as Request & { params: Record<string, string> });
    expect(badRes.status).toBe(400);
  }, 300_000);

  test("/api/match-setup picks up the player's continental fixture", async () => {
    // The player's OWN club needs to be a continental qualifier for this flow — pick one of the
    // Premier League clubs already known (from the earlier test) to be in ucl/uel this season and
    // create a dedicated save owned by it, rather than assuming the shared save's clubId (33)
    // qualifies (it may not — qualification is rank/level-based, not fixed per club).
    const index = await saveService.getSquadIndex(saveId);
    const plClubs = new Set(index.inLeague("premier_league").map((t) => t.squadId));
    const ucl = await saveService.getLeagueMeta(saveId, "ucl");
    const uel = await saveService.getLeagueMeta(saveId, "uel");
    const uclClubs = ucl!.continental!.groups.flatMap((g) => g.clubs);
    const uelClubs = uel!.continental!.groups.flatMap((g) => g.clubs);
    const qualifiedClub = [...uclClubs, ...uelClubs].find((id) => plClubs.has(id))!;
    expect(qualifiedClub).toBeTruthy();

    const meta2 = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: qualifiedClub, clubName: "Test2", clubColors: ["#000000", "#ffffff"],
    });
    const saveId2 = meta2.id;
    try {
      const contSlug = (await playerContinentalSlug(saveService, saveId2, qualifiedClub))!;
      expect(contSlug).toBeTruthy();
      const contMeta = await saveService.getLeagueMeta(saveId2, contSlug);
      const group = contMeta!.continental!.stages.find((s) => s.name === "group")!;
      const round1Date = group.dates[0]!;

      const mySquad = (await saveService.getSquadById(saveId2, qualifiedClub))!;
      const tactics: TacticsSave = {
        tactical_style: "balanced",
        formation: "4-3-3",
        lineup: autoLineupDefaultFormation(mySquad),
      };
      await saveService.saveTactics(saveId2, tactics);
      await saveService.updateMeta(saveId2, { currentDate: round1Date });

      const { user, session } = devAutoLogin(`match-setup-${saveId2}@test.local`);
      recordSaveOwnership(saveId2, user.id);

      const req = new Request(`http://localhost/api/match-setup?saveId=${saveId2}`, {
        headers: { cookie: `fs_session=${session.token}` },
      });
      const res = await apiRoutes["/api/match-setup"](req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { fixture: { competition: string; home: string; away: string } };
      expect(body.fixture.competition).toBe(contSlug);
      expect([body.fixture.home, body.fixture.away]).toContain(qualifiedClub);
    } finally {
      await saveService.deleteSave(saveId2);
    }
  }, 300_000);
});

describe("advanceOneDay plays continental fixtures", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("UCL group-stage round 1 (16 fixtures) gets played", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const ucl = await saveService.getLeagueMeta(saveId, "ucl");
    const group = ucl!.continental!.stages.find((s) => s.name === "group")!;
    const round1Date = group.dates[0]!;

    await saveService.updateMeta(saveId, { currentDate: round1Date });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    const round1 = await saveService.getRound(saveId, "ucl", 1);
    expect(round1!.fixtures.length).toBe(16);
    for (const f of round1!.fixtures) {
      expect(f.played).toBe(true);
      expect(f.result).not.toBeNull();
    }
  }, 300_000);
});

describe("advanceOneDay fills a missing second-leg aggregate before kickoff", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("leg 2 with no aggregate on disk gets it computed from the played leg 1", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const ucl = await saveService.getLeagueMeta(saveId, "ucl");
    const r16 = ucl!.continental!.stages.find((s) => s.name === "r16")!;
    const qf = ucl!.continental!.stages.find((s) => s.name === "qf")!;
    const [round7, round8] = r16.rounds as [number, number];
    const [date0, date1] = r16.dates as [string, string];

    const index = await saveService.getSquadIndex(saveId);
    const uclClubs = ucl!.continental!.groups
      .flatMap((g) => g.clubs)
      .filter((id) => index.byId(id)?.leagueSlug !== "premier_league");
    const [clubA, clubB, clubC, clubD] = uclClubs;
    if (!clubA || !clubB || !clubC || !clubD) {
      throw new Error("not enough non-Premier-League UCL clubs for the test setup");
    }

    // Tie 1: leg 1 already played (clubA 2-0 clubB); leg 2 (today, round8) starts with NO aggregate
    // on disk — this is the anomaly Step 1b guards against (the leg1 step may have failed to write it).
    const round7Data: RoundFixtures = {
      leagueSlug: "ucl",
      round: round7,
      fixtures: [{
        id: "test_tie1_leg1", date: date0, competition: "ucl", round: round7,
        home: clubA, away: clubB, played: true, result: { home: 2, away: 0 },
        tieId: "test_tie1", leg: 1,
      }],
    };
    await saveService.writeRound(saveId, "ucl", round7, round7Data);

    // A second, deliberately-unplayed tie (different date) keeps this round from "completing" once
    // tie 1 is simulated — advanceContinentalStages must not attempt to draw the next stage off a
    // fabricated 1-tie round. The test only exercises the aggregate fill-in, not stage progression.
    const round8Data: RoundFixtures = {
      leagueSlug: "ucl",
      round: round8,
      fixtures: [
        {
          id: "test_tie1_leg2", date: date1, competition: "ucl", round: round8,
          home: clubB, away: clubA, played: false, result: null,
          tieId: "test_tie1", leg: 2, knockout: true,
        },
        {
          id: "test_tie2_leg2", date: qf.dates[0]!, competition: "ucl", round: round8,
          home: clubC, away: clubD, played: false, result: null,
          tieId: "test_tie2", leg: 2, knockout: true,
        },
      ],
    };
    await saveService.writeRound(saveId, "ucl", round8, round8Data);

    await saveService.updateMeta(saveId, { currentDate: date1 });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    const round8After = await saveService.getRound(saveId, "ucl", round8);
    const tie1After = round8After!.fixtures.find((f) => f.id === "test_tie1_leg2")!;
    expect(tie1After.played).toBe(true);
    expect(tie1After.result).not.toBeNull();
    // leg2.home = clubB (scored 0 in leg1), leg2.away = clubA (scored 2 in leg1).
    expect(tie1After.aggregate).toEqual({ home: 0, away: 2 });

    const level =
      tie1After.result!.home + tie1After.aggregate!.home === tie1After.result!.away + tie1After.aggregate!.away;
    if (level) {
      const pens = tie1After.decider?.penalties;
      expect(pens && pens.home !== pens.away).toBe(true);
    }

    // Untouched: different date, excluded from today's simulation.
    const tie2After = round8After!.fixtures.find((f) => f.id === "test_tie2_leg2")!;
    expect(tie2After.played).toBe(false);
  }, 300_000);
});

describe("continentalTier1LeagueStates", () => {
  test("Europe's tier-1 league carries its schedule's cross-year flag; South America's is included too", async () => {
    const catalog = await getLeagueData();
    const pyramids = await getPyramids();
    const activeLeagues = [
      { leagueSlug: "premier_league", year: 2028 }, // England's tier-1 — Europe, crosses the year
      { leagueSlug: "brazil_serie_a", year: 2029 }, // Brazil's tier-1 — South America, calendar-year
    ];

    const states = await continentalTier1LeagueStates(activeLeagues, catalog, pyramids);

    const pl = states.find((s) => s.continent === "Europe" && s.year === 2028);
    expect(pl).toBeTruthy();
    expect(pl!.crossYear).toBe(true);

    const br = states.find((s) => s.continent === "South America" && s.year === 2029);
    expect(br).toBeTruthy();
    expect(br!.crossYear).toBe(false);
  });

  test("a country's tier-1 league missing from activeLeagues is skipped, not guessed at", async () => {
    const catalog = await getLeagueData();
    const pyramids = await getPyramids();
    expect(await continentalTier1LeagueStates([], catalog, pyramids)).toEqual([]);
  });
});

describe("continentalGoodClubsThisSeason (Task 6 review fix — good vs title, timing gap)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("no final drawn anywhere: both sets empty", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const status = await continentalGoodClubsThisSeason(saveService, saveId);
    expect(status.good.size).toBe(0);
    expect(status.title.size).toBe(0);
  }, 60_000);

  test("final drawn, not yet played: both finalists are 'good', neither is 'title' yet", async () => {
    const uclMeta = (await saveService.getLeagueMeta(saveId, "ucl"))!;
    const cont = uclMeta.continental!;
    const finalStage = cont.stages.find((s) => s.name === "final")!;
    const [home, away] = cont.groups.flatMap((g) => g.clubs);

    const stages = cont.stages.map((s) => (s.name === "final" ? { ...s, drawn: true } : s));
    await saveService.writeLeagueMeta(saveId, { ...uclMeta, continental: { ...cont, stages } });
    await saveService.writeRound(saveId, "ucl", finalStage.rounds[0]!, {
      leagueSlug: "ucl", round: finalStage.rounds[0]!,
      fixtures: [{
        id: "fix_final_test", date: finalStage.dates[0]!, competition: "ucl", round: finalStage.rounds[0]!,
        home: home!, away: away!, played: false, result: null, knockout: true, neutral: true,
      }],
    });

    const status = await continentalGoodClubsThisSeason(saveService, saveId);
    expect(status.good).toEqual(new Set([home!, away!]));
    expect(status.title.size).toBe(0);
  }, 60_000);

  test("champion decided: the champion is in BOTH sets, the runner-up only in 'good'", async () => {
    const uclMeta = (await saveService.getLeagueMeta(saveId, "ucl"))!;
    const cont = uclMeta.continental!;
    const [home, away] = cont.groups.flatMap((g) => g.clubs);

    await saveService.writeLeagueMeta(saveId, { ...uclMeta, continental: { ...cont, championId: home! } });

    const status = await continentalGoodClubsThisSeason(saveService, saveId);
    expect(status.good).toEqual(new Set([home!, away!]));
    expect(status.title).toEqual(new Set([home!]));
    expect(status.title.has(away!)).toBe(false);
  }, 60_000);
});
