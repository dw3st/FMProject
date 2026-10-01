import { describe, expect, test } from "bun:test";
import {
  buildWorldLevels, expireOffers, generateReborn, levelPercentile, processRetirements, rebornDpMult,
  retireChance, retires,
} from "@/Domain/retirement/retirement";
import { lineAverage } from "@/Domain/youth/youth";
import { roleOf } from "@/Domain/contracts/freeAgents";
import { overallAvg } from "@/Domain/playerRating";
import type { FreeAgent, RetiredPlayer, RosterPlayer, Squad } from "@/types/playerTypes";

function mk(id: string, pos: string, level: number, age = 26): RosterPlayer {
  const v = Math.round(level);
  return {
    id, name: `P ${id}`, age, squadId: "s1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
      pressing: v, stamina: v, heading: v, strength: v, reflex: pos === "GK" ? v : 0, jump: pos === "GK" ? v : 0,
    },
    profile: { summary: "s", archetype: "a" },
  };
}
function squad(players: RosterPlayer[]): Squad {
  return {
    id: "s1", name: "S", colors: ["#000", "#fff"], money: 0, country: "England", players,
    finances: { broadcasting: 50e6, commercial: 50e6, total: 100e6, budget: 0, followers: 1e6 },
  } as Squad;
}

describe("retireChance", () => {
  test("zero below 34, one from 40", () => {
    expect(retireChance(33, 0)).toBe(0);
    expect(retireChance(40, 1)).toBe(1);
    expect(retireChance(45, 1)).toBe(1);
  });
  test("age base at the median-ish level and level scaling", () => {
    expect(retireChance(34, 0)).toBeCloseTo(0.13, 5); // 0.10 x 1.3
    expect(retireChance(34, 1)).toBeCloseTo(0.07, 5); // 0.10 x 0.7
    expect(retireChance(37, 0.5)).toBeCloseTo(0.65, 5); // x 1.0
    expect(retireChance(39, 0)).toBe(1); // 1.0 x 1.3 clamped
    expect(retireChance(36, 0)).toBeGreaterThan(retireChance(36, 1));
  });
  test("deterministic draw", () => {
    expect(retires("a", "p", 2027, 36, 0.4)).toBe(retires("a", "p", 2027, 36, 0.4));
    let n = 0;
    for (let i = 0; i < 400; i++) if (retires("a", `p${i}`, 2027, 36, 0.5)) n++;
    expect(n / 400).toBeGreaterThan(0.3);
    expect(n / 400).toBeLessThan(0.6);
  });
});

describe("processRetirements", () => {
  const players = [
    ...Array.from({ length: 60 }, (_, i) => mk(`y${i}`, "CM", 5, 27)),
    mk("star", "ST", 9, 38), mk("old", "CB", 3, 41), mk("ok", "CB", 5, 30),
  ];
  const sq = squad(players);
  const levels = buildWorldLevels([sq]);

  test("age >= 40 retires, young stay; star in the top is world class with a pending offer", () => {
    const free: FreeAgent[] = [
      { player: mk("fa-old", "CM", 4, 40), since: "2027-01-01" },
      { player: mk("fa-young", "CM", 4, 25), since: "2027-01-01" },
    ];
    const r = processRetirements({
      saveId: "s", year: 2027, date: "2027-06-01", squads: [sq], freeAgents: free, levels, humanSquadId: "s1",
    });
    expect(r.squads[0]!.players.some((p) => p.id === "old")).toBe(false);
    expect(r.squads[0]!.players.some((p) => p.id === "ok")).toBe(true);
    expect(r.freeAgents.map((f) => f.player.id)).toEqual(["fa-young"]);
    expect(r.retired.map((x) => x.id)).toContain("fa-old");
    expect(r.humanRetired.map((x) => x.id)).toContain("old");
    const old = r.humanRetired.find((x) => x.id === "old")!;
    expect(old.wasWorldClass).toBe(false);
    expect(old.rebornOffer).toBeUndefined();
  });

  test("world-class selection: top-50 retiree of the human club gets a pending offer", () => {
    const sq2 = squad([...players.slice(0, 10), mk("star", "ST", 9, 41)]);
    const r = processRetirements({
      saveId: "s", year: 2027, date: "d", squads: [sq2], freeAgents: [], levels: buildWorldLevels([sq2]), humanSquadId: "s1",
    });
    const rec = r.humanRetired.find((x) => x.id === "star")!;
    expect(rec.wasWorldClass).toBe(true);
    expect(rec.rebornOffer).toBe("pending");
    // AI club retirees never get an offer.
    const ai = processRetirements({
      saveId: "s", year: 2027, date: "d", squads: [sq2], freeAgents: [], levels: buildWorldLevels([sq2]), humanSquadId: null,
    });
    expect(ai.retired.find((x) => x.id === "star")!.rebornOffer).toBeUndefined();
  });

  test("percentile bounds and expireOffers", () => {
    expect(levelPercentile([1, 2, 3, 4], 0)).toBe(0);
    expect(levelPercentile([1, 2, 3, 4], 10)).toBe(1);
    const rec = { id: "x", rebornOffer: "pending" } as RetiredPlayer;
    expect(expireOffers([rec, { ...rec, id: "y", rebornOffer: "accepted" }]).map((r) => r.rebornOffer))
      .toEqual(["expired", "accepted"]);
  });
});

describe("generateReborn", () => {
  const retired: RetiredPlayer = {
    id: "star", name: "Old Star", nationality: "Brazil", positions: ["ST"], preferredFoot: "left",
    profile: { summary: "x", archetype: "Poacher" }, retiredOn: "2027-06-01", squadId: "s1", age: 39,
    wasWorldClass: true, appearances: 30, goals: 20, rebornOffer: "pending",
    statsAtRetirement: {
      passing: 6, vision: 7, finishing: 10, dribbling: 8, speed: 5, acceleration: 6, tackling: 2,
      pressing: 3, stamina: 5, heading: 9, strength: 7, reflex: 0, jump: 0,
    } as any,
  };
  const sq = squad(Array.from({ length: 24 }, (_, i) => mk(`p${i}`, i < 3 ? "GK" : i < 10 ? "CB" : i < 17 ? "CM" : "ST", 6)));

  test("17 years old, new id, identity and shape preserved, level near promise", () => {
    const p = generateReborn({ retired, squad: sq, year: 2027, nextSeasonEnd: "2028-05-31" });
    expect(p.age).toBe(17);
    expect(p.id).toBe("reborn_star_2027");
    expect(p.name).toBe("Old Star");
    expect(p.nationality).toBe("Brazil");
    expect(p.positions).toEqual(["ST"]);
    expect(p.preferredFoot).toBe("left");
    expect(p.reborn).toEqual({ fromId: "star", until: 2033 });
    expect(p.contract?.wage).toBeGreaterThan(0);
    const target = lineAverage(sq, roleOf(p)) - 0.8;
    expect(Math.abs(overallAvg(p) - target)).toBeLessThan(0.5);
    // Relative shape: finishing stays above tackling.
    expect(p.stats.finishing).toBeGreaterThan(p.stats.tackling);
  });

  test("DP multiplier only while young", () => {
    const p = generateReborn({ retired, squad: sq, year: 2027, nextSeasonEnd: "2028-05-31" });
    expect(rebornDpMult(p)).toBe(1.3);
    expect(rebornDpMult({ ...p, age: 23 })).toBe(1);
    expect(rebornDpMult(mk("n", "CM", 5))).toBe(1);
  });
});
