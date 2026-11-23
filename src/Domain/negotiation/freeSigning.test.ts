import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { freeArrivalCtx, freeSigningRivals, freeSigningScore, preferredRival, signingBonusAsk } from "@/Domain/negotiation/freeSigning";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { contractDemand, demandBreakdown, freeWaitMult } from "@/Domain/contracts/contracts";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import type { SquadMarketProfile } from "@/types/transferMarketTypes";

function stats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v, decisions: v, composure: v, flair: v, anticipation: v,
  };
}
function player(id: string, v = 6, pos = "CM", squadId = ""): RosterPlayer {
  return {
    id, name: id, age: 26, squadId, preferredFoot: "right", positions: [pos], stats: stats(v),
    profile: { summary: "", archetype: "t" }, contract: { until: "2027-05-31", wage: 20_000 },
  };
}
function squad(id: string, v = 5): Squad {
  const mk = (n: number, pos: string) => Array.from({ length: n }, (_, i) => player(`${id}${pos}${i}`, v, pos, id));
  return {
    id, name: `Club ${id}`, colors: ["#fff", "#000"], money: 0, financialTier: "HIGH", aiTransferBudget: 500_000_000,
    players: [...mk(3, "GK"), ...mk(7, "CB"), ...mk(7, "CM"), ...mk(4, "ST")],
    finances: { broadcasting: 300_000_000, commercial: 200_000_000, total: 500_000_000, budget: 0, followers: 10_000_000 },
  };
}

describe("signing bonus", () => {
  const p = player("target", 6);
  test("a pre-contract asks a share of the value, more with rivals; a free agent asks none (12.28.5)", () => {
    const value = playerMarketValue(p);
    expect(signingBonusAsk(p, "pre", 0)).toBeGreaterThanOrEqual(value * NEGOTIATION.FREE_SIGNING.BONUS_SHARE_PRE);
    expect(signingBonusAsk(p, "pre", 2)).toBeGreaterThan(signingBonusAsk(p, "pre", 0));
    expect(signingBonusAsk(p, "free", 0)).toBe(0);
    expect(signingBonusAsk(p, "free", 2)).toBe(0);
  });
  test("the wage premium only on a pre-contract", () => {
    const s = squad("h");
    const base = contractDemand(p, s, "2026-10-01");
    expect(contractDemand(p, s, "2026-10-01", freeArrivalCtx("pre"))).toBeGreaterThan(base);
    expect(contractDemand(p, s, "2026-10-01", freeArrivalCtx("free"))).toBe(base);
  });
  test("a free agent asks less the longer he waits, down to −25% at 90 days", () => {
    const s = squad("h");
    const base = contractDemand(p, s, "2026-10-01");
    expect(contractDemand(p, s, "2026-10-01", freeArrivalCtx("free", "2026-10-01"))).toBe(base);
    expect(Math.abs(contractDemand(p, s, "2026-10-01", freeArrivalCtx("free", "2026-08-17")) - base * 0.875)).toBeLessThanOrEqual(1);
    const b = demandBreakdown(p, s, "2026-10-01", freeArrivalCtx("free", "2026-07-03"));
    expect(b.freeDays).toBe(90);
    expect(b.freeWait).toBeCloseTo(0.75);
    expect(Math.abs(contractDemand(p, s, "2026-10-01", freeArrivalCtx("free", "2026-01-01")) - base * 0.75)).toBeLessThanOrEqual(1);
    expect(freeWaitMult(45)).toBeCloseTo(0.875);
  });
});

describe("rivals", () => {
  const target = player("target", 5.4);
  const clubs = ["a", "b", "c", "d"].map((id) => squad(id));
  const need: SquadMarketProfile = {
    squadId: "", lastUpdateDay: "", sellList: [],
    needs: [{ position: "Midfielder", targetMin: 4, targetMax: 7, urgency: 1, budgetTier: "high", intentType: "cover_need" }],
  };
  const profiles = Object.fromEntries(clubs.map((c) => [c.id, { ...need, squadId: c.id }]));
  const args = {
    player: target, kind: "pre" as const, date: "2026-10-07", fromId: null, humanIds: new Set(["a"]), profiles,
    squadOf: (id: string) => clubs.find((c) => c.id === id),
  };

  test("same week, same clubs and offers; never a human club; at most MAX_RIVALS", () => {
    const one = freeSigningRivals(args);
    const two = freeSigningRivals({ ...args, date: "2026-10-09" });
    expect(two).toEqual(one);
    expect(one.length).toBeLessThanOrEqual(NEGOTIATION.FREE_SIGNING.MAX_RIVALS);
    expect(one.some((r) => r.clubId === "a")).toBe(false);
  });

  test("a free agent's rivals offer no bonus", () => {
    for (const r of freeSigningRivals({ ...args, kind: "free" })) expect(r.bonus).toBe(0);
  });

  test("no need for him, no rival", () => {
    expect(freeSigningRivals({ ...args, profiles: {} })).toEqual([]);
  });

  test("the bonus counts in his choice, capped at 1,5 times the ask", () => {
    const pref = { wage: 100, demand: 100, prestige: 0.5, starter: 0.5 };
    expect(freeSigningScore(pref, 200, 100)).toBeGreaterThan(freeSigningScore(pref, 100, 100));
    expect(freeSigningScore(pref, 300, 100)).toBe(freeSigningScore(pref, 150, 100));
    const rival = { clubId: "b", clubName: "Club b", wage: 110, bonus: 110 };
    const rivals = [{ rival, pref: { ...pref, wage: 110 } }];
    expect(preferredRival({ human: { pref, bonus: 100 }, rivals, ask: 100 })).toEqual(rival);
    expect(preferredRival({ human: { pref: { ...pref, wage: 150 }, bonus: 150 }, rivals, ask: 100 })).toBeNull();
  });
});
