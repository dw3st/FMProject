import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";

/**
 * Board and fans in the day pipeline (`.claude/rules/game/board-fans.md`): the objective is set at
 * creation and again at the rollover; a board forced to the floor sacks the manager only when the
 * new-game option allows it, and a sacked career no longer advances.
 */
describe("board and fans in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });

  const create = async (sackingEnabled?: boolean) => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
      ...(sackingEnabled === undefined ? {} : { sackingEnabled }),
    });
    created.push(meta.id);
    return meta;
  };

  test("sacking enabled by default: a board at the floor sacks and ends the career", async () => {
    const meta = await create();
    expect(meta.sackingEnabled).toBe(true);
    expect(meta.board).toMatchObject({ board: 60, fans: 60 });
    expect(meta.board?.objective?.leagueSlug).toBe("premier_league");
    expect(meta.board?.objective?.leagueSize).toBe(20);

    await saveService.updateMeta(meta.id, { board: { ...meta.board!, board: 5 } });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.payload.sacked).toBe(true);

    const after = (await saveService.getMeta(meta.id))!;
    expect(after.ended).toMatchObject({ reason: "board", clubName: "Test", date: meta.currentDate });
    const inbox = await saveService.getInbox(meta.id);
    expect(inbox.some((m) => m.category === "board" && m.kind === "sacked")).toBe(true);

    const again = await advanceOneDay(saveService, meta.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.status).toBe(409);
  }, 120_000);

  test("sacking disabled: never sacked, no ultimatum; the rollover sets a new objective", async () => {
    const meta = await create(false);
    expect(meta.sackingEnabled).toBe(false);
    await saveService.updateMeta(meta.id, { board: { ...meta.board!, board: 0, fans: 0 } });
    const today = meta.currentDate!;
    const active = (meta.activeLeagues ?? []).map((l) =>
      l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l);
    await saveService.updateMeta(meta.id, { activeLeagues: active });

    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.payload.sacked).toBeUndefined();

    const after = (await saveService.getMeta(meta.id))!;
    expect(after.ended).toBeUndefined();
    const b = after.board!;
    expect(b.ultimatum).toBeUndefined();
    expect(b.board).toBeGreaterThanOrEqual(0);
    expect(b.board).toBeLessThanOrEqual(100);
    expect(b.objective?.season).not.toBe(meta.board?.objective?.season);
    expect(b.history.at(-1)?.date).toBe(today);
    const inbox = await saveService.getInbox(meta.id);
    expect(inbox.some((m) => m.category === "board" && m.kind === "objective")).toBe(true);
    // The round-1 result decides the title/position bonus of this forced one-game season.
    if (b.board < 35) expect(inbox.some((m) => m.category === "board" && m.kind === "warning")).toBe(true);
  }, 180_000);
});
