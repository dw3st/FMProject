import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { matchSetupFor } from "@/backend/matchSetup";
import { addSeat } from "@/backend/seats";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { axesFor } from "@/types/tacticsTypes";
import { addDays } from "@/Domain/dates";
import type { Fixture } from "@/types/calendarTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { MatchSetupStudy, TacticLogEntry } from "@/types/studyTypes";

const CLUB = "33";

/**
 * AI clubs study the manager's tactic (`.claude/rules/game/study.md`): `match-setup` tells the plan against an AI
 * club and never against another seat; the day advance logs the plan of every official game once, keeps five,
 * puts the AI's plan in the day log, and a change of club clears the log.
 */
describe("AI tactic study: match-setup and the day advance", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  const start = async (tag: string) => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: CLUB, clubName: "Manchester United", clubColors: ["#da291c", "#000000"],
    });
    created.push(meta.id);
    const { user, session } = devAutoLogin(`study-${tag}-${meta.id}@test.local`);
    const seatId = await ownSolo(meta.id, user.id);
    let fixture: Fixture | null = null;
    for (let r = 1; r <= 38 && !fixture; r++) {
      const round = await saveService.getRound(meta.id, "premier_league", r);
      fixture = round?.fixtures.find((f) => !f.played && (f.home === CLUB || f.away === CLUB)) ?? null;
    }
    if (!fixture) throw new Error("no fixture");
    await saveService.updateMeta(meta.id, { currentDate: fixture.date });
    return { saveId: meta.id, seatId, fixture, token: session.token };
  };

  const oldLog = (date: string): TacticLogEntry[] => Array.from({ length: 5 }, (_, i) => ({
    date: addDays(date, -7 * (5 - i)), fixtureId: `old-${i}`, formation: "4-3-3", style: "high_press" as const, axes: axesFor("high_press"),
  }));

  const setup = async (saveId: string, seatId: string) => {
    const meta = (await saveService.getSeatMeta(saveId, seatId))!;
    const r = await matchSetupFor(meta, { live: false });
    if (!r.ok) throw new Error(JSON.stringify(r.body));
    return r.body as { study?: MatchSetupStudy; seatOpponent: boolean; oppLineup: string[]; myLineup: string[] };
  };

  test("against an AI club: the plan in match-setup, the log and the day log after the day, cleared on leaving the club", async () => {
    const { saveId, seatId, fixture, token } = await start("ai");
    const oppId = fixture.home === CLUB ? fixture.away : fixture.home;

    // Nothing logged yet: no plan.
    expect((await setup(saveId, seatId)).study).toBeUndefined();

    // Five equal games: every opponent reads at least `medium` (worst case, a LOW club against a 5-star analyst: 0.64).
    await saveService.updateSeat(saveId, seatId, { tacticLog: oldLog(fixture.date) });
    const body = await setup(saveId, seatId);
    expect(body.study).toBeDefined();
    expect(["medium", "high"]).toContain(body.study!.level);
    expect(body.study!.expected).toEqual({ formation: "4-3-3", style: "high_press" });
    expect(body.study!.style).toBe("counter_attack");
    if (body.study!.level === "high") {
      expect(body.myLineup).toContain(body.study!.mark!.targetRosterId);
      expect(body.study!.mark!.slot).toBeGreaterThan(0);
    } else {
      expect(body.study!.mark).toBeUndefined();
    }

    // The route answers the same.
    const res = await apiRoutes["/api/match-setup"](new Request(`http://localhost/api/match-setup?saveId=${saveId}`, {
      headers: { cookie: `fs_session=${token}` },
    }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { study?: MatchSetupStudy }).study).toEqual(body.study!);

    // The day: the game enters the log once, the log keeps five, the AI's plan goes to the day log.
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const seat = (await saveService.getSeat(saveId, seatId))!;
    expect(seat.tacticLog).toHaveLength(5);
    const last = seat.tacticLog!.at(-1)!;
    expect(last.date).toBe(fixture.date);
    expect(last.fixtureId).toBe(fixture.id);
    expect(last.formation).toBe("4-3-3");
    expect(seat.tacticLog!.filter((e) => e.fixtureId === fixture.id)).toHaveLength(1);
    expect(seat.tacticLog![0]!.fixtureId).toBe("old-1");

    const log = await saveService.getDayLog(saveId, fixture.date);
    const event = log!.events.find((e): e is MatchEvent => e.kind === "match" && (e.home === CLUB || e.away === CLUB))!;
    expect(event.study).toBeDefined();
    expect(event.study!.side).toBe(fixture.home === oppId ? "home" : "away");
    expect(event.study!.style).toBe("counter_attack");
    expect(event.study!.level).toBe(body.study!.level);
    // No other game of the day (AI against AI) has a plan.
    expect(log!.events.filter((e) => e.kind === "match" && e !== event && (e as MatchEvent).study)).toHaveLength(0);

    // Resigning clears the log.
    await saveService.updateSeat(saveId, seatId, { managerEarnings: 1_000_000_000, managerSpent: 0 });
    const handler = apiRoutes["/api/saves/:saveId/job-resign"] as (r: Request) => Promise<Response>;
    const resign = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/job-resign`, { method: "POST", headers: { cookie: `fs_session=${token}` } }),
      { params: { saveId } },
    ));
    expect(resign.status).toBe(200);
    expect((await saveService.getSeat(saveId, seatId))!.tacticLog).toBeUndefined();
  }, 600_000);

  test("against another seat: match-setup never tells a plan", async () => {
    const { saveId, seatId, fixture } = await start("seat");
    const oppId = fixture.home === CLUB ? fixture.away : fixture.home;
    await saveService.updateSeat(saveId, seatId, { tacticLog: oldLog(fixture.date) });
    expect((await setup(saveId, seatId)).study).toBeDefined();
    await addSeat(saveId, {
      userId: devAutoLogin(`study-other-${saveId}@test.local`).user.id, clubId: oppId,
      manager: { name: "Other", nationalityIso: "gb", backgroundId: "former-player" },
    });
    const body = await setup(saveId, seatId);
    expect(body.seatOpponent).toBe(true);
    expect(body.study).toBeUndefined();
  }, 600_000);
});
