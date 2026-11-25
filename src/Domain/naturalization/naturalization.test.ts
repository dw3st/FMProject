import { describe, expect, test } from "bun:test";
import {
  asksNaturalization, canAskNaturalization, candidateNations, naturalizationChance, naturalizationDay, processDays,
  residenceSeasons, startNaturalization, type NaturalizationCtx,
} from "@/Domain/naturalization/naturalization";
import { NATURALIZATION as N } from "@/Domain/naturalization/naturalizationConfig";
import { foreignBasis, foreignByNation, isForeign, nationTrained } from "@/Domain/registration/formed";
import { REGISTRATION_RULES as R } from "@/Domain/registration/registrationConfig";
import { keepBestNation, type NationCandidate } from "@/Domain/national/nationalSquad";
import type { PlayerHistoryRow, RosterPlayer } from "@/types/playerTypes";

const ctx: NaturalizationCtx = {
  seasonStartYear: 2031,
  countryOfLeague: (s) => (s.startsWith("brazil") ? "Brazil" : s.startsWith("premier") ? "England" : "Spain"),
  countryOfClub: (id) => (id.startsWith("br") ? "Brazil" : "Spain"),
};
const p = (o: Partial<RosterPlayer>): RosterPlayer =>
  ({ id: "x", name: "x", age: 27, squadId: "br1", preferredFoot: "right", positions: ["CM"], stats: {} as never, profile: {} as never, nationality: "Argentina", ...o });
const row = (season: string, league: string, loan = false): PlayerHistoryRow => ({
  season, squadId: "br1", clubName: "", league, apps: 10, goals: 0, assists: 0, avgRating: null, cupApps: 0, cupGoals: 0,
  contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [], ...(loan ? { loan: true } : {}),
});
const seasons = (from: number, to: number, league = "brazil_serie_a") => {
  const out: PlayerHistoryRow[] = [];
  for (let y = from; y <= to; y++) out.push(row(String(y), league));
  return out;
};

describe("naturalization requirements", () => {
  test("residence: five consecutive seasons, loans included; a season abroad resets", () => {
    expect(residenceSeasons(p({ history: seasons(2026, 2030) }), "Brazil", ctx, true)).toBe(5);
    expect(canAskNaturalization(p({ history: seasons(2026, 2030) }), "Brazil", ctx)).toBe("residence");
    expect(canAskNaturalization(p({ history: seasons(2027, 2030) }), "Brazil", ctx)).toBeNull();
    // A loan in Brazil still counts.
    const loaned = [...seasons(2026, 2028), row("2029", "brazil_serie_b", true), row("2030", "brazil_serie_a")];
    expect(residenceSeasons(p({ history: loaned }), "Brazil", ctx, true)).toBe(5);
    // A season in Spain in the middle breaks the streak.
    const gap = [...seasons(2024, 2026), row("2027-28", "la_liga"), ...seasons(2028, 2030)];
    expect(residenceSeasons(p({ history: gap }), "Brazil", ctx, true)).toBe(3);
    // The season in progress counts once it has started.
    const started = p({ history: seasons(2027, 2030), seasonLog: { appearances: 2 } as never });
    expect(residenceSeasons(started, "Brazil", ctx, true)).toBe(5);
  });
  test("formation: out of the academy, or three seasons in the country up to 21, from 18", () => {
    expect(canAskNaturalization(p({ id: "youth_br1_2027_0", age: 18 }), "Brazil", ctx)).toBe("formed");
    expect(canAskNaturalization(p({ id: "youth_br1_2027_0", age: 17 }), "Brazil", ctx)).toBeNull();
    expect(canAskNaturalization(p({ id: "prospect_1", academyOf: "br2", age: 19 }), "Brazil", ctx)).toBe("formed");
    expect(canAskNaturalization(p({ id: "youth_es1_1", age: 19 }), "Brazil", ctx)).toBeNull();
    const young = p({ age: 21, history: [row("2028", "brazil_serie_a"), row("2029", "brazil_serie_a"), row("2030", "brazil_serie_a")] });
    expect(canAskNaturalization(young, "Brazil", ctx)).toBe("formed");
  });
  test("never asks: capped for his origin, already dual, in process, or not foreign", () => {
    const h = { history: seasons(2026, 2030) };
    expect(canAskNaturalization(p({ ...h, national: { nation: "Argentina", caps: 1, goals: 0, assists: 0, titles: [] } }), "Brazil", ctx)).toBeNull();
    expect(canAskNaturalization(p({ ...h, national: { nation: "Argentina", caps: 0, goals: 0, assists: 0, titles: [] } }), "Brazil", ctx)).toBe("residence");
    expect(canAskNaturalization(p({ ...h, secondNationality: "Brazil" }), "Brazil", ctx)).toBeNull();
    expect(canAskNaturalization(p({ ...h, naturalization: { country: "Brazil", since: "2031-01-01", until: "2031-05-01" } }), "Brazil", ctx)).toBeNull();
    expect(canAskNaturalization(p({ ...h, nationality: "Brazil" }), "Brazil", ctx)).toBeNull();
    expect(canAskNaturalization(p({ ...h, nationality: null }), "Brazil", ctx)).toBeNull();
  });
});

describe("interest and process", () => {
  test("chance stays within bounds", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
      for (const [n, o] of [[true, false], [false, true], [false, false], [true, true]] as const) {
        const c = naturalizationChance(p({ id }), n, o);
        expect(c).toBeGreaterThanOrEqual(N.MIN_CHANCE);
        expect(c).toBeLessThanOrEqual(N.MAX_CHANCE);
      }
    }
    const loyal = p({ personality: { ambition: 10, loyalty: 20, professionalism: 10, temperament: 10 } });
    expect(naturalizationChance(loyal, true, false)).toBeCloseTo(N.BASE + N.LOYALTY + N.NEW_PLACE, 6);
    const disloyal = p({ personality: { ambition: 10, loyalty: 1, professionalism: 10, temperament: 10 } });
    expect(naturalizationChance(disloyal, false, true)).toBe(N.MIN_CHANCE);
  });
  test("draws are fixed per player and year", () => {
    expect(asksNaturalization("x", 2031, 0.5)).toBe(asksNaturalization("x", 2031, 0.5));
    expect(asksNaturalization("x", 2031, 1)).toBe(true);
    expect(asksNaturalization("x", 2031, 0)).toBe(false);
    const d = processDays("x", 2031);
    expect(d).toBeGreaterThanOrEqual(N.PROCESS_MIN_DAYS);
    expect(d).toBeLessThanOrEqual(N.PROCESS_MAX_DAYS);
  });
  test("ends on until with the second nationality; drops when he leaves the country", () => {
    const started = startNaturalization(p({}), "Brazil", "2031-01-10", 2031);
    const until = started.naturalization!.until;
    expect(naturalizationDay(started, "2031-01-11", "Brazil").outcome).toBe("none");
    const done = naturalizationDay(started, until, "Brazil");
    expect(done.outcome).toBe("done");
    expect(done.player.secondNationality).toBe("Brazil");
    expect(done.player.naturalization).toBeUndefined();
    expect(naturalizationDay(started, "2031-02-01", "Spain").outcome).toBe("dropped");
  });
});

describe("dual nationality", () => {
  const dual = p({ nationality: "Argentina", secondNationality: "Brazil" });
  test("domestic in the registration rules by either nation", () => {
    expect(foreignByNation(dual, R.brazil!, "Brazil")).toBe(false);
    expect(isForeign(dual, R.brazil!, "Brazil")).toBe(false);
    expect(foreignBasis(dual, R.brazil!, "Brazil")).toBeNull();
    // La Liga: a Japanese naturalized Spanish is no longer non-EU.
    const jp = p({ nationality: "Japan", secondNationality: "Spain" });
    expect(isForeign(jp, R.la_liga!, "Spain")).toBe(false);
    expect(foreignBasis(jp, R.la_liga!, "Spain")).toBeNull();
    // A second EU nationality is enough in La Liga too.
    const eu = p({ nationality: "Japan", secondNationality: "France" });
    expect(isForeign(eu, R.la_liga!, "Spain")).toBe(false);
    // MLS: naturalized American is domestic.
    expect(foreignByNation(p({ nationality: "Ghana", secondNationality: "USA" }), R.mls!, "USA")).toBe(false);
    expect(foreignByNation(p({ nationality: "Ghana" }), R.mls!, "USA")).toBe(true);
    expect(nationTrained(dual, "Brazil", ctx, [])).toBe(true);
  });
  test("national candidate for both until a cap ties him", () => {
    expect(candidateNations(dual)).toEqual(["Argentina", "Brazil"]);
    expect(candidateNations({ ...dual, national: { nation: "Brazil", caps: 3, goals: 0, assists: 0, titles: [] } })).toEqual(["Brazil"]);
  });
  test("the call-up pool keeps him where he ranks better", () => {
    const cand = (pl: RosterPlayer): NationCandidate => ({ player: pl, squadId: "br1" });
    const strong = (id: string) => p({ id, nationality: "Argentina", positions: ["CM"], stats: { finishing: 9, passing: 9, vision: 9, dribbling: 9, tackling: 9, pressing: 9, speed: 9, acceleration: 9, strength: 9, stamina: 9, heading: 9, reflex: 1, jump: 9 } as never });
    const me = p({ id: "me", nationality: "Argentina", secondNationality: "Brazil", stats: { finishing: 5, passing: 5, vision: 5, dribbling: 5, tackling: 5, pressing: 5, speed: 5, acceleration: 5, strength: 5, stamina: 5, heading: 5, reflex: 1, jump: 5 } as never });
    const pool = new Map([["Argentina", [cand(strong("a1")), cand(strong("a2")), cand(me)]], ["Brazil", [cand(me)]]]);
    const out = keepBestNation(pool, new Map([["me", ["Argentina", "Brazil"]]]));
    expect(out.get("Argentina")!.some((c) => c.player.id === "me")).toBe(false);
    expect(out.get("Brazil")!.some((c) => c.player.id === "me")).toBe(true);
  });
});
