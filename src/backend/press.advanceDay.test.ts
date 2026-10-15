import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, payloadForSeat } from "@/backend/advanceDay";
import { buildConference } from "@/Domain/press/questions";
import { addDays } from "@/Domain/dates";
import type { Fixture } from "@/types/calendarTypes";

/** Press conferences in the day pipeline (`.claude/rules/game/press.md`, Etapa 42). */
describe("press in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });
  const create = async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    return meta;
  };

  test("an expired conference is ignored: board −1, history and news", async () => {
    const meta = await create();
    const today = meta.currentDate!;
    const pending = buildConference({
      id: "press-x", trigger: "derby", kind: "pre", date: today, expires: today,
      params: { opponent: "Rival" }, seed: "s",
    });
    await saveService.updateSeat(meta.id, meta.seatId, { press: { pending, winless: 0, promises: [], history: [] } });
    const before = meta.board!.board;
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    const after = await saveService.getSeatMeta(meta.id, meta.seatId);
    expect(after!.press!.pending?.id).not.toBe("press-x");
    expect(after!.press!.history[0]).toMatchObject({ id: "press-x", answers: "ignored" });
    // The day's match also moves the board; the exact −1 is checked on `pressDay` alone (pressWorld.test.ts).
    expect(after!.board!.board).toBeLessThan(before + 1);
    const month = await saveService.getNewsMonth(meta.id, today.slice(0, 7));
    expect(month.some((n) => n.kind === "press_absent")).toBe(true);
  }, 180_000);

  test("a pending conference keeps its invite through the player's rollover (clearInbox)", async () => {
    const meta = await create();
    const today = meta.currentDate!;
    const pending = buildConference({
      id: "press-keep", trigger: "heavy_defeat", kind: "post", date: today, expires: addDays(today, 5),
      params: { opponent: "Rival", score: "0–4" }, seed: "s",
    });
    await saveService.updateSeat(meta.id, meta.seatId, { press: { pending, winless: 0, promises: [], history: [] } });
    const active = (meta.activeLeagues ?? []).map((l) =>
      l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l);
    await saveService.updateMeta(meta.id, { activeLeagues: active });

    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    if (out.ok) expect(payloadForSeat(out, meta.seatId).seasonEnded).toBe(true);
    const after = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    const pendingId = after.press?.pending?.id;
    expect(pendingId).toBeDefined();
    // A title closes the pending one and opens a new conference; either way the pending one has its invite.
    const inbox = await saveService.getInbox(meta.id, meta.seatId);
    const invites = inbox.filter((x) => x.category === "press");
    expect(invites.some((x) => x.category === "press" && x.pressId === pendingId)).toBe(true);
    if (pendingId === "press-keep") expect(invites.find((x) => x.category === "press" && x.pressId === "press-keep")!.id).toBe("press-keep");
  }, 180_000);

  test("a pre-match invite for a derby, two days before", async () => {
    const meta = await create();
    const start = meta.currentDate!;
    // The club's next league game at least two days ahead (date-index + round files).
    const index = (await saveService.getDateIndex(meta.id, "premier_league")) ?? {};
    let next: Fixture | undefined;
    for (const date of Object.keys(index).filter((d) => d >= addDays(start, 2)).sort()) {
      for (const r of index[date] ?? []) {
        const round = await saveService.getRound(meta.id, "premier_league", r);
        next = round?.fixtures.find((f) => f.date === date && !f.played && (f.home === "33" || f.away === "33"));
        if (next) break;
      }
      if (next) break;
    }
    expect(next).toBeDefined();
    // Force the derby: the opponent plays in the club's city.
    const oppId = next!.home === "33" ? next!.away : next!.home;
    const me = await saveService.getSquadById(meta.id, "33");
    const opp = await saveService.getSquadById(meta.id, oppId);
    await saveService.saveSquadById(meta.id, { ...opp!, venue: { ...opp!.venue!, city: me!.venue!.city } });

    const target = addDays(next!.date, -2);
    let date = start;
    while (date < target) {
      const r = await advanceOneDay(saveService, meta.id);
      expect(r.ok).toBe(true);
      date = (await saveService.getMeta(meta.id))!.currentDate!;
    }
    // Earlier conferences (pending or within the 7-day gap) would hold this one back.
    await saveService.updateSeat(meta.id, meta.seatId, { press: undefined });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    const m = await saveService.getSeatMeta(meta.id, meta.seatId);
    expect(m!.press?.pending?.trigger).toBe("derby");
    expect(m!.press?.pending?.fixtureId).toBe(next!.id);
    expect(m!.press?.pending?.expires).toBe(addDays(next!.date, -1));
    expect(m!.press?.pending?.date).toBe(addDays(next!.date, -1));
    if (out.ok) expect(payloadForSeat(out, meta.seatId).pressInvite).toBe(true);
    const inbox = await saveService.getInbox(meta.id, meta.seatId);
    expect(inbox.some((x) => x.category === "press")).toBe(true);
  }, 600_000);
});
