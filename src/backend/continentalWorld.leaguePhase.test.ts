import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { applyRandomStartKit } from "@/backend/startKits";
import { continentalClubIds, inContinental } from "@/Domain/continental/competitions";
import { BRACKET_ORDER } from "@/Domain/continental/leaguePhase";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { ContinentalInboxMessage } from "@/types/inboxTypes";

/** A legible, deterministic result: the club with the smaller id string wins 2-1. */
function played(f: Fixture): Fixture {
  const homeWins = f.home.localeCompare(f.away, undefined, { numeric: true }) < 0;
  return { ...f, played: true, result: homeWins ? { home: 2, away: 1 } : { home: 1, away: 2 } };
}

async function playRoundByHand(saveId: string, slug: string, round: number): Promise<void> {
  const r = (await saveService.getRound(saveId, slug, round))!;
  await saveService.writeRound(saveId, slug, round, { ...r, fixtures: r.fixtures.map(played) });
}

describe("Champions League league phase in a real career (12.13)", () => {
  let saveId = "";
  let seatId = "";
  let myClub = "";
  let slug = "";

  beforeAll(async () => {
    // A Premier League club in the UCL or UEL: probe, then create the career owned by it.
    const probe = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Probe", clubColors: ["#000000", "#ffffff"],
    });
    try {
      const index = await saveService.getSquadIndex(probe.id);
      const pl = new Set(index.inLeague("premier_league").map((t) => t.squadId));
      const ucl = (await saveService.getLeagueMeta(probe.id, "ucl"))!.continental!;
      myClub = continentalClubIds(ucl).find((id) => pl.has(id))!;
    } finally {
      await saveService.deleteSave(probe.id);
    }
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: myClub, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    seatId = meta.seatId;
    slug = "ucl";
    expect(inContinental((await saveService.getLeagueMeta(saveId, slug))!.continental!, myClub)).toBe(true);
  }, 300_000);

  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the last league round draws the play-off from the table; the play-off's second leg draws the r16 from the bracket", async () => {
    for (let r = 1; r <= 7; r++) await playRoundByHand(saveId, slug, r);
    const before = (await saveService.getLeagueMeta(saveId, slug))!;
    const leagueStage = before.continental!.stages.find((s) => s.name === "league")!;
    await saveService.updateMeta(saveId, { currentDate: leagueStage.dates[7]! });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);

    let meta: LeagueSeasonMeta = (await saveService.getLeagueMeta(saveId, slug))!;
    const cont = meta.continental!;
    const seeds = cont.seeds!;
    expect(Object.keys(seeds).length).toBe(36);
    expect(new Set(Object.values(seeds)).size).toBe(36);
    expect(cont.stages.find((s) => s.name === "playoff")!.drawn).toBe(true);
    const byPos = Object.fromEntries(Object.entries(seeds).map(([id, p]) => [p, id]));

    // Play-off: 9th–24th, 16 clubs in 8 ties; the better placed hosts the second leg.
    const leg1 = (await saveService.getRound(saveId, slug, 9))!.fixtures;
    expect(leg1.length).toBe(8);
    const inPlayoff = leg1.flatMap((f) => [f.home, f.away]).map((id) => seeds[id]!).sort((a, b) => a - b);
    expect(inPlayoff).toEqual(Array.from({ length: 16 }, (_, i) => i + 9));
    for (const f of leg1) expect(seeds[f.away]!).toBeLessThan(seeds[f.home]!);

    // The human club's news of the day: top 8, play-off draw, or out with its position.
    const pos = seeds[myClub]!;
    const inbox = await saveService.getInbox(saveId, seatId);
    const msgs = inbox.filter((m): m is ContinentalInboxMessage => m.category === "continental" && m.competition === slug);
    if (pos <= 8) expect(msgs.find((m) => m.kind === "top8")?.position).toBe(pos);
    else if (pos <= 24) expect(msgs.find((m) => m.kind === "draw")?.stage).toBe("playoff");
    else {
      const out = msgs.find((m) => m.kind === "eliminated");
      expect(out?.stage).toBe("league");
      expect(out?.position).toBe(pos);
    }

    // Play-off leg 1 by hand, leg 2 by the day advance.
    await playRoundByHand(saveId, slug, 9);
    const playoff = cont.stages.find((s) => s.name === "playoff")!;
    await saveService.updateMeta(saveId, { currentDate: playoff.dates[1]! });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);

    meta = (await saveService.getLeagueMeta(saveId, slug))!;
    expect(meta.continental!.stages.find((s) => s.name === "r16")!.drawn).toBe(true);
    const r16 = (await saveService.getRound(saveId, slug, 11))!.fixtures;
    expect(r16.length).toBe(8);
    // Every top-8 club is in the r16, hosting the second leg; slots follow the fixed bracket order.
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const tie = r16.find((f) => f.away === byPos[p]);
      expect(tie, `seed ${p} in the r16`).toBeTruthy();
      expect(seeds[tie!.home]!).toBeGreaterThan(8);
      expect(seeds[tie!.home]!).toBeLessThanOrEqual(24);
    }
    expect(r16.map((f) => seeds[f.away])).toEqual([...BRACKET_ORDER]);
  }, 600_000);
});

describe("a group-format continental season (an old start kit) still advances", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("r16 legs of a group-format UCL draw the quarter-finals", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "brazil_serie_a", leagueName: "Brasileirão",
      clubId: "1000", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    expect((await applyRandomStartKit(saveId)).applied).toBe(true);
    const ucl = (await saveService.getLeagueMeta(saveId, "ucl"))!;
    if (ucl.continental!.format === "league") {
      // The kits were regenerated in the league format: nothing old to advance here.
      return;
    }
    const r16 = ucl.continental!.stages.find((s) => s.name === "r16")!;
    expect(r16.drawn).toBe(true);
    for (const date of r16.dates) {
      await saveService.updateMeta(saveId, { currentDate: date });
      expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    }
    const after = (await saveService.getLeagueMeta(saveId, "ucl"))!;
    expect(after.continental!.stages.find((s) => s.name === "qf")!.drawn).toBe(true);
    const qf = (await saveService.getRound(saveId, "ucl", after.continental!.stages.find((s) => s.name === "qf")!.rounds[0]!))!;
    expect(qf.fixtures.length).toBe(4);
  }, 600_000);
});
