/** The director's friendlies in the day pipeline (`.claude/rules/game/responsibilities.md` → "Amistosos"). */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { advanceOneDay } from "@/backend/advanceDay";
import { saveService } from "@/backend/SaveService";
import { soloMeta, updateSolo } from "@/backend/testing/seatFixtures";
import type { FriendlyInboxMessage } from "@/types/inboxTypes";
import type { Squad } from "@/types/playerTypes";

const HUMAN = "33";
/** A Saturday two weeks before the Premier League opens. */
const SAT = "2026-08-01";

describe("friendlies in advanceOneDay", () => {
  let saveId = "";
  let seatId = "";
  const inbox = async () => (await saveService.getInbox(saveId, seatId)).filter((m) => m.category === "friendly") as FriendlyInboxMessage[];

  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    seatId = (await soloMeta(saveId))!.seatId;
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("nobody arranges friendlies by default", async () => {
    await saveService.updateMeta(saveId, { currentDate: SAT });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    expect(await inbox()).toHaveLength(0);
  }, 180_000);

  test("the director's friendly moves only the human squad and counts for nothing", async () => {
    await updateSolo(saveId, { responsibilities: { contracts: "director", friendlies: "director" } });
    await saveService.updateMeta(saveId, { currentDate: SAT });
    const before = (await saveService.getSquadById(saveId, HUMAN))!;
    const rivalsBefore = new Map<string, Squad>();
    const index = await saveService.getSquadIndex(saveId);
    for (const t of index.inLeague("premier_league")) {
      if (t.squadId !== HUMAN) rivalsBefore.set(t.squadId, (await saveService.getSquadById(saveId, t.squadId))!);
    }

    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);

    const [msg] = await inbox();
    expect(msg).toBeDefined();
    expect(rivalsBefore.has(msg!.opponentId)).toBe(true);
    expect(msg!.players.reduce((n, s) => n + s.goals, 0)).toBeLessThanOrEqual(msg!.goalsFor);
    expect(msg!.clubName).toBeTruthy();
    expect(msg!.players).toHaveLength(16);
    expect(msg!.players.filter((p) => p.sub)).toHaveLength(5);

    const after = (await saveService.getSquadById(saveId, HUMAN))!;
    const played = after.players.filter((p, i) => p.seasonLog?.load !== before.players[i]?.seasonLog?.load && (p.seasonLog?.load ?? 0) >= 80);
    expect(played.length).toBe(11);
    for (const p of after.players) {
      expect(p.seasonLog?.appearances ?? 0).toBe(0);
      expect(p.seasonLog?.youthCup).toBeUndefined();
    }
    const rival = (await saveService.getSquadById(saveId, msg!.opponentId))!;
    const rivalBefore = rivalsBefore.get(msg!.opponentId)!;
    expect(rival.players.map((p) => p.seasonLog?.load ?? 0)).toEqual(rivalBefore.players.map((p) => p.seasonLog?.load ?? 0));

    const log = (await saveService.getDayLog(saveId, SAT))!;
    expect(log.events.some((e) => e.kind === "match" && (e.home === HUMAN || e.away === HUMAN))).toBe(false);
  }, 180_000);
});
