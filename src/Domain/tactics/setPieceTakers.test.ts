import { describe, expect, test } from "bun:test";
import { parseSetPieceTakers } from "@/Domain/tactics/setPieceTakers";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { computeMatchSimulationLineups } from "@/Domain/advanceDay/matchSimulationLineups";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

describe("parseSetPieceTakers", () => {
  test("keeps the chosen duties, drops automatic ones", () => {
    expect(parseSetPieceTakers({ corners: "p1", freeKicks: "", penalties: null })).toEqual({ corners: "p1" });
    expect(parseSetPieceTakers({})).toEqual({});
    expect(parseSetPieceTakers(null)).toEqual({});
  });

  test("rejects unknown keys and wrong types", () => {
    expect(parseSetPieceTakers({ throwIns: "p1" })).toBeNull();
    expect(parseSetPieceTakers({ corners: 3 })).toBeNull();
    expect(parseSetPieceTakers("p1")).toBeNull();
    expect(parseSetPieceTakers(["p1"])).toBeNull();
  });
});

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

describe("set-piece takers reach the simulated match", () => {
  const home = loadSquad("33.json");
  const away = loadSquad("34.json");
  const fixture = { home: home.id, away: away.id, date: "2026-10-01", competition: "premier_league" } as unknown as Fixture;
  const tactics: TacticsSave = {
    formation: "4-3-3", tactical_style: "balanced", lineup: [],
    setPieceTakers: { corners: home.players[3]!.id },
  };

  test("only the user's side carries the takers; the AI stays automatic", () => {
    const asHome = computeMatchSimulationLineups(fixture, home, away, home.id, tactics);
    expect(asHome.tactics.A.setPieceTakers).toEqual({ corners: home.players[3]!.id });
    expect(asHome.tactics.B.setPieceTakers).toBeUndefined();
    const asAway = computeMatchSimulationLineups({ ...fixture, home: away.id, away: home.id } as Fixture, away, home, home.id, tactics);
    expect(asAway.tactics.B.setPieceTakers).toEqual({ corners: home.players[3]!.id });
    expect(asAway.tactics.A.setPieceTakers).toBeUndefined();
  });
});
