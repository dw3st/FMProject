import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { unlinkSync } from "fs";
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

describe("FileSystemDAL.listSquadFiles — vanished file", () => {
  test("a file deleted between the scan and the read is skipped, not an error", async () => {
    const saveId = `test-vanish-${randomUUID()}`;
    created.push(saveId);
    await dal.writeSquad(saveId, "lg", "33", { id: "33", name: "United", players: [] } as unknown as Squad);
    await dal.writeSquad(saveId, "lg", "34", { id: "34", name: "City", players: [] } as unknown as Squad);

    const realFile = Bun.file.bind(Bun);
    // Delete 33.json right before it is opened for reading — after the glob listed it.
    const spy = spyOn(Bun, "file").mockImplementation(((path: string, opts?: BlobPropertyBag) => {
      if (typeof path === "string" && /[\\/]lg[\\/]33\.json$/.test(path)) {
        try {
          unlinkSync(path);
        } catch {}
      }
      return realFile(path, opts);
    }) as typeof Bun.file);
    try {
      expect((await dal.listSquadFiles(saveId)).map((f) => f.clubSlug)).toEqual(["34"]);
    } finally {
      spy.mockRestore();
    }
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

describe("FileSystemDAL ledger", () => {
  test("readLedger on a save with no ledger file returns an empty array", async () => {
    const saveId = `test-ledger-missing-${randomUUID()}`;
    created.push(saveId);
    expect(await dal.readLedger(saveId, 2027)).toEqual([]);
  });

  test("appendLedger creates the file; a second append preserves the first entries", async () => {
    const saveId = `test-ledger-${randomUUID()}`;
    created.push(saveId);
    await dal.appendLedger(saveId, 2027, [
      { date: "2027-03-10", kind: "gate", amount: 1000, label: "a" },
    ]);
    await dal.appendLedger(saveId, 2027, [
      { date: "2027-03-17", kind: "wages", amount: -500, label: "b" },
    ]);

    const entries = await dal.readLedger(saveId, 2027);
    expect(entries.map((e) => e.label)).toEqual(["a", "b"]);
  });

  test("different seasons are stored separately", async () => {
    const saveId = `test-ledger-season-${randomUUID()}`;
    created.push(saveId);
    await dal.appendLedger(saveId, 2027, [{ date: "2027-03-10", kind: "gate", amount: 100, label: "y1" }]);
    await dal.appendLedger(saveId, 2028, [{ date: "2028-03-10", kind: "gate", amount: 200, label: "y2" }]);

    expect((await dal.readLedger(saveId, 2027)).map((e) => e.label)).toEqual(["y1"]);
    expect((await dal.readLedger(saveId, 2028)).map((e) => e.label)).toEqual(["y2"]);
  });

  test("appending an empty array does not create a file", async () => {
    const saveId = `test-ledger-empty-${randomUUID()}`;
    created.push(saveId);
    await dal.appendLedger(saveId, 2027, []);
    expect(await dal.readLedger(saveId, 2027)).toEqual([]);
  });
});
