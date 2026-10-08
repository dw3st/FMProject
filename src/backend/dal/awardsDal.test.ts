import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import type { ISaveDAL } from "@/backend/dal/ISaveDAL";
import type { AwardsYear, SeasonGoals } from "@/types/awardTypes";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

const fs = new FileSystemDAL();
const created: string[] = [];
afterAll(async () => { for (const id of created) await fs.deleteSave(id); });

const year = (y: number): AwardsYear => ({ year: y, leagues: [] });
const goals = (league: string, y: number): SeasonGoals => ({ league, year: y, goals: [] });

/** In-memory inner DAL with just the awards / season-goals methods. */
function fakeInner() {
  const awards = new Map<number, AwardsYear>();
  const sg = new Map<string, SeasonGoals>();
  const writes: string[] = [];
  const impl: Partial<ISaveDAL> = {
    async readAwardsYear(_s, y) { return awards.get(y) ?? null; },
    async writeAwardsYear(_s, a) { writes.push(`awards:${a.year}`); awards.set(a.year, a); },
    async listAwardYears() { return [...awards.keys()].sort((a, b) => a - b); },
    async readSeasonGoals(_s, l, y) { return sg.get(`${l}:${y}`) ?? null; },
    async writeSeasonGoals(_s, g) { writes.push(`goals:${g.league}:${g.year}`); sg.set(`${g.league}:${g.year}`, g); },
    async deleteSeasonGoals(_s, l, y) { writes.push(`del:${l}:${y}`); sg.delete(`${l}:${y}`); },
    async listSeasonGoalFiles() { return [...sg.values()].map((g) => ({ league: g.league, year: g.year })); },
  };
  return { inner: impl as ISaveDAL, awards, sg, writes };
}

describe("BufferingSaveDAL awards / season goals", () => {
  test("awards: read-your-write, nothing on disk until flush, listed while only buffered", async () => {
    const f = fakeInner();
    f.awards.set(2026, year(2026));
    const dal = new BufferingSaveDAL(f.inner);
    await dal.writeAwardsYear("s", year(2027));
    expect(await dal.readAwardsYear("s", 2027)).toEqual(year(2027));
    expect(f.writes).toEqual([]);
    expect(await dal.listAwardYears("s")).toEqual([2026, 2027]);
    await dal.flush();
    expect(f.writes).toEqual(["awards:2027"]);
  });
  test("season goals: write, list, tombstone hides them until the flush deletes them", async () => {
    const f = fakeInner();
    f.sg.set("pl:2026", goals("pl", 2026));
    const dal = new BufferingSaveDAL(f.inner);
    await dal.writeSeasonGoals("s", goals("pl", 2027));
    expect((await dal.listSeasonGoalFiles("s")).map((g) => `${g.league}:${g.year}`).sort()).toEqual(["pl:2026", "pl:2027"]);
    await dal.deleteSeasonGoals("s", "pl", 2026);
    expect(await dal.readSeasonGoals("s", "pl", 2026)).toBeNull();
    expect((await dal.listSeasonGoalFiles("s")).map((g) => `${g.league}:${g.year}`)).toEqual(["pl:2027"]);
    expect(f.writes).toEqual([]);
    await dal.flush();
    expect(f.writes.sort()).toEqual(["del:pl:2026", "goals:pl:2027"]);
    expect(f.sg.has("pl:2026")).toBe(false);
  });
});

describe("FileSystemDAL awards / season goals", () => {
  test("paths, missing year = null, years ascending, goal files listed, delete", async () => {
    const id = `test-awards-${randomUUID()}`;
    created.push(id);
    expect(await fs.readAwardsYear(id, 2027)).toBeNull();
    expect(await fs.listAwardYears(id)).toEqual([]);
    await fs.writeAwardsYear(id, year(2028));
    await fs.writeAwardsYear(id, year(2027));
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${id}/awards/2027.json`).exists()).toBe(true);
    expect(await fs.readAwardsYear(id, 2027)).toEqual(year(2027));
    expect(await fs.listAwardYears(id)).toEqual([2027, 2028]);
    await fs.writeSeasonGoals(id, goals("premier_league", 2026));
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${id}/seasonGoals/premier_league-2026.json`).exists()).toBe(true);
    expect(await fs.listSeasonGoalFiles(id)).toEqual([{ league: "premier_league", year: 2026 }]);
    expect(await fs.readSeasonGoals(id, "premier_league", 2026)).toEqual(goals("premier_league", 2026));
    await fs.deleteSeasonGoals(id, "premier_league", 2026);
    expect(await fs.readSeasonGoals(id, "premier_league", 2026)).toBeNull();
    await fs.deleteSeasonGoals(id, "premier_league", 2026); // missing: no throw
  });
  test("rejects an invalid league or year before building a path", async () => {
    await expect(fs.readSeasonGoals("x", "../evil", 2026)).rejects.toThrow();
    await expect(fs.readAwardsYear("x", 99999)).rejects.toThrow();
  });
});
