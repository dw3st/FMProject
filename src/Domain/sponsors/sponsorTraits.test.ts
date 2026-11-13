import { describe, expect, test } from "bun:test";
import { SPONSORS } from "@/Domain/sponsors/sponsorConfig";
import {
  SPONSOR_HISTORY_MAX, acceptOffer, historyOnClubLeft, aiMasterSponsorOf, aiSponsorsOf, creditWeeklyPaid, emptySponsors, evaluateSponsorSeason,
  generateOffers, initialSponsors, negotiateOffer, negotiationChances, negotiationOutcome, offerValue, seasonBooks, traitYears,
  weeklySponsorIncome, type SponsorClubContext, type SponsorSeasonOutcome,
} from "@/Domain/sponsors/sponsors";
import * as legacy from "@/Domain/sponsors/sponsors.v12_0.fixture";
import { SPONSOR_TRAITS, SPONSOR_TRAIT_EFFECTS, SPONSOR_TRAIT_SHARE, sponsorTraitOf, type SponsorTrait } from "@/Domain/sponsors/sponsorTraits";
import type { ClubSponsors, SponsorCompany, SponsorContract, SponsorHistoryEntry, SponsorOffer, SponsorTraitKey } from "@/types/sponsorTypes";

/** `n` invented ids whose derived trait is `trait`. */
function idsWith(trait: SponsorTrait, n: number, prefix = "t"): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) {
    const id = `${prefix}_${trait}_${i}`;
    if (sponsorTraitOf(id) === trait) out.push(id);
    if (i > 100_000) throw new Error(`no id with trait ${trait}`);
  }
  return out;
}

const company = (id: string, size: SponsorCompany["size"] = "national", country = "England"): SponsorCompany => ({
  id, name: `Co ${id}`, sector: "bank", size, colors: ["#000000", "#ffffff"], ...(size === "global" ? {} : { country }),
});

/** A catalog where every company has the same trait: globals, nationals and locals of England. */
const catalogOf = (trait: SponsorTrait): SponsorCompany[] => {
  const ids = idsWith(trait, 60);
  return ids.map((id, i) => company(id, i < 20 ? "global" : i < 40 ? "national" : "local"));
};

const ctx = (over: Partial<SponsorClubContext> = {}): SponsorClubContext => ({
  saveId: "save1", clubId: "33", season: 2026, date: "2026-08-15", country: "England", tier: "MEDIUM",
  base: 10_400_000, appeal: 1, leagueSize: 20, target: 10, continentalTo: 6, promotion: true, cup: true, attendanceAvg: 30_000,
  ...over,
});

const outcome = (over: Partial<SponsorSeasonOutcome> = {}): SponsorSeasonOutcome => ({
  position: 10, leagueSize: 20, relegated: false, promoted: false, continental: false, cupStage: null, followersGrowth: 0,
  attendanceAvg: null, ...over,
});

const contractOf = (companyId: string, over: Partial<SponsorContract> = {}): SponsorContract => ({
  id: `c_${companyId}`, slot: "master", company: { id: companyId, name: `Co ${companyId}`, sector: "bank", size: "national", colors: ["#000000", "#ffffff"] },
  profile: "standard", annual: 5_200_000, bonus: 800_000, goal: { kind: "league_position", max: 10 }, seasonsLeft: 2,
  signedOn: "2026-08-15", ...over,
});

const next = ctx({ season: 2027, date: "2027-05-30" });
const of = (c: SponsorContract): ClubSponsors => ({ contracts: [c], offers: [] });
const [NONE] = idsWith("none", 1);

describe("company traits: the draw", () => {
  test("derived from the id, always the same, every trait reachable; the shares add up to 1", () => {
    expect(sponsorTraitOf("sp_some_company")).toBe(sponsorTraitOf("sp_some_company"));
    for (const t of SPONSOR_TRAITS) expect(idsWith(t, 1)).toHaveLength(1);
    expect(Object.values(SPONSOR_TRAIT_SHARE).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    // The key the screens get is the same union.
    const key: SponsorTraitKey = sponsorTraitOf("x");
    expect(SPONSOR_TRAITS).toContain(key);
  });

  test("the catalog's shares are near the table", () => {
    const n = 20_000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) count[sponsorTraitOf(`sp_probe_${i}`)] = (count[sponsorTraitOf(`sp_probe_${i}`)] ?? 0) + 1;
    for (const t of SPONSOR_TRAITS) expect(Math.abs(count[t]! / n - SPONSOR_TRAIT_SHARE[t])).toBeLessThan(0.02);
  });
});

describe("a company without a trait behaves exactly as before 12.1", () => {
  const catalog = catalogOf("none");

  test("offers: byte-identical for the same seeds", () => {
    for (const tier of ["LOW", "MEDIUM", "HIGH", "ELITE"] as const) {
      for (let i = 0; i < 40; i++) {
        const c = ctx({ clubId: `club${i}`, tier, season: 2026 + (i % 3), appeal: 0.8 + (i % 5) * 0.1 });
        const now = generateOffers(catalog, c, emptySponsors());
        expect(now.length).toBeGreaterThan(0);
        expect(JSON.stringify(now)).toBe(JSON.stringify(legacy.generateOffers(catalog, c, legacy.emptySponsors())));
      }
    }
  });

  test("in a mixed catalog its offers keep every number (the other companies' traits never shift the draws)", () => {
    const mixed = SPONSOR_TRAITS.flatMap((t) => idsWith(t, 12).map((id, i) => company(id, i < 4 ? "global" : i < 8 ? "national" : "local")));
    let plain = 0;
    for (let i = 0; i < 60; i++) {
      const c = ctx({ clubId: `mix${i}`, tier: i % 2 ? "HIGH" : "MEDIUM" });
      const now = generateOffers(mixed, c, emptySponsors());
      const before = legacy.generateOffers(mixed, c, legacy.emptySponsors());
      expect(now.map((o) => [o.id, o.slot, o.profile, o.goal, o.expires])).toEqual(before.map((o) => [o.id, o.slot, o.profile, o.goal, o.expires]));
      now.forEach((o, k) => {
        if (sponsorTraitOf(o.company.id) !== "none") return;
        plain++;
        expect(JSON.stringify(o)).toBe(JSON.stringify(before[k]));
      });
    }
    expect(plain).toBeGreaterThan(50);
  });

  test("negotiation: the same answer and the same table afterwards", () => {
    for (let i = 0; i < 60; i++) {
      const s = initialSponsors(catalog, ctx({ clubId: `n${i}` }));
      for (const o of s.offers) {
        expect(negotiationOutcome(o.id, o.company.id)).toBe(legacy.negotiationOutcome(o.id));
        expect(JSON.stringify(negotiateOffer(s, o.id, "2026-08-20"))).toBe(JSON.stringify(legacy.negotiateOffer(s, o.id, "2026-08-20")));
      }
    }
    expect(negotiationChances("none")).toEqual([SPONSORS.NEGOTIATE.RAISE_CHANCE, SPONSORS.NEGOTIATE.KEEP_CHANCE]);
  });

  test("season review: byte-identical for every kind of season", () => {
    const goals: SponsorContract["goal"][] = [
      { kind: "league_position", max: 10 }, { kind: "continental" }, { kind: "cup_stage", stage: "qf" }, { kind: "promotion" },
      { kind: "followers_growth", pct: 0.03 }, { kind: "attendance", avg: 30_000 },
    ];
    let checked = 0;
    for (const goal of goals) {
      for (const seasonsLeft of [1, 2, 3]) {
        for (const position of [1, 9, 10, 11, 12, 13, 15, 16, 19, null]) {
          for (const relegated of [false, true]) {
            const s: ClubSponsors = {
              contracts: [
                contractOf(NONE!, { goal, seasonsLeft }),
                contractOf(idsWith("none", 2)[1]!, { slot: "board", goal: { kind: "league_position", max: 6 }, seasonsLeft, annual: 600_000, bonus: 90_000 }),
              ],
              offers: [],
            };
            const o = outcome({ position, relegated, cupStage: position === 1 ? "sf" : null, followersGrowth: position === 9 ? 0.05 : 0, attendanceAvg: 31_000 });
            expect(JSON.stringify(evaluateSponsorSeason(s, o, next))).toBe(JSON.stringify(legacy.evaluateSponsorSeason(s, o, next)));
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(360);
  });

  test("the values and the years are the default ones", () => {
    const args = { base: 10_400_000, slot: "master", appeal: 1, profile: "standard", size: "national", noise: 1 } as const;
    expect(offerValue({ ...args, trait: "none" })).toEqual(offerValue(args));
    for (const t of ["impatient", "loyal", "haggler", "proud", "longterm", "shortterm"] as const) expect(offerValue({ ...args, trait: t })).toEqual(offerValue(args));
    expect(traitYears("none", 2)).toBe(2);
  });
});

describe("each trait", () => {
  const args = { base: 10_400_000, slot: "master", appeal: 1, profile: "standard", size: "national", noise: 1 } as const;
  const plain = offerValue(args);

  test("generous: the fixed value × 1.06, the bonus as it is", () => {
    const v = offerValue({ ...args, trait: "generous" });
    expect(v.annual).toBe(Math.round((10_400_000 * 0.5 * 0.95 * 1.06) / 1000) * 1000);
    expect(v.annual / plain.annual).toBeCloseTo(1.06, 2);
    expect(v.bonus).toBe(plain.bonus);
    for (const o of generateOffers(catalogOf("generous"), ctx(), emptySponsors())) {
      const unit = 10_400_000 * SPONSORS.SLOTS[o.slot].share * SPONSORS.SIZE_MULT[o.company.size];
      expect(o.annual / (unit * SPONSORS.PROFILE[o.profile].fixed)).toBeGreaterThan(0.95 * 1.06 - 0.01);
    }
  });

  test("stingy: the fixed value × 0.94 and the bonus × 1.3", () => {
    const v = offerValue({ ...args, trait: "stingy" });
    expect(v.annual / plain.annual).toBeCloseTo(SPONSOR_TRAIT_EFFECTS.STINGY_FIXED, 2);
    expect(v.bonus / plain.bonus).toBeCloseTo(SPONSOR_TRAIT_EFFECTS.STINGY_BONUS, 2);
    const cat = catalogOf("stingy");
    const c = ctx({ clubId: "st" });
    const before = legacy.generateOffers(cat, c, legacy.emptySponsors());
    generateOffers(cat, c, emptySponsors()).forEach((o, i) => {
      expect(o.annual).toBeLessThan(before[i]!.annual);
      expect(o.bonus).toBeGreaterThan(before[i]!.bonus);
      expect(o.years).toBe(before[i]!.years);
    });
  });

  test("impatient: leaves when the position goal is missed by 3 or more", () => {
    const [id] = idsWith("impatient", 1);
    const run = (position: number, seasonsLeft = 3) => evaluateSponsorSeason(of(contractOf(id!, { seasonsLeft })), outcome({ position }), next);
    expect(run(12).sponsors.contracts).toHaveLength(1);
    expect(run(13).sponsors.contracts).toEqual([]);
    expect(run(13).left).toEqual([{ slot: "master", company: contractOf(id!).company, reason: "missed" }]);
    // The default company stays until 6 places off.
    expect(evaluateSponsorSeason(of(contractOf(NONE!, { seasonsLeft: 3 })), outcome({ position: 15 }), next).sponsors.contracts).toHaveLength(1);
    // A goal that is not a position is never "missed by places".
    expect(evaluateSponsorSeason(of(contractOf(id!, { seasonsLeft: 3, goal: { kind: "promotion" } })), outcome({ position: 19 }), next).sponsors.contracts).toHaveLength(1);
    // Met: nothing changes.
    expect(run(4).left).toEqual([]);
  });

  test("loyal: never leaves for a missed goal and always offers to renew; a relegation still ends it", () => {
    const [id] = idsWith("loyal", 1);
    const far = evaluateSponsorSeason(of(contractOf(id!, { seasonsLeft: 3 })), outcome({ position: 20 }), next);
    expect(far.sponsors.contracts).toHaveLength(1);
    expect(far.left).toEqual([]);
    const ended = evaluateSponsorSeason(of(contractOf(id!, { seasonsLeft: 1 })), outcome({ position: 20 }), next);
    expect(ended.left).toEqual([]);
    expect(ended.renewals).toHaveLength(1);
    expect(ended.renewals[0]).toMatchObject({ renewal: true, annual: 4_680_000, bonus: 720_000, years: SPONSORS.YEARS.RENEWAL });
    const met = evaluateSponsorSeason(of(contractOf(id!, { seasonsLeft: 1 })), outcome({ position: 3 }), next);
    expect(met.renewals[0]!.annual).toBe(5_720_000);
    const down = evaluateSponsorSeason(of(contractOf(id!, { seasonsLeft: 3 })), outcome({ position: 20, relegated: true }), next);
    expect(down.sponsors.contracts).toEqual([]);
    expect(down.left[0]!.reason).toBe("relegated");
    expect(down.renewals).toEqual([]);
    // The default company, as far off at the end of its contract, leaves.
    expect(evaluateSponsorSeason(of(contractOf(NONE!, { seasonsLeft: 1 })), outcome({ position: 14 }), next).renewals).toEqual([]);
  });

  test("haggler and proud: the chances of the three answers", () => {
    const share = (trait: "haggler" | "proud") => {
      const [company_] = idsWith(trait, 1);
      const n = 6000;
      const count = { raised: 0, kept: 0, withdrawn: 0 };
      for (let i = 0; i < n; i++) count[negotiationOutcome(`so_master_${trait}_${i}`, company_)]++;
      return { raised: count.raised / n, kept: count.kept / n, withdrawn: count.withdrawn / n };
    };
    const h = share("haggler");
    expect(Math.abs(h.raised - 0.65)).toBeLessThan(0.03);
    expect(Math.abs(h.kept - 0.25)).toBeLessThan(0.03);
    expect(Math.abs(h.withdrawn - 0.1)).toBeLessThan(0.03);
    const p = share("proud");
    expect(Math.abs(p.raised - 0.25)).toBeLessThan(0.03);
    expect(Math.abs(p.kept - 0.3)).toBeLessThan(0.03);
    expect(Math.abs(p.withdrawn - 0.45)).toBeLessThan(0.03);
    expect(negotiationChances("haggler")).toEqual([0.65, 0.25]);
    expect(negotiationChances("proud")).toEqual([0.25, 0.3]);
    // `negotiateOffer` reads the trait from the offer's company.
    const s = initialSponsors(catalogOf("proud"), ctx({ clubId: "pr" }));
    for (const o of s.offers) {
      const r = negotiateOffer(s, o.id, "2026-08-20");
      if (!r.ok) throw new Error("refused");
      expect(r.negotiation).toBe(negotiationOutcome(o.id, o.company.id));
    }
  });

  test("longterm: every offer and renewal for 3 seasons; shortterm: for 1, a demanding profile too", () => {
    let demandingShort = 0;
    for (let i = 0; i < 30; i++) {
      for (const o of generateOffers(catalogOf("longterm"), ctx({ clubId: `lt${i}` }), emptySponsors())) expect(o.years).toBe(3);
      for (const o of generateOffers(catalogOf("shortterm"), ctx({ clubId: `st${i}` }), emptySponsors())) {
        expect(o.years).toBe(1);
        if (o.profile === "demanding") demandingShort++;
      }
    }
    expect(demandingShort).toBeGreaterThan(0);
    const [long] = idsWith("longterm", 1);
    const [short] = idsWith("shortterm", 1);
    expect(evaluateSponsorSeason(of(contractOf(long!, { seasonsLeft: 1 })), outcome({ position: 5 }), next).renewals[0]!.years).toBe(3);
    expect(evaluateSponsorSeason(of(contractOf(short!, { seasonsLeft: 1 })), outcome({ position: 5 }), next).renewals[0]!.years).toBe(1);
    expect(evaluateSponsorSeason(of(contractOf(NONE!, { seasonsLeft: 1 })), outcome({ position: 5 }), next).renewals[0]!.years).toBe(SPONSORS.YEARS.RENEWAL);
  });
});

describe("the contracts' books", () => {
  test("Monday: each contract counts its week; nothing without contracts", () => {
    const empty = emptySponsors();
    expect(creditWeeklyPaid(empty)).toBe(empty);
    const s: ClubSponsors = { contracts: [contractOf("a"), contractOf("b", { slot: "kit", annual: 2_600_000, paid: { fixed: 10, bonus: 5, met: 1, missed: 0 } })], offers: [] };
    const once = creditWeeklyPaid(s);
    expect(once.contracts.map((c) => c.paid)).toEqual([
      { fixed: 100_000, bonus: 0, met: 0, missed: 0 }, { fixed: 50_010, bonus: 5, met: 1, missed: 0 },
    ]);
    // 52 weeks: the season's fixed value (the ledger line rounds the sum, the books each contract).
    let year = s;
    for (let i = 0; i < 52; i++) year = creditWeeklyPaid(year);
    expect(year.contracts[0]!.paid!.fixed).toBe(5_200_000);
    expect(weeklySponsorIncome(s)).toBe(150_000);
    // The contract itself is untouched.
    expect(once.contracts[0]).toMatchObject(contractOf("a"));
  });

  test("season review: goals and bonuses on the contracts that go on, history entries for the ones that ended", () => {
    const [imp] = idsWith("impatient", 1);
    const before: ClubSponsors = {
      contracts: [
        contractOf(NONE!, { seasonsLeft: 2, paid: { fixed: 4_000_000, bonus: 0, met: 0, missed: 0 } }),
        contractOf("kitco", { slot: "kit", seasonsLeft: 1, annual: 2_600_000, bonus: 400_000, paid: { fixed: 2_600_000, bonus: 400_000, met: 1, missed: 0 } }),
        contractOf(imp!, { slot: "board", seasonsLeft: 3, goal: { kind: "league_position", max: 4 }, annual: 600_000, bonus: 90_000 }),
        contractOf("far", { slot: "board", seasonsLeft: 1, goal: { kind: "league_position", max: 3 }, annual: 600_000, bonus: 90_000 }),
      ],
      offers: [],
    };
    const o = outcome({ position: 8 });
    const review = evaluateSponsorSeason(before, o, next);
    const after = seasonBooks(before, review, review.sponsors, o, "2027-05-30");
    // The master met its goal and goes on.
    expect(after.contracts).toHaveLength(1);
    expect(after.contracts[0]!.paid).toEqual({ fixed: 4_000_000, bonus: 800_000, met: 1, missed: 0 });
    expect(after.contracts[0]!.seasonsLeft).toBe(1);
    const entries = after.history!;
    const by = (id: string) => entries.find((h) => h.companyId === id)!;
    // Kit: ended at its last season with the goal met (a renewal offer is on the table: still "expired").
    expect(by("kitco")).toEqual({
      companyId: "kitco", companyName: "Co kitco", slot: "kit", from: "2026-08-15", to: "2027-05-30", seasons: 2,
      fixedPaid: 2_600_000, bonusPaid: 800_000, goalsMet: 2, goalsMissed: 0, end: "expired",
    });
    // The impatient board left with seasons to go; the other one ran to its end and was not renewed.
    expect(by(imp!)).toMatchObject({ end: "left_early", seasons: 1, goalsMissed: 1, bonusPaid: 0 });
    expect(by("far")).toMatchObject({ end: "expired", seasons: 1, goalsMissed: 1 });
    expect(review.renewals.map((r) => r.company.id)).toEqual(["kitco"]);

    // Taking the renewal: that entry becomes "renewed"; the new contract starts its own books.
    const taken = acceptOffer(after, review.renewals[0]!.id, "2027-06-01");
    if (!taken.ok) throw new Error("refused");
    expect(taken.sponsors.history!.find((h) => h.companyId === "kitco")!.end).toBe("renewed");
    expect(taken.sponsors.history!.filter((h) => h.end === "renewed")).toHaveLength(1);
    expect(taken.contract!.paid).toBeUndefined();
  });

  test("relegation: every contract ends as relegated; an offer that is not a renewal never touches the history", () => {
    const before: ClubSponsors = { contracts: [contractOf("a", { seasonsLeft: 3 }), contractOf("b", { slot: "kit", seasonsLeft: 1 })], offers: [] };
    const o = outcome({ position: 19, relegated: true });
    const review = evaluateSponsorSeason(before, o, next);
    const after = seasonBooks(before, review, review.sponsors, o, "2027-05-30");
    expect(after.history!.map((h) => h.end)).toEqual(["relegated", "relegated"]);
    const fresh: SponsorOffer = { id: "f", slot: "kit", company: contractOf("b").company, profile: "safe", annual: 1, bonus: 0, goal: { kind: "promotion" }, years: 1, expires: "2027-07-01" };
    const signed = acceptOffer({ ...after, offers: [fresh] }, "f", "2027-06-01");
    if (!signed.ok) throw new Error("refused");
    expect(signed.sponsors.history).toEqual(after.history);
  });

  test("nothing ended: no history field; the history keeps the newest entries", () => {
    const before = of(contractOf("a", { seasonsLeft: 3 }));
    const o = outcome({ position: 9 });
    const review = evaluateSponsorSeason(before, o, next);
    expect(seasonBooks(before, review, review.sponsors, o, "2027-05-30").history).toBeUndefined();
    const old: SponsorHistoryEntry[] = Array.from({ length: SPONSOR_HISTORY_MAX }, (_, i) => ({
      companyId: `old${i}`, companyName: "Old", slot: "board", from: "2020-01-01", to: "2021-01-01", seasons: 1, fixedPaid: 0, bonusPaid: 0, goalsMet: 0, goalsMissed: 1, end: "expired",
    }));
    const ending = { ...of(contractOf("z", { seasonsLeft: 1 })), history: old };
    const r2 = evaluateSponsorSeason(ending, outcome({ position: 20 }), next);
    const kept = seasonBooks(ending, r2, r2.sponsors, outcome({ position: 20 }), "2027-05-30").history!;
    expect(kept).toHaveLength(SPONSOR_HISTORY_MAX);
    expect(kept.at(-1)!.companyId).toBe("z");
    expect(kept[0]!.companyId).toBe("old1");
  });

  test("the manager leaves: the contracts in force close as club_left after the finished ones", () => {
    const old: SponsorHistoryEntry = {
      companyId: "old", companyName: "Old", slot: "board", from: "2020-01-01", to: "2021-01-01", seasons: 1, fixedPaid: 5, bonusPaid: 0, goalsMet: 0, goalsMissed: 1, end: "expired",
    };
    const c = creditWeeklyPaid(of(contractOf("a", { seasonsLeft: 2 }))).contracts[0]!;
    const out = historyOnClubLeft({ contracts: [c], offers: [], history: [old] }, "2027-03-01");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(old);
    expect(out[1]).toMatchObject({ companyId: "a", slot: c.slot, from: c.signedOn, to: "2027-03-01", end: "club_left", fixedPaid: Math.round(c.annual / 52), seasons: 0 });
    expect(historyOnClubLeft(undefined, "2027-03-01")).toEqual([]);
  });
});

describe("an AI club's master sponsor alone", () => {
  test("the same company `aiSponsorsOf` draws", () => {
    const catalog = SPONSOR_TRAITS.flatMap((t) => idsWith(t, 8, "ai").map((id, i) => company(id, i < 3 ? "global" : i < 6 ? "national" : "local")));
    for (const tier of ["LOW", "MEDIUM", "HIGH", "ELITE"] as const) {
      for (let i = 0; i < 50; i++) {
        const club = { clubId: `club${i}`, season: 2026 + (i % 4), country: i % 3 ? "England" : null, tier };
        expect(aiMasterSponsorOf(catalog, club)).toEqual(aiSponsorsOf(catalog, club).master);
      }
    }
    expect(aiMasterSponsorOf([], { clubId: "x", season: 2026, country: null, tier: "LOW" })).toBeNull();
  });
});
