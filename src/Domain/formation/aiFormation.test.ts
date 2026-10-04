import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  aiFormationRecord,
  aiFormationScores,
  aiSeasonKey,
  chooseAiFormation,
  matchdayAiFormation,
  rosterSignature,
} from "@/Domain/formation/aiFormation";
import { AI_FORMATION } from "@/Domain/formation/aiFormationConfig";
import { FORMATION_IDS, formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { aptitudeFor } from "@/Domain/positions/positionAptitude";
import { getMainRole } from "@/Domain/roles";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";

const KEYS = ["passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling", "pressing",
  "stamina", "heading", "strength", "reflex", "jump"] as const;

function player(id: string, line: string, v: number): RosterPlayer {
  const stats = Object.fromEntries(KEYS.map((k) => [k, v])) as unknown as RosterPlayer["stats"];
  return {
    id, name: id, age: 25, squadId: "s", preferredFoot: "right", positions: [line], stats,
    profile: { summary: "", archetype: "" }, seasonLog: emptySeasonLog(),
  };
}

/** Flat-stat squad: `def`/`mid`/`fwd` = values of each line's players (best first). */
function squad(def: number[], mid: number[], fwd: number[]): Squad {
  const players = [
    player("gk1", "GK", 5), player("gk2", "GK", 4),
    ...def.map((v, i) => player(`d${i}`, "Defender", v)),
    ...mid.map((v, i) => player(`m${i}`, "Midfielder", v)),
    ...fwd.map((v, i) => player(`f${i}`, "Forward", v)),
  ];
  return { id: "club_x", name: "X", colors: ["#000", "#fff"], money: 0, players };
}

function lineCount(id: string, line: string): number {
  return slotRoles(formationForSimId(id)).filter((r) => getMainRole(r) === line).length;
}

const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

describe("aiSeasonKey", () => {
  test("cross-year leagues roll in July, calendar-year leagues in January", () => {
    expect(aiSeasonKey("premier_league", "2027-03-01")).toBe("2026");
    expect(aiSeasonKey("premier_league", "2026-08-20")).toBe("2026");
    expect(aiSeasonKey(undefined, "2026-08-20")).toBe("2026");
    expect(aiSeasonKey("brazil_serie_a", "2027-03-01")).toBe("2027");
    expect(aiSeasonKey("brazil_serie_a", "2027-11-01")).toBe("2027");
  });
});

describe("chooseAiFormation", () => {
  test("is deterministic", () => {
    const s = squad(flat(8, 5), flat(8, 5), flat(5, 5));
    expect(chooseAiFormation(s, "2026")).toEqual(chooseAiFormation(s, "2026"));
  });

  test("a squad strong at the back fields five defenders", () => {
    const s = squad([8, 8, 8, 8, 8, 4, 4, 4], flat(8, 5), flat(5, 5));
    expect(lineCount(chooseAiFormation(s, "2026").id, "Defender")).toBe(5);
  });

  test("a squad with three strong forwards fields three forwards", () => {
    const s = squad(flat(8, 5), flat(8, 5), [8, 8, 8, 4, 4]);
    expect(lineCount(chooseAiFormation(s, "2026").id, "Forward")).toBe(3);
  });

  test("a squad with two strong strikers and weak wide forwards fields two forwards", () => {
    const s = squad(flat(8, 5), flat(8, 5), [8, 8, 3, 3]);
    expect(lineCount(chooseAiFormation(s, "2026").id, "Forward")).toBe(2);
  });

  test("a midfield-heavy squad fields five midfielders", () => {
    const s = squad(flat(8, 5), [8, 8, 8, 8, 8, 4, 4, 4], flat(5, 5));
    expect(lineCount(chooseAiFormation(s, "2026").id, "Midfielder")).toBeGreaterThanOrEqual(5);
  });

  test("the style bonus can tip a close call", () => {
    const s = squad(flat(8, 5), flat(8, 5), flat(5, 5));
    const base = aiFormationScores(s, "2026", "balanced");
    const styled = aiFormationScores(s, "2026", "counter_attack");
    const id = "5-4-1";
    const d = styled.find((x) => x.id === id)!.score - base.find((x) => x.id === id)!.score;
    expect(d).toBeCloseTo(AI_FORMATION.STYLE_BONUS, 10);
  });

  test("a record carries a defensive alternative only for a non-defensive pick", () => {
    const s = squad(flat(8, 5), flat(8, 5), flat(5, 5));
    const r = chooseAiFormation(s, "2026");
    if (AI_FORMATION.DEFENSIVE.includes(r.id)) expect(r.defensive).toBeUndefined();
    else if (r.defensive) expect(AI_FORMATION.DEFENSIVE).toContain(r.defensive);
  });

  test("real squads never field an unsuitable starter when an alternative formation exists", () => {
    const dir = fileURLToPath(new URL("../../example_data/squads/premier_league/", import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const s = JSON.parse(readFileSync(dir + f, "utf8")) as Squad;
      const r = chooseAiFormation(s, "2026");
      expect(FORMATION_IDS).toContain(r.id);
      const formation = formationForSimId(r.id);
      const roles = slotRoles(formation);
      const byId = new Map(s.players.map((p) => [p.id, p]));
      autoLineupForFormation(s, formation).forEach((id, i) => {
        expect(aptitudeFor(byId.get(id)!, roles[i]!)).not.toBe("unsuitable");
      });
    }
  });
});

describe("aiFormationRecord", () => {
  test("keeps the stored record for the same season and roster, re-chooses otherwise", () => {
    const s = squad(flat(8, 5), flat(8, 5), flat(5, 5));
    const stored = { id: "4-4-2", season: "2026", roster: rosterSignature(s.players), level: 5 };
    const withRec: Squad = { ...s, aiFormation: stored };
    expect(aiFormationRecord(withRec, "2026")).toBe(stored);
    expect(aiFormationRecord(withRec, "2027").season).toBe("2027");
    const sold: Squad = { ...withRec, players: withRec.players.slice(1) };
    expect(aiFormationRecord(sold, "2026").roster).toBe(rosterSignature(sold.players));
  });
});

describe("matchdayAiFormation", () => {
  const rec = { id: "4-3-3", season: "2026", roster: 1, level: 4, defensive: "5-4-1" };
  test("plays the season pick unless the opponent is much stronger", () => {
    expect(matchdayAiFormation(rec, undefined)).toBe("4-3-3");
    expect(matchdayAiFormation(rec, 4 + AI_FORMATION.UNDERDOG_GAP - 0.01)).toBe("4-3-3");
    expect(matchdayAiFormation(rec, 4 + AI_FORMATION.UNDERDOG_GAP + 1e-9)).toBe("5-4-1");
    expect(matchdayAiFormation({ ...rec, defensive: undefined }, 9)).toBe("4-3-3");
  });
});
