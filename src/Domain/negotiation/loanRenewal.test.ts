import { describe, expect, test } from "bun:test";
import {
  inboundRenewalTerms, liveLoanRenewals, loanRenewalOffer, outboundRenewalWanted, renewalDue, renewedLoan, renewedUntil,
} from "@/Domain/negotiation/loanRenewal";
import { emptySeasonLog } from "@/types/playerTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { ActiveLoan, SquadMarketProfile } from "@/types/transferMarketTypes";

function stats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v, decisions: v, composure: v, flair: v, anticipation: v,
  };
}
function player(id: string, pos: string, age = 26, v = 5): RosterPlayer {
  return {
    id, name: id, age, squadId: "c", preferredFoot: "right", positions: [pos], stats: stats(v),
    profile: { summary: "", archetype: "t" }, contract: { until: "2029-05-31", wage: 10_000 },
  };
}
function squad(id: string, extra: RosterPlayer[] = []): Squad {
  const mk = (n: number, pos: string) => Array.from({ length: n }, (_, i) => player(`${id}${pos}${i}`, pos));
  return {
    id, name: `Club ${id}`, colors: ["#fff", "#000"], money: 0, financialTier: "HIGH",
    players: [...mk(3, "GK"), ...mk(9, "CB"), ...mk(9, "CM"), ...mk(5, "ST"), ...extra],
    finances: { broadcasting: 100_000_000, commercial: 50_000_000, total: 150_000_000, budget: 0, followers: 1_000_000 },
    wageFactor: 1, wageRevenueBasis: 150_000_000,
  };
}
const loan = { until: "2027-05-31", wageShare: 0.8, fee: 0, toClubId: "b", toClubName: "Club b" } as ActiveLoan;

describe("when the offer comes", () => {
  test("within 14 days before the return, once", () => {
    expect(renewalDue(loan, "2027-05-16")).toBe(false);
    expect(renewalDue(loan, "2027-05-17")).toBe(true);
    expect(renewalDue(loan, "2027-05-30")).toBe(true);
    expect(renewalDue(loan, "2027-05-31")).toBe(false);
    expect(renewalDue({ ...loan, renewalOffered: true }, "2027-05-20")).toBe(false);
  });
  test("one season more, never past the contract, none when the contract ends", () => {
    expect(renewedUntil(loan, "2029-05-31")).toBe("2028-05-31");
    expect(renewedUntil(loan, "2027-12-31")).toBe("2027-12-31");
    expect(renewedUntil(loan, "2027-06-30")).toBeNull();
    expect(renewedUntil(loan, undefined)).toBeNull();
  });
  test("the offer answers until the day before; only live offers of running loans count", () => {
    const o = loanRenewalOffer({ id: "x", direction: "in", player: { id: "p", name: "P" }, club: { id: "a", name: "A" },
      date: "2027-05-20", loanUntil: "2027-05-31", until: "2028-05-31", wageShare: 1, fee: 0 });
    expect(o.expires).toBe("2027-05-30");
    expect(liveLoanRenewals([o], [{ ...loan, playerId: "p" }], "2027-05-30")).toHaveLength(1);
    expect(liveLoanRenewals([o], [{ ...loan, playerId: "p" }], "2027-05-31")).toHaveLength(0);
    expect(liveLoanRenewals([o], [], "2027-05-21")).toHaveLength(0);
    expect(renewedLoan(loan, o)).toMatchObject({ until: "2028-05-31", wageShare: 1, fee: 0 });
  });
});

describe("loan in: the parent's terms", () => {
  const young = { ...player("y", "CM", 20), loan: { fromClubId: "a", fromClubName: "A", until: "2027-05-31", wageShare: 1 } };
  test("a young bench player: the old terms or what the parent accepts", () => {
    const t = inboundRenewalTerms({ player: young, parent: squad("a"), loan: { ...loan, wageShare: 1 }, until: "2028-05-31", starterIds: new Set(), listed: false });
    expect(t).not.toBeNull();
    expect(t!.wageShare).toBeGreaterThan(0);
  });
  test("a starter the parent needs back: no offer", () => {
    expect(inboundRenewalTerms({ player: young, parent: squad("a"), loan, until: "2028-05-31", starterIds: new Set(["y"]), listed: false })).toBeNull();
  });
  test("below the old share, the parent asks more", () => {
    const strong = { ...young, stats: stats(8) };
    const t = inboundRenewalTerms({ player: strong, parent: squad("a"), loan: { ...loan, wageShare: 0 }, until: "2028-05-31", starterIds: new Set(), listed: false });
    expect(t!.wageShare + t!.fee).toBeGreaterThan(0);
  });
});

describe("loan out: the borrower asks to keep him", () => {
  const need: SquadMarketProfile = {
    squadId: "b", lastUpdateDay: "", sellList: [],
    needs: [{ position: "Midfielder", targetMin: 0, targetMax: 10, urgency: 1, budgetTier: "high", intentType: "cover_need" }],
  };
  const lent = (apps: number, rating = 0) => ({
    ...player("m", "CM"), seasonLog: { ...emptySeasonLog(), appearances: apps, ...(rating ? { avgRating: rating } : {}) },
  });
  const borrowerWith = (p: RosterPlayer) => {
    const s = squad("b", [p]);
    return { ...s, players: s.players.map((x) => (x.id === "bCM0" ? { ...x, seasonLog: { ...emptySeasonLog(), appearances: 30 } } : x)) };
  };
  const ask = (p: RosterPlayer, profile: SquadMarketProfile | undefined = need, starters = new Set<string>()) =>
    outboundRenewalWanted({ player: p, borrower: borrowerWith(p), loan, profile, starterIds: starters, parentWageFactor: 1 });
  test("played 40% of its matches, or a starter: yes", () => {
    expect(ask(lent(12))).toBe(true);
    expect(ask(lent(2), need, new Set(["m"]))).toBe(true);
    expect(ask(lent(6, 7.2))).toBe(true);
  });
  test("barely played: no; no need in his line: no", () => {
    expect(ask(lent(5))).toBe(false);
    expect(ask(lent(20), { ...need, needs: [{ ...need.needs[0]!, position: "Forward" }] })).toBe(false);
    expect(ask(lent(20), { ...need, needs: [] })).toBe(false);
  });
});
