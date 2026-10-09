/**
 * Registration in the day pipeline (`.claude/rules/game/registration.md`): only registered players play (engine and
 * quickSim), a hand-removed starter is replaced, a live recording with an unregistered player is refused, an AI club
 * with an open window registers a signing after the market, the human club gets its automatic list and news.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { addDays } from "@/Domain/dates";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

const HUMAN = "33";

describe("registration in advanceOneDay", () => {
  let saveId = "";
  let matchDay = "";
  let fixture: Fixture | undefined;
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const all = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    fixture = all
      .filter((f) => !f.played && (f.home === HUMAN || f.away === HUMAN) && f.date > addDays(meta.currentDate!, 3))
      .sort((a, b) => a.date.localeCompare(b.date))[0]!;
    matchDay = fixture.date;
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("the first morning builds the human club's lists and tells the player", async () => {
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const human = (await saveService.getSquadById(saveId, HUMAN))!;
    expect(human.registrations?.premier_league?.ids.length).toBeGreaterThanOrEqual(18);
    const inbox = await saveService.getInbox(saveId);
    expect(inbox.some((m) => m.category === "registration" && m.kind === "auto_list")).toBe(true);
  }, 120_000);

  test("an AI club with its window open registers a signing after the market", async () => {
    const index = await saveService.getSquadIndex(saveId);
    // The career starts on 2026-08-15: the English pre-season window is open.
    const brId = index.inLeague("premier_league").map((t) => t.squadId).find((id) => id !== HUMAN)!;
    const br = (await saveService.getSquadById(saveId, brId))!;
    const star = { ...br.players[0]!, id: "reg_star", overallAvg: 9.9, name: "Reg Star" };
    await saveService.saveSquadById(saveId, { ...br, players: [...br.players, star] });
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const after = (await saveService.getSquadById(saveId, brId))!;
    expect(after.registrations?.premier_league?.ids).toContain("reg_star");
  }, 120_000);

  test("a recording with an unregistered player is refused; the day's match only fields registered players", async () => {
    await saveService.updateMeta(saveId, { currentDate: matchDay });
    const human = (await saveService.getSquadById(saveId, HUMAN))!;
    const list = human.registrations!.premier_league!;
    const outId = [...human.players].sort((a, b) => (b.overallAvg ?? 0) - (a.overallAvg ?? 0)).find((p) => p.age > 21 && list.ids.includes(p.id))!.id;
    const ids = list.ids.filter((id) => id !== outId);
    const next: Squad = { ...human, registrations: { ...human.registrations, premier_league: { ...list, ids, manual: true, out: [outId] } } };
    await saveService.saveSquadById(saveId, next);

    const recording: PlayedMatchRecording = {
      fixtureId: fixture!.id, score: { home: 1, away: 0 },
      teamStats: { home: {} as never, away: {} as never },
      playerStats: { [outId]: {} as never }, playerRatings: {}, playerEnergy: { [outId]: 80 },
      substitutions: [], durationMs: 1,
    };
    const refused = await advanceOneDay(saveService, saveId, recording);
    expect(refused).toMatchObject({ ok: false, status: 400, error: "unregistered player in recording" });

    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const log = (await saveService.getDayLog(saveId, matchDay))!;
    expect(log.registrationViolations).toBe(0);
    const match = log.events.find((e) => e.kind === "match" && (e.home === HUMAN || e.away === HUMAN)) as { playerStats: Record<string, unknown> } | undefined;
    expect(match).toBeDefined();
    expect(Object.keys(match!.playerStats)).not.toContain(outId);
    expect(Object.keys(match!.playerStats).length).toBeGreaterThan(11);
  }, 180_000);
});
