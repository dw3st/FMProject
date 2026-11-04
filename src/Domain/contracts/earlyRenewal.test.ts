import { describe, expect, test } from "bun:test";
import { CONTRACT_CONFIG as C } from "@/Domain/contracts/contractConfig";
import { earlyRenewalDue, earlyRenewals } from "@/Domain/contracts/earlyRenewal";
import { addDays } from "@/Domain/dates";
import { emptySeasonLog } from "@/types/playerTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const DATE = "2030-12-05";
const STATS = (n: number) => ({ finishing: n, dribbling: n, speed: n, acceleration: n, strength: n, stamina: n, passing: n, vision: n, tackling: n, pressing: n, heading: n, jump: n, reflex: n });
function player(i: number, level: number, until: string, age = 25): RosterPlayer {
  return { id: `p${i}`, name: `P${i}`, age, positions: ["Midfielder"], stats: STATS(level), seasonLog: emptySeasonLog(), contract: { until, wage: 1000 } } as unknown as RosterPlayer;
}
function squad(players: RosterPlayer[]): Squad {
  return { id: "club", name: "Club", players, finances: { budget: 0, broadcasting: 2e8, commercial: 2e8, total: 4e8, followers: 1e7 }, wageFactor: 0.01, wageRevenueBasis: 4e8 } as unknown as Squad;
}
const SOON = addDays(DATE, 150);
const LATER = addDays(DATE, 900);

describe("early renewals of key players", () => {
  test("most key players in the last year sign; the contract moves forward", () => {
    const players = [...Array.from({ length: 11 }, (_, i) => player(i, 7, SOON)), ...Array.from({ length: 10 }, (_, i) => player(i + 11, 3, LATER))];
    const { renewed } = earlyRenewals(squad(players), DATE);
    expect(renewed.length).toBeGreaterThanOrEqual(7);
    expect(renewed.length).toBeLessThanOrEqual(11);
    for (const p of renewed) expect(p.contract!.until > SOON).toBe(true);
  });

  test("not key, too old, on loan, far from the end or already gone to a pre-contract: untouched", () => {
    const stars = Array.from({ length: 11 }, (_, i) => player(i, 7, LATER));
    const reserve = player(20, 3, SOON);
    const veteran = { ...player(21, 8, SOON, 34) };
    const loaned = { ...player(22, 8, SOON), loan: { fromClubId: "x", fromClubName: "X", until: SOON, wageShare: 50 } };
    expect(earlyRenewals(squad([...stars, reserve, veteran, loaned]), DATE).renewed).toEqual([]);
    const signed = player(23, 9, SOON);
    expect(earlyRenewals(squad([signed]), DATE, new Set(["p23"])).renewed).toEqual([]);
  });

  test("the answer is fixed for a contract, and every club looks once per cycle", () => {
    const players = Array.from({ length: 11 }, (_, i) => player(i, 7, SOON));
    const a = earlyRenewals(squad(players), DATE).renewed.map((p) => p.id);
    expect(earlyRenewals(squad(players), addDays(DATE, 28)).renewed.map((p) => p.id)).toEqual(a);
    let hits = 0;
    for (let d = 0; d < C.EARLY_RENEW_CYCLE_DAYS; d++) if (earlyRenewalDue("club", addDays(DATE, d))) hits++;
    expect(hits).toBe(1);
  });

  test("no renewal over the wage cap", () => {
    const players = Array.from({ length: 11 }, (_, i) => player(i, 7, SOON));
    const poor = { ...squad(players), wageRevenueBasis: 1000 };
    expect(earlyRenewals(poor, DATE).renewed).toEqual([]);
  });
});
