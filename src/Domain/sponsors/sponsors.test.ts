import { describe, expect, test } from "bun:test";
import { addDays } from "@/Domain/dates";
import { SPONSORS } from "@/Domain/sponsors/sponsorConfig";
import {
  acceptOffer, aiBoards, aiSponsorsOf, campaignOf, companyEligible, contractBoards, contractMaster, declineOffer, eligibleCompanies,
  emptySponsors, evaluateSponsorSeason, expireOffers, generateOffers, goalMet, goalOptions, goalProgress, initialSponsors,
  negotiateOffer, negotiationOutcome, offerValue, positionMiss, slotFree, sponsorAppeal, weeklyCommercialIncome, weeklySponsorIncome,
  type SponsorClubContext, type SponsorSeasonOutcome,
} from "@/Domain/sponsors/sponsors";
import { buildSponsorMessage, offersBySlot } from "@/Domain/sponsors/sponsorMessages";
import type { ClubSponsors, SponsorCompany, SponsorContract, SponsorOffer } from "@/types/sponsorTypes";

const company = (id: string, size: SponsorCompany["size"], country?: string): SponsorCompany => ({
  id, name: `Co ${id}`, sector: "bank", size, colors: ["#000000", "#ffffff"], ...(country ? { country } : {}),
});

/** 20 companies per size and country: enough for every slot of every kind of club. */
const CATALOG: SponsorCompany[] = [
  ...Array.from({ length: 20 }, (_, i) => company(`g${i}`, "global")),
  ...Array.from({ length: 20 }, (_, i) => company(`ne${i}`, "national", "England")),
  ...Array.from({ length: 20 }, (_, i) => company(`le${i}`, "local", "England")),
  ...Array.from({ length: 20 }, (_, i) => company(`nb${i}`, "national", "Brazil")),
  ...Array.from({ length: 20 }, (_, i) => company(`lb${i}`, "local", "Brazil")),
];

const ctx = (over: Partial<SponsorClubContext> = {}): SponsorClubContext => ({
  saveId: "save1", clubId: "33", season: 2026, date: "2026-08-15", country: "England", tier: "MEDIUM",
  base: 10_400_000, appeal: 1, leagueSize: 20, target: 10, continentalTo: 6, promotion: false, cup: true, attendanceAvg: null,
  ...over,
});

const outcome = (over: Partial<SponsorSeasonOutcome> = {}): SponsorSeasonOutcome => ({
  position: 10, leagueSize: 20, relegated: false, promoted: false, continental: false, cupStage: null, followersGrowth: 0,
  attendanceAvg: null, ...over,
});

const contract = (over: Partial<SponsorContract> = {}): SponsorContract => ({
  id: "c1", slot: "master", company: { id: "g0", name: "Co g0", sector: "bank", size: "global", colors: ["#000000", "#ffffff"] },
  profile: "standard", annual: 5_200_000, bonus: 800_000, goal: { kind: "league_position", max: 10 }, seasonsLeft: 2,
  signedOn: "2026-08-15", ...over,
});

describe("appeal", () => {
  test("an ordinary club is 1; the bounds are 0.7 and 1.3", () => {
    expect(sponsorAppeal({ campaign: 0, heat: null, reputation: 50, stars: 0 })).toBe(1);
    expect(sponsorAppeal({ campaign: 0, heat: "warm", reputation: 50, stars: 0 })).toBe(1);
    const best = sponsorAppeal({ campaign: 1, heat: "hot", reputation: 100, stars: 5 });
    const worst = sponsorAppeal({ campaign: -1, heat: "cold", reputation: 0, stars: 0 });
    expect(best).toBeCloseTo(1.27, 5);
    expect(worst).toBeCloseTo(0.77, 5);
    for (const v of [best, worst, sponsorAppeal({ campaign: 9, heat: "hot", reputation: 900, stars: 99 }), sponsorAppeal({ campaign: -9, heat: "cold", reputation: -900, stars: -3 })]) {
      expect(v).toBeGreaterThanOrEqual(SPONSORS.APPEAL.MIN);
      expect(v).toBeLessThanOrEqual(SPONSORS.APPEAL.MAX);
    }
  });

  test("each part moves it the right way", () => {
    const base = { campaign: 0, heat: null, reputation: 50, stars: 0 } as const;
    expect(sponsorAppeal({ ...base, campaign: 1 })).toBeCloseTo(1.1, 5);
    expect(sponsorAppeal({ ...base, heat: "cold" })).toBeCloseTo(0.92, 5);
    expect(sponsorAppeal({ ...base, reputation: 100 })).toBeCloseTo(1.05, 5);
    expect(sponsorAppeal({ ...base, stars: 3 })).toBeCloseTo(1.04, 5);
    expect(sponsorAppeal({ ...base, stars: 30 })).toBeCloseTo(1.04, 5);
  });

  test("campaign: champion +1, last −1, none 0", () => {
    expect(campaignOf(1, 20)).toBe(1);
    expect(campaignOf(20, 20)).toBe(-1);
    expect(campaignOf(null, 20)).toBe(0);
    expect(campaignOf(1, 1)).toBe(0);
  });
});

describe("companies", () => {
  test("who may offer to whom", () => {
    const g = company("g", "global");
    const n = company("n", "national", "England");
    const l = company("l", "local", "England");
    const low = { tier: "LOW", country: "England" } as const;
    const medium = { tier: "MEDIUM", country: "England" } as const;
    const high = { tier: "HIGH", country: "England" } as const;
    const eliteAbroad = { tier: "ELITE", country: "Spain" } as const;
    const highAbroad = { tier: "HIGH", country: "Spain" } as const;
    expect(companyEligible(g, low, "master")).toBe(false);
    expect(companyEligible(g, medium, "master")).toBe(false);
    expect(companyEligible(g, high, "master")).toBe(true);
    expect(companyEligible(n, low, "master")).toBe(false);
    expect(companyEligible(n, medium, "master")).toBe(true);
    expect(companyEligible(n, highAbroad, "master")).toBe(false);
    expect(companyEligible(n, eliteAbroad, "master")).toBe(true);
    expect(companyEligible(l, low, "master")).toBe(true);
    expect(companyEligible(l, medium, "kit")).toBe(true);
    expect(companyEligible(l, high, "master")).toBe(false);
    expect(companyEligible(l, high, "board")).toBe(true);
    expect(companyEligible(l, highAbroad, "board")).toBe(false);
    // A company without a country fits any.
    expect(companyEligible(company("x", "national"), highAbroad, "master")).toBe(true);
  });

  test("a country without companies falls back to the global and national of anywhere, then to anyone", () => {
    const kenyaLow = { tier: "LOW", country: "Kenya" } as const;
    const pool = eligibleCompanies(CATALOG, kenyaLow, "master", 3);
    expect(pool.length).toBeGreaterThanOrEqual(3);
    expect(pool.every((c) => c.size !== "local")).toBe(true);
    const onlyLocal = [company("a", "local", "Brazil"), company("b", "local", "Brazil")];
    expect(eligibleCompanies(onlyLocal, kenyaLow, "master", 2).map((c) => c.id)).toEqual(["a", "b"]);
    // With enough of its own, nothing else comes in.
    const own = eligibleCompanies(CATALOG, { tier: "LOW", country: "England" }, "master", 3);
    expect(own.every((c) => c.size === "local" && c.country === "England")).toBe(true);
  });
});

describe("offers", () => {
  test("counts per slot: master 3, kit 2, boards 6", () => {
    const offers = generateOffers(CATALOG, ctx(), emptySponsors());
    expect(offers.filter((o) => o.slot === "master")).toHaveLength(3);
    expect(offers.filter((o) => o.slot === "kit")).toHaveLength(2);
    expect(offers.filter((o) => o.slot === "board")).toHaveLength(6);
    expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
    expect(new Set(offers.map((o) => o.company.id)).size).toBe(offers.length);
    for (const o of offers) expect(o.expires).toBe(addDays("2026-08-15", SPONSORS.OFFER_DAYS));
  });

  test("deterministic for the same save, club and season; another season draws again", () => {
    const a = generateOffers(CATALOG, ctx(), emptySponsors());
    const b = generateOffers(CATALOG, ctx(), emptySponsors());
    expect(b).toEqual(a);
    const c = generateOffers(CATALOG, ctx({ season: 2027 }), emptySponsors());
    expect(c.map((o) => o.company.id)).not.toEqual(a.map((o) => o.company.id));
  });

  test("the offers of a slot never all have the same profile, over many clubs", () => {
    for (let i = 0; i < 300; i++) {
      const offers = generateOffers(CATALOG, ctx({ clubId: `club${i}` }), emptySponsors());
      for (const slot of ["master", "kit", "board"] as const) {
        const profiles = new Set(offers.filter((o) => o.slot === slot).map((o) => o.profile));
        expect(profiles.size).toBeGreaterThan(1);
      }
    }
  });

  test("values follow the profile, the slot's share, the appeal and the company's size", () => {
    const v = offerValue({ base: 10_400_000, slot: "master", appeal: 1, profile: "standard", size: "national", noise: 1 });
    expect(v.annual).toBe(4_940_000);
    expect(v.bonus).toBe(780_000);
    expect(offerValue({ base: 10_400_000, slot: "board", appeal: 1, profile: "demanding", size: "national", noise: 1 }).annual).toBe(650_000);
    expect(offerValue({ base: 10_400_000, slot: "kit", appeal: 1.3, profile: "safe", size: "global", noise: 1 }).annual).toBe(3_285_000);
    expect(offerValue({ base: 10_400_000, slot: "kit", appeal: 1, profile: "safe", size: "local", noise: 1 }).annual).toBe(2_106_000);
    // Every generated offer stays inside the profile band × noise × size.
    for (let i = 0; i < 50; i++) {
      for (const o of generateOffers(CATALOG, ctx({ clubId: `v${i}`, tier: "HIGH" }), emptySponsors())) {
        const unit = 10_400_000 * SPONSORS.SLOTS[o.slot].share;
        const ratio = o.annual / (unit * SPONSORS.PROFILE[o.profile].fixed * SPONSORS.SIZE_MULT[o.company.size]);
        expect(ratio).toBeGreaterThan(0.94);
        expect(ratio).toBeLessThan(1.06);
        expect(o.years).toBeGreaterThanOrEqual(o.profile === "demanding" ? 2 : 1);
        expect(o.years).toBeLessThanOrEqual(3);
      }
    }
  });

  test("goals by profile and slot", () => {
    const c = ctx({ attendanceAvg: 40_000, promotion: true });
    expect(goalOptions("master", "safe", c)).toEqual([{ kind: "league_position", max: 13 }]);
    expect(goalOptions("master", "standard", c)).toEqual([{ kind: "league_position", max: 10 }, { kind: "cup_stage", stage: "qf" }]);
    expect(goalOptions("master", "demanding", c)).toEqual([
      { kind: "league_position", max: 7 }, { kind: "continental" }, { kind: "cup_stage", stage: "sf" }, { kind: "promotion" },
    ]);
    expect(goalOptions("board", "standard", c)).toEqual([
      { kind: "league_position", max: 10 }, { kind: "cup_stage", stage: "qf" },
      { kind: "followers_growth", pct: 0.03 }, { kind: "attendance", avg: 36_000 },
    ]);
    // No zone near, no cup, no promotion, no attendance history: only the position (and followers on a board).
    const bare = ctx({ continentalTo: 0, cup: false, target: 18 });
    expect(goalOptions("kit", "demanding", bare)).toEqual([{ kind: "league_position", max: 15 }]);
    expect(goalOptions("board", "demanding", bare)).toEqual([{ kind: "league_position", max: 15 }, { kind: "followers_growth", pct: 0.06 }]);
    expect(goalOptions("master", "demanding", ctx({ target: 11 })).some((g) => g.kind === "continental")).toBe(false);
    expect(goalOptions("master", "safe", ctx({ target: 19 }))).toEqual([{ kind: "league_position", max: 20 }]);
    expect(goalOptions("master", "demanding", ctx({ target: 2 }))[0]).toEqual({ kind: "league_position", max: 1 });
    // Master and kit never get the boards' goals.
    for (let i = 0; i < 100; i++) {
      for (const o of generateOffers(CATALOG, ctx({ clubId: `g${i}`, attendanceAvg: 30_000 }), emptySponsors())) {
        if (o.slot !== "board") expect(["followers_growth", "attendance"]).not.toContain(o.goal.kind);
      }
    }
  });

  test("only empty slots without offers get new ones; boards get free places + 2", () => {
    const start = initialSponsors(CATALOG, ctx());
    // Offers already on the table: nothing new.
    expect(generateOffers(CATALOG, ctx({ season: 2027 }), start)).toEqual([]);
    const master = start.offers.find((o) => o.slot === "master")!;
    let s = (acceptOffer(start, master.id, "2026-08-16") as { sponsors: ClubSponsors }).sponsors;
    for (const o of start.offers.filter((x) => x.slot === "board").slice(0, 3)) {
      s = (acceptOffer(s, o.id, "2026-08-16") as { sponsors: ClubSponsors }).sponsors;
    }
    const cleared: ClubSponsors = { ...s, offers: [] };
    const next = generateOffers(CATALOG, ctx({ season: 2027 }), cleared);
    expect(next.filter((o) => o.slot === "master")).toHaveLength(0);
    expect(next.filter((o) => o.slot === "kit")).toHaveLength(2);
    expect(next.filter((o) => o.slot === "board")).toHaveLength(3);
    const there = new Set(cleared.contracts.map((c) => c.company.id));
    expect(next.some((o) => there.has(o.company.id))).toBe(false);
  });

  test("a tiny catalog still fills what it can, never twice the same company", () => {
    const tiny = CATALOG.slice(0, 5);
    const offers = generateOffers(tiny, ctx(), emptySponsors());
    expect(offers).toHaveLength(5);
    expect(new Set(offers.map((o) => o.company.id)).size).toBe(5);
  });
});

describe("answering", () => {
  const start = initialSponsors(CATALOG, ctx());
  const of = (slot: SponsorOffer["slot"]) => start.offers.filter((o) => o.slot === slot);

  test("accept: a contract, the slot's other offers drop (boards only when the four are taken)", () => {
    const r = acceptOffer(start, of("master")[0]!.id, "2026-08-20");
    if (!r.ok) throw new Error("refused");
    expect(r.contract).toMatchObject({ slot: "master", annual: of("master")[0]!.annual, seasonsLeft: of("master")[0]!.years, signedOn: "2026-08-20" });
    expect(r.sponsors.offers.filter((o) => o.slot === "master")).toHaveLength(0);
    expect(r.sponsors.offers.filter((o) => o.slot === "kit")).toHaveLength(2);
    // The dropped master offers are gone: 404, and a second master is impossible.
    expect(acceptOffer(r.sponsors, of("master")[1]!.id, "2026-08-20")).toEqual({ ok: false, error: "notFound" });

    let s = start;
    for (const [i, o] of of("board").slice(0, 4).entries()) {
      const b = acceptOffer(s, o.id, "2026-08-20");
      if (!b.ok) throw new Error("refused");
      s = b.sponsors;
      expect(s.offers.filter((x) => x.slot === "board")).toHaveLength(i < 3 ? 5 - i : 0);
    }
    expect(slotFree(s, "board")).toBe(0);
  });

  test("slotTaken when the slot filled another way; unknown and expired offers are notFound", () => {
    const taken: ClubSponsors = { ...start, contracts: [contract()] };
    expect(acceptOffer(taken, of("master")[0]!.id, "2026-08-20")).toEqual({ ok: false, error: "slotTaken" });
    expect(acceptOffer(start, "nope", "2026-08-20")).toEqual({ ok: false, error: "notFound" });
    const last = of("kit")[0]!.expires;
    expect(acceptOffer(start, of("kit")[0]!.id, last).ok).toBe(true);
    expect(acceptOffer(start, of("kit")[0]!.id, addDays(last, 1))).toEqual({ ok: false, error: "notFound" });
    expect(declineOffer(start, of("kit")[0]!.id, addDays(last, 1))).toEqual({ ok: false, error: "notFound" });
  });

  test("decline removes only that offer", () => {
    const r = declineOffer(start, of("kit")[0]!.id, "2026-08-20");
    if (!r.ok) throw new Error("refused");
    expect(r.sponsors.offers).toHaveLength(start.offers.length - 1);
    expect(r.sponsors.contracts).toHaveLength(0);
  });

  test("negotiate once: raised 8%, kept or withdrawn, the same answer every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const s = initialSponsors(CATALOG, ctx({ clubId: `n${i}` }));
      for (const o of s.offers) {
        const expected = negotiationOutcome(o.id);
        const r = negotiateOffer(s, o.id, "2026-08-20");
        if (!r.ok) throw new Error("refused");
        expect(r.negotiation).toBe(expected);
        expect(negotiateOffer(s, o.id, "2026-08-20")).toEqual(r);
        seen.add(expected);
        const after = r.sponsors.offers.find((x) => x.id === o.id);
        if (expected === "withdrawn") {
          expect(after).toBeUndefined();
          continue;
        }
        expect(after!.negotiated).toBe(true);
        if (expected === "raised") expect(after!.annual / o.annual).toBeCloseTo(1.08, 2);
        else expect(after!.annual).toBe(o.annual);
        expect(after!.bonus).toBe(o.bonus);
        expect(negotiateOffer(r.sponsors, o.id, "2026-08-20")).toEqual({ ok: false, error: "alreadyNegotiated" });
      }
    }
    expect([...seen].sort()).toEqual(["kept", "raised", "withdrawn"]);
  });

  test("the three answers come out near 45 / 35 / 20", () => {
    const n = 4000;
    const count = { raised: 0, kept: 0, withdrawn: 0 };
    for (let i = 0; i < n; i++) count[negotiationOutcome(`so_master_${i}`)]++;
    expect(count.raised / n).toBeGreaterThan(0.41);
    expect(count.raised / n).toBeLessThan(0.49);
    expect(count.kept / n).toBeGreaterThan(0.31);
    expect(count.kept / n).toBeLessThan(0.39);
    expect(count.withdrawn / n).toBeGreaterThan(0.17);
    expect(count.withdrawn / n).toBeLessThan(0.23);
  });
});

describe("expiry", () => {
  const start = initialSponsors(CATALOG, ctx());
  const last = start.offers[0]!.expires;

  test("nothing expired: the same object", () => {
    const r = expireOffers(start, last);
    expect(r.changed).toBe(false);
    expect(r.sponsors).toBe(start);
    expect(expireOffers(emptySponsors(), "2030-01-01").changed).toBe(false);
  });

  test("past the last day the director signs the best fixed value of every empty slot", () => {
    const r = expireOffers(start, addDays(last, 1));
    expect(r.changed).toBe(true);
    expect(r.sponsors.offers).toHaveLength(0);
    expect(r.signed).toHaveLength(6);
    expect(r.sponsors.contracts).toHaveLength(6);
    for (const slot of ["master", "kit", "board"] as const) {
      const offered = start.offers.filter((o) => o.slot === slot).map((o) => o.annual).sort((a, b) => b - a);
      const signed = r.signed.filter((c) => c.slot === slot).map((c) => c.annual).sort((a, b) => b - a);
      expect(signed).toEqual(offered.slice(0, SPONSORS.SLOTS[slot].count));
      expect(slotFree(r.sponsors, slot)).toBe(0);
    }
    expect(r.signed.every((c) => c.auto === true && c.signedOn === addDays(last, 1))).toBe(true);
    // The same day again: nothing left to do.
    expect(expireOffers(r.sponsors, addDays(last, 1)).changed).toBe(false);
  });

  test("a filled slot signs nothing; live offers stay", () => {
    const accepted = acceptOffer(start, start.offers.find((o) => o.slot === "master")!.id, "2026-08-16");
    if (!accepted.ok) throw new Error("refused");
    const fresh: SponsorOffer = { ...start.offers.find((o) => o.slot === "kit")!, id: "fresh", expires: addDays(last, 30) };
    const s: ClubSponsors = { ...accepted.sponsors, offers: [...accepted.sponsors.offers.filter((o) => o.slot !== "kit"), fresh] };
    const r = expireOffers(s, addDays(last, 1));
    expect(r.signed.filter((c) => c.slot === "master")).toHaveLength(0);
    expect(r.signed.filter((c) => c.slot === "kit")).toHaveLength(0);
    expect(r.sponsors.offers.map((o) => o.id)).toEqual(["fresh"]);
    expect(r.sponsors.contracts.filter((c) => c.slot === "master")).toHaveLength(1);
  });
});

describe("season rollover", () => {
  const next = ctx({ season: 2027, date: "2027-05-30" });
  const of = (c: SponsorContract): ClubSponsors => ({ contracts: [c], offers: [] });

  test("goals", () => {
    expect(goalMet({ kind: "league_position", max: 10 }, outcome({ position: 10 }))).toBe(true);
    expect(goalMet({ kind: "league_position", max: 10 }, outcome({ position: 11 }))).toBe(false);
    expect(goalMet({ kind: "league_position", max: 10 }, outcome({ position: null }))).toBe(false);
    expect(goalMet({ kind: "continental" }, outcome({ continental: true }))).toBe(true);
    expect(goalMet({ kind: "cup_stage", stage: "qf" }, outcome({ cupStage: "r16" }))).toBe(false);
    expect(goalMet({ kind: "cup_stage", stage: "qf" }, outcome({ cupStage: "qf" }))).toBe(true);
    expect(goalMet({ kind: "cup_stage", stage: "sf" }, outcome({ cupStage: "qf" }))).toBe(false);
    expect(goalMet({ kind: "cup_stage", stage: "sf" }, outcome({ cupStage: "champion" }))).toBe(true);
    expect(goalMet({ kind: "promotion" }, outcome({ promoted: true }))).toBe(true);
    expect(goalMet({ kind: "followers_growth", pct: 0.03 }, outcome({ followersGrowth: 0.029 }))).toBe(false);
    expect(goalMet({ kind: "followers_growth", pct: 0.03 }, outcome({ followersGrowth: 0.03 }))).toBe(true);
    expect(goalMet({ kind: "attendance", avg: 30_000 }, outcome({ attendanceAvg: null }))).toBe(false);
    expect(goalMet({ kind: "attendance", avg: 30_000 }, outcome({ attendanceAvg: 30_000 }))).toBe(true);
    expect(positionMiss({ kind: "league_position", max: 10 }, outcome({ position: 16 }))).toBe(6);
    expect(positionMiss({ kind: "continental" }, outcome({ position: 16 }))).toBe(0);
  });

  test("goal met in the middle of the contract: bonus, one season less, nothing else", () => {
    const r = evaluateSponsorSeason(of(contract()), outcome({ position: 8 }), next);
    expect(r.bonuses).toEqual([{ contractId: "c1", slot: "master", company: contract().company, amount: 800_000 }]);
    expect(r.sponsors.contracts).toEqual([contract({ seasonsLeft: 1 })]);
    expect(r.renewals).toEqual([]);
    expect(r.left).toEqual([]);
  });

  test("goal missed in the middle of the contract: no bonus, it goes on", () => {
    const r = evaluateSponsorSeason(of(contract()), outcome({ position: 13 }), next);
    expect(r.bonuses).toEqual([]);
    expect(r.sponsors.contracts).toEqual([contract({ seasonsLeft: 1 })]);
    expect(r.left).toEqual([]);
  });

  test("early exit: relegated, or the position missed by 6 or more", () => {
    const down = evaluateSponsorSeason(of(contract({ seasonsLeft: 3 })), outcome({ position: 12, relegated: true }), next);
    expect(down.sponsors.contracts).toEqual([]);
    expect(down.left).toEqual([{ slot: "master", company: contract().company, reason: "relegated" }]);
    expect(down.renewals).toEqual([]);
    const far = evaluateSponsorSeason(of(contract({ seasonsLeft: 3 })), outcome({ position: 16 }), next);
    expect(far.sponsors.contracts).toEqual([]);
    expect(far.left[0]!.reason).toBe("missed");
    // 5 places off is not enough to break it.
    expect(evaluateSponsorSeason(of(contract({ seasonsLeft: 3 })), outcome({ position: 15 }), next).sponsors.contracts).toHaveLength(1);
    // A cup goal met still pays its bonus on the way down.
    const cup = evaluateSponsorSeason(of(contract({ goal: { kind: "cup_stage", stage: "qf" } })), outcome({ relegated: true, cupStage: "sf" }), next);
    expect(cup.bonuses).toHaveLength(1);
    expect(cup.sponsors.contracts).toEqual([]);
  });

  test("contract at its end: renewal × 1.10 when met, × 0.90 when missed narrowly, else the company leaves", () => {
    const ending = contract({ seasonsLeft: 1 });
    const met = evaluateSponsorSeason(of(ending), outcome({ position: 9 }), next);
    expect(met.sponsors.contracts).toEqual([]);
    expect(met.bonuses).toHaveLength(1);
    expect(met.renewals).toHaveLength(1);
    expect(met.renewals[0]).toMatchObject({
      slot: "master", renewal: true, annual: 5_720_000, bonus: 880_000, years: SPONSORS.YEARS.RENEWAL,
      expires: addDays("2027-05-30", SPONSORS.OFFER_DAYS), goal: { kind: "league_position", max: 10 },
    });
    expect(met.renewals[0]!.company).toEqual(ending.company);
    expect(met.sponsors.offers).toEqual(met.renewals);
    expect(met.left).toEqual([]);

    const near = evaluateSponsorSeason(of(ending), outcome({ position: 12 }), next);
    expect(near.bonuses).toEqual([]);
    expect(near.renewals[0]!.annual).toBe(4_680_000);

    const off = evaluateSponsorSeason(of(ending), outcome({ position: 13 }), next);
    expect(off.renewals).toEqual([]);
    expect(off.left).toEqual([{ slot: "master", company: ending.company, reason: "missed" }]);

    // A goal that is not a position, missed: the cheaper renewal.
    const cup = evaluateSponsorSeason(of(contract({ seasonsLeft: 1, goal: { kind: "cup_stage", stage: "sf" } })), outcome({ cupStage: "r16" }), next);
    expect(cup.renewals[0]!.annual).toBe(4_680_000);
    expect(cup.renewals[0]!.goal).toEqual({ kind: "cup_stage", stage: "sf" });
  });

  test("a renewal's position goal follows the new season's target; the renewal can be accepted", () => {
    const r = evaluateSponsorSeason(of(contract({ seasonsLeft: 1, profile: "demanding" })), outcome({ position: 5 }), ctx({ season: 2027, date: "2027-05-30", target: 6 }));
    expect(r.renewals[0]!.goal).toEqual({ kind: "league_position", max: 3 });
    const signed = acceptOffer(r.sponsors, r.renewals[0]!.id, "2027-06-01");
    if (!signed.ok) throw new Error("refused");
    expect(signed.sponsors.contracts).toHaveLength(1);
    expect(signed.sponsors.contracts[0]!.seasonsLeft).toBe(SPONSORS.YEARS.RENEWAL);
    // New offers still come for the slot the renewal is waiting in.
    const fresh = generateOffers(CATALOG, next, r.sponsors);
    expect(fresh.filter((o) => o.slot === "master")).toHaveLength(3);
    expect(fresh.some((o) => o.company.id === r.renewals[0]!.company.id)).toBe(false);
  });
});

describe("income", () => {
  test("the weekly income is the contracts' sum over 52; an empty record earns nothing", () => {
    expect(weeklySponsorIncome(emptySponsors())).toBe(0);
    const s: ClubSponsors = { contracts: [contract(), contract({ id: "c2", slot: "kit", annual: 2_600_000 })], offers: [] };
    expect(weeklySponsorIncome(s)).toBe(150_000);
    expect(weeklyCommercialIncome({ sponsors: s, finances: { commercial: 99_999_999 } })).toBe(150_000);
  });

  test("a club without the record keeps the old commercial / 52", () => {
    expect(weeklyCommercialIncome({ finances: { commercial: 5_200_000 } })).toBe(100_000);
    expect(weeklyCommercialIncome({})).toBe(0);
  });

  test("a standard set of contracts at appeal 1 is close to the old income", () => {
    let sum = 0;
    for (const slot of ["master", "kit", "board"] as const) {
      const v = offerValue({ base: 10_400_000, slot, appeal: 1, profile: "standard", size: "national", noise: 1 });
      sum += v.annual * SPONSORS.SLOTS[slot].count;
    }
    expect(sum / 10_400_000).toBeCloseTo(0.95, 2);
  });
});

describe("AI clubs", () => {
  test("deterministic by club and season, never the same company twice", () => {
    for (let i = 0; i < 200; i++) {
      const club = { clubId: `ai${i}`, season: 2026, country: i % 2 ? "England" : "Brazil", tier: (["LOW", "MEDIUM", "HIGH", "ELITE"] as const)[i % 4]! };
      const a = aiSponsorsOf(CATALOG, club);
      expect(aiSponsorsOf(CATALOG, club)).toEqual(a);
      const ids = [a.master!.id, a.kit!.id, ...a.boards.map((b) => b.id)];
      expect(a.boards).toHaveLength(4);
      expect(new Set(ids).size).toBe(6);
    }
    const one = { clubId: "33", season: 2026, country: "England", tier: "ELITE" } as const;
    expect(aiSponsorsOf(CATALOG, { ...one, season: 2027 })).not.toEqual(aiSponsorsOf(CATALOG, one));
  });

  test("the companies fit the club; a tiny catalog gives what it has", () => {
    const low = aiSponsorsOf(CATALOG, { clubId: "x", season: 2026, country: "England", tier: "LOW" });
    expect(low.master!.size).toBe("local");
    const elite = aiSponsorsOf(CATALOG, { clubId: "x", season: 2026, country: "England", tier: "ELITE" });
    expect(elite.master!.size).not.toBe("local");
    const tiny = aiSponsorsOf(CATALOG.slice(0, 3), { clubId: "x", season: 2026, country: "England", tier: "ELITE" });
    const ids = [tiny.master?.id, tiny.kit?.id, ...tiny.boards.map((b) => b.id)].filter(Boolean);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(aiSponsorsOf([], { clubId: "x", season: 2026, country: null, tier: "LOW" })).toEqual({ master: null, kit: null, boards: [] });
  });

  test("boards: master 3, kit 2, board 1", () => {
    const a = aiSponsorsOf(CATALOG, { clubId: "33", season: 2026, country: "England", tier: "HIGH" });
    expect(aiBoards(a).map((b) => b.weight)).toEqual([3, 2, 1, 1, 1, 1]);
    const s: ClubSponsors = { contracts: [contract({ id: "b", slot: "board" }), contract()], offers: [] };
    expect(contractBoards(s).map((b) => b.weight)).toEqual([3, 1]);
    expect(contractBoards(s).map((b) => b.id)).toEqual(["g0", "g0"]);
    expect(contractMaster(s)).toEqual({ id: "g0", name: "Co g0", sector: "bank", colors: ["#000000", "#ffffff"] });
    expect(contractMaster(emptySponsors())).toBeNull();
  });
});

describe("progress and messages", () => {
  const now = { position: 8, continentalTo: 6, promotionTo: 0, cupStage: "r16", followersTrend: 0.05, attendanceAvg: 28_000.4 };

  test("where each goal stands today", () => {
    expect(goalProgress({ kind: "league_position", max: 10 }, now)).toEqual({ met: true, current: 8, target: 10 });
    expect(goalProgress({ kind: "league_position", max: 10 }, { ...now, position: null })).toEqual({ met: null, target: 10 });
    expect(goalProgress({ kind: "continental" }, now)).toEqual({ met: false, current: 8, target: 6 });
    expect(goalProgress({ kind: "promotion" }, now)).toEqual({ met: null });
    expect(goalProgress({ kind: "cup_stage", stage: "qf" }, now)).toEqual({ met: null });
    expect(goalProgress({ kind: "cup_stage", stage: "qf" }, { ...now, cupStage: "sf" })).toEqual({ met: true });
    expect(goalProgress({ kind: "followers_growth", pct: 0.03 }, now)).toEqual({ met: true, current: 0.05, target: 0.03 });
    expect(goalProgress({ kind: "attendance", avg: 30_000 }, now)).toEqual({ met: false, current: 28_000, target: 30_000 });
  });

  test("inbox messages carry what the screen needs", () => {
    const offers = initialSponsors(CATALOG, ctx()).offers;
    expect(offersBySlot(offers)).toEqual([{ slot: "master", count: 3 }, { slot: "kit", count: 2 }, { slot: "board", count: 6 }]);
    const m = buildSponsorMessage({ date: "2026-08-15", kind: "offers", offers });
    expect(m).toMatchObject({ category: "sponsor", kind: "offers", expires: offers[0]!.expires, read: false });
    const signed = expireOffers({ contracts: [], offers }, addDays(offers[0]!.expires, 1)).signed;
    const a = buildSponsorMessage({ date: "2026-09-06", kind: "auto_signed", signed });
    expect(a.signed).toHaveLength(6);
    expect(a.signed![0]).toEqual({ slot: signed[0]!.slot, company: signed[0]!.company.name, annual: signed[0]!.annual, years: signed[0]!.seasonsLeft });
    const review = evaluateSponsorSeason({ contracts: [contract({ seasonsLeft: 1 }), contract({ id: "c2", slot: "kit", seasonsLeft: 2, goal: { kind: "league_position", max: 2 } })], offers: [] }, outcome({ position: 9 }), ctx({ season: 2027, date: "2027-05-30" }));
    const r = buildSponsorMessage({ date: "2027-05-30", kind: "season_review", review });
    expect(r.bonuses).toEqual([{ slot: "master", company: "Co g0", amount: 800_000 }]);
    expect(r.renewals).toEqual([{ slot: "master", company: "Co g0", annual: 5_720_000 }]);
    expect(r.left).toEqual([{ slot: "kit", company: "Co g0", reason: "missed" }]);
  });
});
