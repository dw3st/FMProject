import { describe, expect, test } from "bun:test";
import {
  NATIONAL_COACH, checkCallUp, currentNationalTeam, leaveNationalJob, nationalObjective, nationalPrestige, nationalWage,
  nextCallUpDate, objectiveFailedBadly, objectiveMet, offerChance, qualifierOutcome, rollNationalOffer, stageOfPlace,
  takeNationalJob, tournamentOutcome, tournamentTargetPlace,
} from "@/Domain/national/nationalCoach";
import { buildQualifier, buildTournament } from "@/Domain/national/competitions";
import { fifaWindows, qualifierDates } from "@/Domain/national/fifaCalendar";
import { nationalFillers } from "@/Domain/national/nationalSquad";
import type { ManagerRecord } from "@/types/managerTypes";
import type { NationalCompetition } from "@/types/nationalTypes";

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `nat_t${i}`, nation: `T${i}`, confed: "UEFA" as const, elo: 2000 - i * 10 }));

const fill = (line: "GK" | "Defender" | "Midfielder" | "Forward", n: number) =>
  nationalFillers({ saveId: "s", teamId: "nat_x", nation: "X", year: 2027, line, n, level: 5, donors: ["Ana Souza", "João Lima", "Rui Costa"] });

function playAll(c: NationalCompetition): NationalCompetition {
  const elo = new Map(teams(64).map((t) => [t.id, t.elo]));
  return {
    ...c,
    fixtures: c.fixtures.map((f) => (f.played ? f : { ...f, played: true, result: elo.get(f.home)! >= elo.get(f.away)! ? { home: 1, away: 0 } : { home: 0, away: 1 } })),
  };
}

describe("national coach", () => {
  test("prestige is the Elo percentile; the band and the own-nation boost", () => {
    const t = teams(11);
    expect(nationalPrestige(t, "nat_t0")).toEqual({ prestige: 1, rank: 1 });
    expect(nationalPrestige(t, "nat_t10")).toEqual({ prestige: 0, rank: 11 });
    expect(offerChance({ reputation: 40, prestige: 0.5, ownNation: false })).toBe(NATIONAL_COACH.OFFER_CHANCE);
    expect(offerChance({ reputation: 40, prestige: 0.55, ownNation: false })).toBe(0);
    expect(offerChance({ reputation: 40, prestige: 0.6, ownNation: true })).toBe(NATIONAL_COACH.OWN_NATION_CHANCE);
    expect(nationalWage(0)).toBe(10_000);
    expect(nationalWage(1)).toBe(50_000);
  });

  test("offers are deterministic and never above the band", () => {
    const t = teams(11);
    const a = rollNationalOffer({ saveId: "s", teamId: "nat_t9", nation: "T9", date: "2027-06-01", reputation: 40, ownNation: true, teams: t });
    const b = rollNationalOffer({ saveId: "s", teamId: "nat_t9", nation: "T9", date: "2027-06-01", reputation: 40, ownNation: true, teams: t });
    expect(a).toEqual(b);
    expect(rollNationalOffer({ saveId: "s", teamId: "nat_t0", nation: "T0", date: "2027-06-01", reputation: 40, ownNation: false, teams: t })).toBeNull();
    // Over many seeds the own nation inside the band is offered ~90%.
    let n = 0;
    for (let i = 0; i < 400; i++) if (rollNationalOffer({ saveId: `s${i}`, teamId: "nat_t9", nation: "T9", date: "2027-06-01", reputation: 40, ownNation: true, teams: t })) n++;
    expect(n / 400).toBeGreaterThan(0.8);
    if (a) expect(a.expires).toBe("2027-06-15");
  });

  test("tournament targets and stages", () => {
    expect(tournamentTargetPlace(1, 32)).toBe(1);
    expect(tournamentTargetPlace(6, 32)).toBe(5);
    expect(tournamentTargetPlace(40, 32)).toBe(33);
    expect(stageOfPlace(5, 32)).toBe("qf");
    expect(stageOfPlace(17, 32)).toBe("r32");
    expect(stageOfPlace(17, 16)).toBe("group");
  });

  test("qualifier objective and outcome", () => {
    const t = teams(20);
    let q = buildQualifier({ tournament: "euro", year: 2028, confed: "UEFA", teams: t.map((x) => ({ ...x })), slots: 8, dates: qualifierDates(2028), seedKey: "k" });
    const obj = nationalObjective(q, "nat_t0", t)!;
    expect(obj.kind).toBe("qualifier");
    if (obj.kind === "qualifier") {
      expect(obj.target).toBe(1);
      expect(obj.mustQualify).toBe(true);
    }
    q = playAll(q);
    const o = qualifierOutcome(q, "nat_t0", t, ["nat_t0"]);
    expect(o.position).toBe(1);
    expect(objectiveMet(o)).toBe(true);
    expect(objectiveFailedBadly(o)).toBe(false);
    // Expected to qualify and did not: sacked.
    const failed = qualifierOutcome(q, "nat_t5", t, []);
    expect(failed.relegated).toBe(true);
    expect(objectiveFailedBadly(failed)).toBe(true);
  });

  test("tournament objective and outcome", () => {
    const t = teams(24);
    const c = buildTournament({ tournament: "euro", year: 2028, teams: t.map((x) => ({ id: x.id, confed: "UEFA", elo: x.elo })), seedKey: "e" });
    const obj = nationalObjective(c, "nat_t0", t)!;
    expect(obj.kind === "tournament" && obj.stage).toBe("champion");
    const o = tournamentOutcome(c, "nat_t0", t);
    expect(o.target).toBe(1);
    expect(nationalObjective({ ...c, kind: "friendlies" }, "nat_t0", t)).toBeNull();
  });

  test("next call-up: a window or a drawn tournament", () => {
    const w = fifaWindows(2027).find((x) => x.start >= "2027-04-01")!;
    expect(nextCallUpDate("2027-04-01", "nat_a", [])).toBe(w.start);
    expect(nextCallUpDate("2028-04-01", "nat_a", [{ callUp: "2028-06-01", teams: ["nat_a"] }])).toBe("2028-06-01");
    expect(nextCallUpDate("2028-04-01", "nat_b", [{ callUp: "2028-06-01", teams: ["nat_a"] }])! > "2028-06-01").toBe(true);
  });

  test("call-up check", () => {
    const players = [...fill("GK", 3), ...fill("Defender", 8), ...fill("Midfielder", 7), ...fill("Forward", 7)];
    const cand = new Map(players.map((p) => [p.id, p]));
    const outfield = players.filter((p) => !p.id.includes("_GK_")).map((p) => p.id);
    expect(checkCallUp("x", cand)).toEqual({ ok: false, reason: "notList" });
    expect(checkCallUp([], cand)).toEqual({ ok: false, reason: "size" });
    expect(checkCallUp([outfield[0], outfield[0]], cand)).toEqual({ ok: false, reason: "duplicate" });
    expect(checkCallUp(["nope"], cand)).toEqual({ ok: false, reason: "notCandidate" });
    // 21 outfield players, no keeper: the generated players complete only 2 places → 2 goalkeepers, valid.
    expect(checkCallUp(outfield.slice(0, 21), cand).ok).toBe(true);
    // 22 outfield + 0 keepers: one generated keeper only.
    expect(checkCallUp(outfield.slice(0, 22), cand)).toEqual({ ok: false, reason: "goalkeepers" });
    expect(checkCallUp(players.slice(0, 23).map((p) => p.id), cand).ok).toBe(true);
  });

  test("taking and leaving the job keeps one coach per team and the club", () => {
    const managers: ManagerRecord[] = [
      { id: "player", name: "Me", squadId: "club1", isPlayer: true, points: 0, seasons: 0, titles: [], clubs: [{ squadId: "club1", from: "2027-01-01" }] },
      { id: "coach_nat_x_2027-06-01", name: "Interim", squadId: "nat_x", isPlayer: false, points: 0, seasons: 0, titles: [], interim: true },
      { id: "c2", name: "Other", squadId: "club2", isPlayer: false, points: 5, seasons: 1, titles: [] },
    ];
    const taken = takeNationalJob(managers, { teamId: "nat_x", date: "2027-06-05" });
    expect(taken.some((m) => m.squadId === "nat_x")).toBe(false);
    const me = taken.find((m) => m.isPlayer)!;
    expect(me.squadId).toBe("club1");
    expect(currentNationalTeam(me)).toBe("nat_x");
    const left = leaveNationalJob(taken, { teamId: "nat_x", nation: "X", date: "2028-07-01", left: "sacked" });
    const me2 = left.managers.find((m) => m.isPlayer)!;
    expect(currentNationalTeam(me2)).toBeNull();
    expect(me2.national?.[0]).toEqual({ squadId: "nat_x", from: "2027-06-05", to: "2028-07-01", left: "sacked" });
    expect(left.managers.filter((m) => m.squadId === "nat_x")).toHaveLength(1);
    expect(left.managers.find((m) => m.id === left.interimId)?.interim).toBe(true);
  });
});
