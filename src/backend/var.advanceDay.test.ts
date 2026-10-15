/**
 * The manager's cards for complaining in the day pipeline (`.claude/rules/game/var.md` §4): a recorded red starts a
 * ban (board down, inbox), the club's next official match serves it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { soloMeta, soloRecording } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { addDays } from "@/Domain/dates";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { Fixture } from "@/types/calendarTypes";

const HUMAN = "33";

describe("manager complaint cards in advanceOneDay", () => {
  let saveId = "";
  let fixtures: Fixture[] = [];
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const all = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    fixtures = all
      .filter((f) => !f.played && (f.home === HUMAN || f.away === HUMAN) && f.date > addDays(meta.currentDate!, 3))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 2);
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("a red card bans the manager for one match, served by the next official match", async () => {
    const [first, second] = fixtures as [Fixture, Fixture];
    await saveService.updateMeta(saveId, { currentDate: first.date });
    const boardBefore = (await soloMeta(saveId))!.board!.board;
    const recording: PlayedMatchRecording = {
      fixtureId: first.id, score: { home: 0, away: 0 },
      teamStats: { home: {} as never, away: {} as never },
      playerStats: {}, playerRatings: {}, playerEnergy: {},
      substitutions: [], durationMs: 1,
      managerCards: [{ card: "yellow", minute: 30, complaint: 1 }, { card: "red", minute: 60, complaint: 2 }],
      complaintMorale: true,
    };
    const out = await advanceOneDay(saveService, saveId, await soloRecording(saveId, recording));
    expect(out.ok).toBe(true);
    const meta = (await soloMeta(saveId))!;
    expect(meta.managerBan).toMatchObject({ matches: 1, since: first.date });
    // A draw moves the board a little; the two cards cost 4.
    expect(meta.board!.board).toBeLessThan(boardBefore - 2.5);
    const inbox = await saveService.getInbox(saveId, meta.seatId);
    expect(inbox.some((m) => m.category === "discipline" && m.kind === "manager_banned" && m.matches === 1)).toBe(true);

    await saveService.updateMeta(saveId, { currentDate: second.date });
    const next = await advanceOneDay(saveService, saveId);
    expect(next.ok).toBe(true);
    expect((await soloMeta(saveId))!.managerBan).toBeUndefined();
  }, 300_000);
});
