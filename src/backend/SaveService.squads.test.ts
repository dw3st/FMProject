import { describe, expect, test } from "bun:test";
import { SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import type { Squad } from "@/types/playerTypes";
import { bumpSaveDataVersion } from "@/backend/dal/saveDataVersion";

const SAVE = "save-1";

function squad(id: string, slug?: string, name = id): Squad {
  return { id, name, slug, colors: ["#000", "#fff"], players: [] } as unknown as Squad;
}

/** In-memory ISaveDAL covering the squad surface; any other method throws. */
function memoryDAL(files: SquadFile[]): { dal: ISaveDAL; disk: Map<string, SquadFile>; lists: () => number } {
  let listCalls = 0;
  const disk = new Map(files.map((f) => [`${f.leagueSlug}/${f.clubSlug}`, f]));
  const impl: Partial<ISaveDAL> = {
    async readSquad(_s, league, club) {
      return disk.get(`${league}/${club}`)?.squad ?? null;
    },
    async writeSquad(_s, league, club, sq) {
      disk.set(`${league}/${club}`, { leagueSlug: league, clubSlug: club, squad: { ...sq, leagueSlug: league } });
      bumpSaveDataVersion(SAVE); // like FileSystemDAL
    },
    async squadExists(_s, league, club) {
      return disk.has(`${league}/${club}`);
    },
    async deleteSquad(_s, league, club) {
      disk.delete(`${league}/${club}`);
      bumpSaveDataVersion(SAVE);
    },
    async listSquadFiles() {
      listCalls++;
      return Array.from(disk.values());
    },
    async listLeagues() {
      return [...new Set(Array.from(disk.values()).map((f) => f.leagueSlug))];
    },
  };
  const dal = new Proxy(impl, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (v) return v;
      return () => {
        throw new Error(`memory DAL: ${String(prop)} not implemented`);
      };
    },
  }) as ISaveDAL;
  return { dal, disk, lists: () => listCalls };
}

const files = (): SquadFile[] => [
  { leagueSlug: "premier_league", clubSlug: "33", squad: squad("33", "manchester_united", "United") },
  { leagueSlug: "premier_league", clubSlug: "40", squad: squad("40", "liverpool", "Liverpool") },
  { leagueSlug: "of_x", clubSlug: "of_club", squad: squad("of_club", "of_club", "OF") },
];

describe("SaveService squads via per-save index", () => {
  test("getSquad by slug and by id of a native club", async () => {
    const svc = new SaveService(memoryDAL(files()).dal);
    expect((await svc.getSquad(SAVE, "premier_league", "manchester_united"))?.id).toBe("33");
    expect((await svc.getSquad(SAVE, "premier_league", "33"))?.id).toBe("33");
    expect(await svc.getSquad(SAVE, "la_liga", "manchester_united")).toBeNull();
    expect(await svc.squadExists(SAVE, "premier_league", "manchester_united")).toBe(true);
    expect(await svc.squadExists(SAVE, "la_liga", "manchester_united")).toBe(false);
  });

  test("after moveSquad, the new league finds the club by slug and the old one does not", async () => {
    const { dal } = memoryDAL(files());
    const svc = new SaveService(dal);

    await svc.moveSquad(SAVE, "33", "championship");

    const moved = await svc.getSquad(SAVE, "championship", "manchester_united");
    expect(moved?.id).toBe("33");
    expect(moved?.leagueSlug).toBe("championship");
    expect(await svc.getSquad(SAVE, "premier_league", "manchester_united")).toBeNull();
    expect(await svc.getSquad(SAVE, "premier_league", "33")).toBeNull();
    const listed = (await dal.listSquadFiles(SAVE)).filter((f) => f.squad.id === "33");
    expect(listed.map((f) => `${f.leagueSlug}/${f.clubSlug}`)).toEqual(["championship/33"]);
  });

  test("moveSquad works through the BufferingSaveDAL (tombstone + write) and flushes as a move", async () => {
    const { dal, disk } = memoryDAL(files());
    const buf = new BufferingSaveDAL(dal);
    const svc = new SaveService(buf);

    await svc.moveSquad(SAVE, "33", "championship");
    expect((await svc.getSquad(SAVE, "championship", "manchester_united"))?.leagueSlug).toBe("championship");
    expect(await svc.getSquad(SAVE, "premier_league", "manchester_united")).toBeNull();

    await buf.flush();
    expect([...disk.keys()].sort()).toEqual(["championship/33", "of_x/of_club", "premier_league/40"]);
  });

  test("moveSquad into the league it is already in is a no-op", async () => {
    const { dal, disk } = memoryDAL(files());
    const svc = new SaveService(dal);
    const before = disk.get("premier_league/33");
    await svc.moveSquad(SAVE, "33", "premier_league");
    expect(disk.get("premier_league/33")).toBe(before!);
  });

  test("moveSquad of an unknown id throws", async () => {
    const svc = new SaveService(memoryDAL(files()).dal);
    await expect(svc.moveSquad(SAVE, "nope", "championship")).rejects.toThrow(/nope/);
  });

  test("saveSquad of a moved club does not create a duplicate file", async () => {
    const { dal } = memoryDAL(files());
    const svc = new SaveService(dal);
    await svc.moveSquad(SAVE, "33", "championship");

    const s = (await svc.getSquad(SAVE, "championship", "manchester_united"))!;
    await svc.saveSquad(SAVE, "championship", "manchester_united", { ...s, name: "United v2" });

    const listed = (await dal.listSquadFiles(SAVE)).filter((f) => f.squad.id === "33");
    expect(listed.map((f) => `${f.leagueSlug}/${f.clubSlug}:${f.squad.name}`)).toEqual(["championship/33:United v2"]);
  });

  test("saveSquad of a new squad uses squad.id as the stem, never the slug", async () => {
    const { dal, disk } = memoryDAL(files());
    const svc = new SaveService(dal);
    await svc.saveSquad(SAVE, "premier_league", "newcastle", squad("34", "newcastle"));
    expect(disk.has("premier_league/34")).toBe(true);
    expect(disk.has("premier_league/newcastle")).toBe(false);
  });

  test("getSquadById", async () => {
    const svc = new SaveService(memoryDAL(files()).dal);
    expect((await svc.getSquadById(SAVE, "40"))?.name).toBe("Liverpool");
    expect(await svc.getSquadById(SAVE, "nope")).toBeNull();
  });

  test("resolveSquadId returns league + file stem", async () => {
    const svc = new SaveService(memoryDAL(files()).dal);
    expect(await svc.resolveSquadId(SAVE, "33")).toEqual({ leagueSlug: "premier_league", clubSlug: "33" });
    expect(await svc.resolveSquadId(SAVE, "of_club")).toEqual({ leagueSlug: "of_x", clubSlug: "of_club" });
    expect(await svc.resolveSquadId(SAVE, "nope")).toBeNull();
  });
});

describe("SaveService squad index cache", () => {
  test("overwriting an indexed squad keeps the cached index (no re-list)", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(mem.dal);
    const s = (await svc.getSquad(SAVE, "premier_league", "33"))!;
    for (let i = 0; i < 5; i++) {
      await svc.saveSquad(SAVE, "premier_league", "33", { ...s, players: [] });
      await svc.getSquad(SAVE, "premier_league", "manchester_united");
    }
    expect(mem.lists()).toBe(1);
  });

  test("a new squad file drops the cached index", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(mem.dal);
    await svc.getSquad(SAVE, "premier_league", "33");
    await svc.saveSquad(SAVE, "premier_league", "newcastle", squad("34", "newcastle"));
    expect((await svc.getSquad(SAVE, "premier_league", "newcastle"))?.id).toBe("34");
    expect(mem.lists()).toBe(2);
  });

  test("a move made by another instance is seen (data version bumped)", async () => {
    const mem = memoryDAL(files());
    const reader = new SaveService(mem.dal);
    const writer = new SaveService(mem.dal);
    expect((await reader.getSquad(SAVE, "premier_league", "manchester_united"))?.id).toBe("33");

    await writer.moveSquad(SAVE, "33", "championship");

    expect(await reader.getSquad(SAVE, "premier_league", "manchester_united")).toBeNull();
    expect((await reader.getSquad(SAVE, "championship", "manchester_united"))?.id).toBe("33");
  });
});
