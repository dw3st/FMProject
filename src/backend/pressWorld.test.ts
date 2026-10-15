import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { pressDay } from "@/backend/pressWorld";
import { buildConference } from "@/Domain/press/questions";
import { addDays } from "@/Domain/dates";

/** `pressDay` (`.claude/rules/game/press.md`) on a real save, called directly. */
describe("pressDay", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("an expired pending conference is ignored: board exactly −1, history 'ignored', absence news", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const today = meta.currentDate!;
    const pending = buildConference({
      id: "press-old", trigger: "derby", kind: "pre", date: addDays(today, -2), expires: addDays(today, -1),
      params: { opponent: "Rival" }, seed: "s",
    });
    const board = meta.board!;
    const out = await pressDay({
      saveId, seatId: meta.seatId, service: saveService,
      meta: { ...meta, press: { pending, winless: 0, promises: [], history: [] } },
      date: today, clubId: "33", leagueSlug: "premier_league",
      leagueState: meta.activeLeagues?.find((l) => l.leagueSlug === "premier_league"),
      leagueZones: [],
      index: await saveService.getSquadIndex(saveId),
      board,
      myMatches: [], titlesToday: [], eliminatedToday: [],
      matchContext: new Map(),
    });
    expect(out.board.board).toBe(board.board - 1);
    expect(out.board.fans).toBe(board.fans);
    expect(out.press.history[0]).toMatchObject({ id: "press-old", answers: "ignored" });
    expect(out.press.pending?.id).not.toBe("press-old");
    expect(out.news.map((n) => n.kind)).toEqual(["press_absent"]);
  }, 180_000);
});
