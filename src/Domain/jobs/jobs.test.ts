import { describe, expect, test } from "bun:test";
import {
  clubPrestiges,
  eligibleCandidates,
  employedBand,
  guaranteedClub,
  guaranteedOfferDue,
  managerReputation,
  mergeOffers,
  midSeasonOfferCount,
  moveHumanManager,
  pickOfferingClubs,
  pruneOffers,
  rankPercentile,
  recentTitlePoints,
  reputation,
  sackHumanManager,
  seasonEndLambda,
  seasonEndOfferCount,
  unemployedBand,
  unemployedOfferCount,
  type OfferCandidate,
} from "@/Domain/jobs/jobs";
import { mulberry32 } from "@/Domain/rng";
import type { ManagerRecord } from "@/types/managerTypes";
import type { JobOffer } from "@/types/jobTypes";

const mgr = (id: string, points: number, extra: Partial<ManagerRecord> = {}): ManagerRecord => ({
  id, name: id, squadId: `s_${id}`, isPlayer: false, points, seasons: 0, titles: [], ...extra,
});

describe("reputation", () => {
  test("rank percentile: ties count half, alone at the top is 1", () => {
    const all = [mgr("a", 0), mgr("b", 0), mgr("c", 0)];
    expect(rankPercentile(all, "a")).toBe(0.5);
    expect(rankPercentile([mgr("a", 100), mgr("b", 0), mgr("c", 0)], "a")).toBe(1);
    expect(rankPercentile([mgr("a", 0), mgr("b", 10), mgr("c", 10)], "a")).toBe(0);
  });

  test("titles of the last three seasons only", () => {
    const titles = [
      { season: "2023-24", points: 100 }, { season: "2025", points: 50 }, { season: "2027-28", points: 20 },
    ];
    expect(recentTitlePoints(titles, 2027)).toBe(70);
  });

  test("weights: 45 rank, 30 board, 15 titles, 10 seasons", () => {
    expect(reputation({ rankPercentile: 1, board: 100, titlePoints: 999, seasons: 9 })).toBe(100);
    expect(reputation({ rankPercentile: 0, board: 0, titlePoints: 0, seasons: 0 })).toBe(0);
    expect(reputation({ rankPercentile: 0.5, board: 60, titlePoints: 0, seasons: 0 })).toBe(40.5);
  });

  test("a new career sits around 40", () => {
    const all = [mgr("player", 0, { isPlayer: true }), mgr("b", 0), mgr("c", 0)];
    expect(managerReputation(all, 60, 2027)).toBe(40.5);
  });
});

describe("prestige and band", () => {
  test("percentile of strength plus the tier pull", () => {
    const p = clubPrestiges([
      { squadId: "a", level: 1, tier: "MEDIUM" },
      { squadId: "b", level: 2, tier: "MEDIUM" },
      { squadId: "c", level: 3, tier: "ELITE" },
      { squadId: "d", level: 3, tier: "LOW" },
    ]);
    expect(p.get("a")).toBe(0);
    expect(p.get("b")).toBeCloseTo(1 / 3);
    expect(p.get("c")).toBeCloseTo(0.933, 2);
    expect(p.get("d")).toBeCloseTo(0.733, 2);
  });

  test("employed: one step up; unemployed: below the last club", () => {
    expect(employedBand(0.5, 40)).toMatchObject({ lo: 0.45, hi: 0.5 });
    const u = unemployedBand(0.6);
    expect(u.hi).toBeCloseTo(0.55);
    expect(u.lo).toBe(0);
  });

  test("eligibility: band, excluded clubs, same-city rival", () => {
    const cands: OfferCandidate[] = [
      { squadId: "a", prestige: 0.5, country: "England", continent: "Europe", city: "London" },
      { squadId: "b", prestige: 0.55, country: "England", continent: "Europe", city: "Lóndon" },
      { squadId: "c", prestige: 0.9, country: "Spain", continent: "Europe" },
      { squadId: "d", prestige: 0.52, country: "Spain", continent: "Europe" },
    ];
    const band = employedBand(0.5, 50);
    expect(eligibleCandidates(cands, { band, exclude: new Set(["a"]) }).map((c) => c.squadId)).toEqual(["b", "d"]);
    expect(eligibleCandidates(cands, { band, exclude: new Set(), rivalCity: "london" }).map((c) => c.squadId)).toEqual(["d"]);
  });

  test("picks distinct clubs, favouring the same country", () => {
    const cands: OfferCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      squadId: `c${i}`, prestige: 0.55, country: i < 10 ? "England" : "Peru", continent: i < 10 ? "Europe" : "South America",
    }));
    const rng = mulberry32(7);
    let home = 0;
    for (let k = 0; k < 200; k++) {
      const picked = pickOfferingClubs({ candidates: cands, band: employedBand(0.5, 60), home: { country: "England", continent: "Europe" }, count: 2, rng });
      expect(new Set(picked.map((p) => p.squadId)).size).toBe(2);
      home += picked.filter((p) => p.country === "England").length;
    }
    expect(home / 400).toBeGreaterThan(0.65);
  });
});

describe("offer counts", () => {
  test("season end: reputation 80 → ~2 on average, 40 → ~0.3", () => {
    expect(seasonEndLambda(40)).toBeCloseTo(0.3);
    expect(seasonEndLambda(80)).toBeGreaterThan(1.8);
    const rng = mulberry32(3);
    let hi = 0;
    let lo = 0;
    for (let i = 0; i < 4000; i++) {
      hi += seasonEndOfferCount(80, rng);
      lo += seasonEndOfferCount(40, rng);
    }
    expect(hi / 4000).toBeGreaterThan(1.5);
    expect(hi / 4000).toBeLessThan(2.1);
    expect(lo / 4000).toBeGreaterThan(0.2);
    expect(lo / 4000).toBeLessThan(0.4);
    for (let i = 0; i < 200; i++) expect(seasonEndOfferCount(100, rng)).toBeLessThanOrEqual(3);
  });

  test("mid-season: only with reputation 60+ or board 80+", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 100; i++) expect(midSeasonOfferCount(59, 79, rng)).toBe(0);
    let n = 0;
    for (let i = 0; i < 1000; i++) n += midSeasonOfferCount(50, 85, rng);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(1000);
  });

  test("unemployed: 1 to 3", () => {
    const rng = mulberry32(9);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(unemployedOfferCount(rng));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  test("guaranteed offer after 120 days without any", () => {
    expect(guaranteedOfferDue({ since: "2027-01-01", date: "2027-04-30" })).toBe(false);
    expect(guaranteedOfferDue({ since: "2027-01-01", date: "2027-05-01" })).toBe(true);
    expect(guaranteedOfferDue({ since: "2027-01-01", lastOfferDate: "2027-03-01", date: "2027-05-01" })).toBe(false);
    const cands: OfferCandidate[] = [
      { squadId: "a", prestige: 0.3, country: null, continent: null },
      { squadId: "b", prestige: 0.1, country: null, continent: null },
      { squadId: "c", prestige: 0.9, country: null, continent: null },
    ];
    expect(guaranteedClub(cands, unemployedBand(0.5))?.squadId).toBe("b");
    expect(guaranteedClub(cands.slice(2), unemployedBand(0.5))?.squadId).toBe("c");
  });
});

describe("offers in the save", () => {
  const offer = (squadId: string, expires: string): JobOffer => ({
    id: `o_${squadId}_${expires}`, squadId, clubName: squadId, leagueSlug: "l", leagueName: "L", window: "unemployed",
    date: "2027-01-01", expires, objective: null, budget: 0, expectedPosition: 1, leagueSize: 20, prestige: 0.5,
  });

  test("expired offers drop; a new offer from the same club replaces the old one", () => {
    expect(pruneOffers([offer("a", "2027-01-10"), offer("b", "2027-01-09")], "2027-01-10").map((o) => o.squadId)).toEqual(["a"]);
    const merged = mergeOffers([offer("a", "2027-01-10"), offer("b", "2027-01-10")], [offer("a", "2027-02-01")]);
    expect(merged.map((o) => `${o.squadId}:${o.expires}`)).toEqual(["b:2027-01-10", "a:2027-02-01"]);
  });
});

describe("managers when the human changes club", () => {
  const base = (): ManagerRecord[] => [
    mgr("player", 10, { isPlayer: true, squadId: "old", clubs: [{ squadId: "old", from: "2026-08-01" }] }),
    mgr("x", 5, { squadId: "new" }),
    mgr("y", 0, { squadId: "other" }),
  ];

  test("no swap (D4): the new club's coach goes free, the old club gets an interim", () => {
    const out = moveHumanManager(base(), { toSquadId: "new", fromSquadId: "old", fromClubName: "Old FC", date: "2027-05-20" });
    expect(out.find((m) => m.isPlayer)).toMatchObject({
      squadId: "new",
      clubs: [{ squadId: "old", from: "2026-08-01", to: "2027-05-20", left: "moved" }, { squadId: "new", from: "2027-05-20" }],
    });
    expect(out.find((m) => m.id === "x")).toMatchObject({ squadId: "", freeSince: "2027-05-20" });
    const interim = out.find((m) => m.squadId === "old" && !m.isPlayer)!;
    expect(interim.interim).toBe(true);
    expect(interim.name).toContain("Old FC");
    expect(new Set(out.filter((m) => m.squadId).map((m) => m.squadId)).size).toBe(3);
  });

  test("sacked: an interim coach for the old club; hired while unemployed: the displaced coach is clubless", () => {
    const sacked = sackHumanManager(base(), { date: "2027-02-01", clubName: "Old FC" });
    expect(sacked.find((m) => m.isPlayer)!.squadId).toBe("");
    expect(sacked.find((m) => m.isPlayer)!.clubs!.at(-1)!.left).toBe("sacked");
    expect(sacked.find((m) => !m.isPlayer && m.squadId === "old")!.interim).toBe(true);
    const hired = moveHumanManager(sacked, { toSquadId: "new", fromSquadId: null, date: "2027-03-01" });
    expect(hired.find((m) => m.isPlayer)!.clubs!.map((c) => c.squadId)).toEqual(["old", "new"]);
    expect(hired.find((m) => m.id === "x")!.squadId).toBe("");
    const clubs = hired.filter((m) => m.squadId).map((m) => m.squadId);
    expect(new Set(clubs).size).toBe(clubs.length);
  });
});
