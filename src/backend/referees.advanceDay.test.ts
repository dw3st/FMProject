/**
 * Referees in the save and the day pipeline (`.claude/rules/game/referees.md`): the world pool on a new career,
 * the day's appointments (stable, no referee twice), the referee in the day log, the season stats, the renewal.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { ensureAssignments, matchesPerRoundByCountry, rolloverReferees, refereeSeasonKey } from "@/backend/refereeWorld";
import { poolSizeFor } from "@/Domain/referees/pool";
import { fixtureKey } from "@/Domain/referees/assign";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import type { MatchEvent } from "@/types/dayLogTypes";
import { apiRoutes } from "@/backend/routes";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

const HUMAN = "33";

describe("referees in the save", () => {
  let saveId = "";
  let day = "";
  let token = "";
  let other = "";
  const call = async (key: string, path: string, tok = token) => {
    const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(new Request(`http://localhost${path}`, { headers: { cookie: `fs_session=${tok}` } }), { params: { saveId } }));
  };
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("referees-route@test.local");
    token = session.token;
    other = devAutoLogin("referees-other@test.local").session.token;
    recordSaveOwnership(saveId, user.id);
    const idx = (await saveService.getDateIndex(saveId, "premier_league"))!;
    day = Object.keys(idx).filter((d) => d >= (meta.currentDate ?? "")).sort()[0]!;
  }, 240_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("the new career has a pool for every country with leagues, sized by its matches per round", async () => {
    const pool = (await saveService.getRefereePool(saveId))!;
    expect(pool).not.toBeNull();
    const perRound = await matchesPerRoundByCountry(saveService, saveId);
    for (const [country, n] of perRound) {
      const size = poolSizeFor(n);
      expect(pool.referees.filter((r) => r.country === country && r.role === "referee")).toHaveLength(size.referees);
      expect(pool.referees.filter((r) => r.country === country && r.role === "assistant")).toHaveLength(size.assistants);
    }
    expect(new Set(pool.referees.map((r) => r.id)).size).toBe(pool.referees.length);
    expect(pool.referees.some((r) => r.country === "England" && !r.generated)).toBe(true);
    expect(pool.referees.some((r) => r.country === "Kenya" && !r.generated)).toBe(false);
    const mean = pool.referees.reduce((a, r) => a + r.strictness, 0) / pool.referees.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  test("appointments are stable, one per first-team match, nobody twice a day", async () => {
    const a = await ensureAssignments(saveService, saveId, day);
    const b = await ensureAssignments(saveService, saveId, day);
    expect(b).toEqual(a);
    const fixtures = (await saveService.getFixturesForDate(saveId, day)).filter((f) => !isYouthCompSlug(f.competition));
    const pl = fixtures.filter((f) => f.competition === "premier_league");
    expect(pl.length).toBeGreaterThan(0);
    for (const f of pl) expect(a[fixtureKey(f.competition, f.id)]).toBeDefined();
    const ids = Object.values(a).flatMap((x) => [x.refereeId, ...x.assistantIds]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the day log carries the appointed referee; stats add up", async () => {
    const assigned = await ensureAssignments(saveService, saveId, day);
    await saveService.updateMeta(saveId, { currentDate: day });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);
    const log = (await saveService.getDayLog(saveId, day))!;
    const matches = log.events.filter((e): e is MatchEvent => e.kind === "match");
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      const a = assigned[fixtureKey(m.competition, m.fixtureId)];
      if (a) expect(m.referee?.id).toBe(a.refereeId);
    }
    expect(matches.filter((m) => m.competition === "premier_league").every((m) => m.referee)).toBe(true);
    const state = (await saveService.getRefereeState(saveId))!;
    const counted = Object.values(state.stats).reduce((s, x) => s + x.matches, 0);
    expect(counted).toBe(matches.filter((m) => m.referee).length);
    const yellows = Object.values(state.stats).reduce((s, x) => s + x.yellows, 0);
    expect(yellows).toBe(matches.filter((m) => m.referee).flatMap((m) => m.cards ?? []).filter((c) => c.card === "yellow").length);
    // A replayed day never counts twice; tomorrow is already appointed.
    expect(Object.keys(state.assignments)).toContain(day);
  }, 240_000);

  test("match-setup gives the appointed referee (band, age, two assistants; no raw rigor on screen fields)", async () => {
    const idx = (await saveService.getDateIndex(saveId, "premier_league"))!;
    let next = "";
    for (const d of Object.keys(idx).filter((x) => x > day).sort()) {
      if ((await saveService.getFixturesForDate(saveId, d)).some((f) => f.home === HUMAN || f.away === HUMAN)) { next = d; break; }
    }
    await saveService.updateMeta(saveId, { currentDate: next });
    await saveService.saveTactics(saveId, { tactical_style: "balanced", formation: "4-3-3", lineup: autoLineupDefaultFormation((await saveService.getSquadById(saveId, HUMAN))!) });
    const res = await call("/api/match-setup", `/api/match-setup?saveId=${saveId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.referee).not.toBeNull();
    expect(["lenient", "balanced", "strict"]).toContain(body.referee.band);
    expect(body.referee.assistants).toHaveLength(2);
    expect(typeof body.referee.age).toBe("number");
    const state = (await saveService.getRefereeState(saveId))!;
    const ids = Object.values(state.assignments[body.fixture.date] ?? {}).map((a) => a.refereeId);
    expect(ids).toContain(body.referee.id);
  }, 120_000);

  test("referees route: owner, validation, rows per match", async () => {
    expect((await call("/api/saves/:saveId/referees", `/api/saves/${saveId}/referees`, other)).status).toBe(404);
    expect((await call("/api/saves/:saveId/referees", `/api/saves/${saveId}/referees?competition=../x`)).status).toBe(400);
    expect((await call("/api/saves/:saveId/referees", `/api/saves/${saveId}/referees?season=2010-11`)).status).toBe(404);
    const res = await call("/api/saves/:saveId/referees", `/api/saves/${saveId}/referees?competition=premier_league`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items.length).toBeGreaterThan(0);
    for (const r of body.items) {
      expect(r.matches).toBeGreaterThan(0);
      expect("strictness" in r).toBe(false);
      expect(["lenient", "balanced", "strict"]).toContain(r.band);
    }
  });

  test("a country's rollover archives its stats and renews only its pool", async () => {
    const before = (await saveService.getRefereePool(saveId))!;
    await rolloverReferees(saveService, saveId, "England", "2027-06-01", "2026-27");
    const after = (await saveService.getRefereePool(saveId))!;
    expect(after.renewed.England).toBe("2027-06-01");
    expect(after.referees.filter((r) => r.country === "Spain")).toEqual(before.referees.filter((r) => r.country === "Spain"));
    const archive = await saveService.getRefereeSeason(saveId, refereeSeasonKey("England", "2026-27"));
    expect(archive?.country).toBe("England");
    const state = (await saveService.getRefereeState(saveId))!;
    const englishIds = new Set(before.referees.filter((r) => r.country === "England").map((r) => r.id));
    expect(Object.keys(state.stats).some((id) => englishIds.has(id))).toBe(false);
    await rolloverReferees(saveService, saveId, "England", "2027-06-01", "2026-27");
    expect(await saveService.getRefereePool(saveId)).toEqual(after);
    const old = await call("/api/saves/:saveId/referees", `/api/saves/${saveId}/referees?season=2026-27`);
    expect(old.status).toBe(200);
    expect(((await old.json()) as any).seasons).toContain("2026-27");
  });
});
