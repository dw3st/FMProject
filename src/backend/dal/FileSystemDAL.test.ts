import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import type { Squad } from "@/types/playerTypes";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";

const dal = new FileSystemDAL();
const created: string[] = [];

afterAll(async () => {
  for (const id of created) await dal.deleteSave(id);
});

describe("FileSystemDAL squad listing", () => {
  test("a save without a squads dir lists no squads", async () => {
    const saveId = `test-missing-${randomUUID()}`;
    expect(await dal.listSquadFiles(saveId)).toEqual([]);
    expect(await dal.listAllSquads(saveId)).toEqual([]);
  });

  test("listSquadFiles returns league + club stem for every written squad; listAllSquads matches", async () => {
    const saveId = `test-squads-${randomUUID()}`;
    created.push(saveId);
    const squads: Array<[string, string]> = [];
    for (let i = 0; i < 40; i++) squads.push([i % 2 ? "lg_a" : "of_b", `c${i}`]);
    for (const [league, club] of squads) {
      await dal.writeSquad(saveId, league, club, { id: club, name: `Club ${club}`, players: [] } as unknown as Squad);
    }

    const files = await dal.listSquadFiles(saveId);
    expect(files).toHaveLength(40);
    for (const f of files) {
      expect(f.squad.id).toBe(f.clubSlug);
      expect(f.squad.leagueSlug).toBe(f.leagueSlug);
    }
    expect(files.map((f) => `${f.leagueSlug}/${f.clubSlug}`).sort()).toEqual(squads.map(([l, c]) => `${l}/${c}`).sort());

    const all = await dal.listAllSquads(saveId);
    expect(all.map((s) => `${s.leagueSlug}/${s.id}`)).toEqual(files.map((f) => `${f.leagueSlug}/${f.clubSlug}`));
  });
});

describe("FileSystemDAL.deleteSquad", () => {
  test("removes the file; listSquadFiles no longer lists it; version bumps", async () => {
    const saveId = `test-delete-${randomUUID()}`;
    created.push(saveId);
    await dal.writeSquad(saveId, "lg", "33", { id: "33", name: "United", players: [] } as unknown as Squad);
    await dal.writeSquad(saveId, "lg", "34", { id: "34", name: "City", players: [] } as unknown as Squad);
    const before = getSaveDataVersion(saveId);

    await dal.deleteSquad(saveId, "lg", "33");

    expect(await dal.squadExists(saveId, "lg", "33")).toBe(false);
    expect(await dal.readSquad(saveId, "lg", "33")).toBeNull();
    expect((await dal.listSquadFiles(saveId)).map((f) => f.clubSlug)).toEqual(["34"]);
    expect(getSaveDataVersion(saveId)).toBeGreaterThan(before);
  });

  test("deleting a missing squad does not throw", async () => {
    const saveId = `test-delete-missing-${randomUUID()}`;
    await dal.deleteSquad(saveId, "lg", "nope");
  });
});
