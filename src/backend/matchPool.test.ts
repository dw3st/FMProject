import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { defaultPoolSize, matchPoolStats, runFullMatch, setMatchPoolSize } from "@/backend/matchPool";
import { runFullMatchJob, type FullMatchJob } from "@/backend/matchPoolJob";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import type { MatchSimResult } from "@/Domain/advanceDay/matches";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
function job(homeFile: string, awayFile: string, seed: number): FullMatchJob {
  const home = loadSquad(homeFile);
  const away = loadSquad(awayFile);
  const fixture = { id: `fx-${seed}`, date: "2027-02-05", competition: "premier_league", round: 1, home: home.id, away: away.id } as Fixture;
  return {
    fixture, home, away, seed,
    sim: {
      homeFormation: formation, homeLineup: autoLineupDefaultFormation(home),
      awayFormation: formation, awayLineup: autoLineupDefaultFormation(away),
    },
  };
}
/** The wall time of the match is the only field that may differ. */
const comparable = (r: MatchSimResult) => ({ ...r, event: { ...r.event, durationMs: 0 } });

afterAll(() => setMatchPoolSize(null));

describe("match pool", () => {
  test("2 to 4 workers by the cores", () => {
    expect(defaultPoolSize(1)).toBe(2);
    expect(defaultPoolSize(8)).toBe(2);
    expect(defaultPoolSize(12)).toBe(4);
    expect(defaultPoolSize(64)).toBe(4);
  });

  test("matches in workers, in parallel, give exactly the results of the same matches in series", async () => {
    const jobs = [job("33.json", "34.json", 11), job("40.json", "42.json", 12), job("47.json", "49.json", 13)];
    const serial = jobs.map((j) => comparable(runFullMatchJob(structuredClone(j)).result));
    setMatchPoolSize(2);
    const before = matchPoolStats().jobs;
    const pooled = (await Promise.all(jobs.map((j) => runFullMatch(j)))).map(comparable);
    expect(matchPoolStats().jobs - before).toBe(3);
    expect(pooled).toEqual(serial);
  }, 120_000);

  test("size 0 runs in process", async () => {
    setMatchPoolSize(0);
    const j = job("33.json", "34.json", 21);
    const a = comparable(await runFullMatch(structuredClone(j)));
    const b = comparable(runFullMatchJob(j).result);
    expect(a).toEqual(b);
  }, 60_000);
});
