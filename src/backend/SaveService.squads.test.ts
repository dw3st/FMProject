import { describe, expect, spyOn, test } from "bun:test";
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
function memoryDAL(
  files: SquadFile[],
  opts: { failDelete?: () => boolean; failList?: () => boolean } = {},
): { dal: ISaveDAL; disk: Map<string, SquadFile>; lists: () => number } {
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
      if (opts.failDelete?.()) throw new Error(`EPERM: ${league}/${club}`);
      disk.delete(`${league}/${club}`);
      bumpSaveDataVersion(SAVE);
    },
    async listSquadFiles() {
      listCalls++;
      await Bun.sleep(1);
      if (opts.failList?.()) throw new Error("EIO: squads dir unreadable");
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

  test("a buffered move whose delete fails leaves both copies; the index keeps the moved one", async () => {
    // Promotion: championship → premier_league. The stale copy sorts FIRST and its
    // leagueSlug matches its folder (as FileSystemDAL's listing always reports), so
    // only membershipRev tells the moved copy apart.
    const promoted: SquadFile = {
      leagueSlug: "championship",
      clubSlug: "33",
      squad: { ...squad("33", "manchester_united", "United"), leagueSlug: "championship" },
    };
    const { dal, disk } = memoryDAL([promoted, files()[1]!], { failDelete: () => true });
    const buf = new BufferingSaveDAL(dal);
    await new SaveService(buf).moveSquad(SAVE, "33", "premier_league");
    await expect(buf.flush()).rejects.toBeInstanceOf(AggregateError);

    // Two copies on disk, never zero.
    expect([...disk.keys()].filter((k) => k.endsWith("/33")).sort()).toEqual(["championship/33", "premier_league/33"]);
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      const svc = new SaveService(dal);
      const index = await svc.getSquadIndex(SAVE);
      expect(index.byId("33")?.leagueSlug).toBe("premier_league");
      expect(index.duplicates()).toEqual([
        { squadId: "33", kept: { leagueSlug: "premier_league", stem: "33" }, dropped: [{ leagueSlug: "championship", stem: "33" }] },
      ]);
      expect(index.inLeague("championship")).toEqual([]);
      expect(await svc.getSquad(SAVE, "championship", "manchester_united")).toBeNull();
      expect((await svc.getSquad(SAVE, "premier_league", "manchester_united"))?.membershipRev).toBe(1);
      expect(err).toHaveBeenCalledTimes(1);
    } finally {
      err.mockRestore();
    }
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

  test("saveSquad of a moved club, addressed in its new league, overwrites the moved file", async () => {
    const { dal } = memoryDAL(files());
    const svc = new SaveService(dal);
    await svc.moveSquad(SAVE, "33", "championship");

    const s = (await svc.getSquad(SAVE, "championship", "manchester_united"))!;
    await svc.saveSquad(SAVE, "championship", "manchester_united", { ...s, name: "United v2" });

    const listed = (await dal.listSquadFiles(SAVE)).filter((f) => f.squad.id === "33");
    expect(listed.map((f) => `${f.leagueSlug}/${f.clubSlug}:${f.squad.name}`)).toEqual(["championship/33:United v2"]);
  });

  test("saveSquad of a moved club addressed in its OLD league throws and writes nothing", async () => {
    const { dal, disk } = memoryDAL(files());
    const svc = new SaveService(dal);
    const s = (await svc.getSquad(SAVE, "premier_league", "manchester_united"))!;
    await svc.moveSquad(SAVE, "33", "championship");

    await expect(svc.saveSquad(SAVE, "premier_league", "manchester_united", s)).rejects.toThrow(
      "saveSquad: squad 33 lives in championship, not premier_league — use moveSquad",
    );
    await expect(svc.saveSquad(SAVE, "premier_league", "33", s)).rejects.toThrow(/use moveSquad/);
    expect([...disk.keys()].filter((k) => k.endsWith("/33"))).toEqual(["championship/33"]);
  });

  test("saveSquad refuses to write a squad into another club's file", async () => {
    const { dal, disk } = memoryDAL(files());
    const svc = new SaveService(dal);
    const liverpool = disk.get("premier_league/40")!.squad;
    // "manchester_united" resolves to 33's file; writing squad 40 there would clobber it.
    await expect(svc.saveSquad(SAVE, "premier_league", "manchester_united", liverpool)).rejects.toThrow(
      /premier_league\/manchester_united is squad 33's file/,
    );
    // A new squad whose id is another club's stem is refused too.
    const legacy = { leagueSlug: "lg", clubSlug: "77", squad: squad("legacy_id", "legacy") };
    const svc2 = new SaveService(memoryDAL([legacy]).dal);
    await expect(svc2.saveSquad(SAVE, "lg", "newbie", squad("77", "newbie"))).rejects.toThrow(/lg\/77 is squad legacy_id's file/);
    expect(disk.get("premier_league/33")!.squad.id).toBe("33");
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

  test("saveSquadById writes where the club lives now (after a move), at its indexed stem", async () => {
    const { dal, disk } = memoryDAL([
      ...files(),
      { leagueSlug: "brazil_serie_a", clubSlug: "legacy_stem", squad: squad("77", "flamengo", "Flamengo") },
    ]);
    const svc = new SaveService(dal);
    await svc.moveSquad(SAVE, "33", "championship");

    // A squad object still carrying its old league must not land back in premier_league.
    const reset = { ...(await svc.getSquadById(SAVE, "33"))!, leagueSlug: "premier_league", players: [] };
    await svc.saveSquadById(SAVE, reset);
    expect([...disk.keys()].filter((k) => k.endsWith("/33"))).toEqual(["championship/33"]);
    expect(disk.get("championship/33")!.squad.leagueSlug).toBe("championship");

    await svc.saveSquadById(SAVE, { ...squad("77", "flamengo", "Flamengo"), money: 5 } as Squad);
    expect(disk.get("brazil_serie_a/legacy_stem")!.squad.money).toBe(5);
    expect(disk.has("brazil_serie_a/77")).toBe(false);
  });

  test("saveSquadById of an unknown id throws and writes nothing", async () => {
    const { dal, disk } = memoryDAL(files());
    const svc = new SaveService(dal);
    const before = [...disk.keys()].sort();
    await expect(svc.saveSquadById(SAVE, squad("nope"))).rejects.toThrow(/nope/);
    expect([...disk.keys()].sort()).toEqual(before);
  });

  test("dropSquadIndex forces the next read to re-list the save", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(mem.dal);
    await svc.getSquadIndex(SAVE);
    await svc.getSquadIndex(SAVE);
    expect(mem.lists()).toBe(1);
    svc.dropSquadIndex(SAVE);
    await svc.getSquadIndex(SAVE);
    expect(mem.lists()).toBe(2);
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

describe("SaveService squad index with a duplicated squad file", () => {
  test("the save still loads, the duplicate is logged, and reads use the kept copy", async () => {
    const dup = files();
    dup.push({ leagueSlug: "championship", clubSlug: "33", squad: squad("33", "manchester_united", "United (stray)") });
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      const svc = new SaveService(memoryDAL(dup).dal);
      const index = await svc.getSquadIndex(SAVE);
      expect(index.byId("33")?.leagueSlug).toBe("championship"); // sorted first: championship/33
      expect(index.duplicates().map((d) => d.squadId)).toEqual(["33"]);
      expect(err).toHaveBeenCalledTimes(1);
      expect(String(err.mock.calls[0]![0])).toBe("[squadIndex]");
      expect((await svc.getSquadById(SAVE, "40"))?.name).toBe("Liverpool");
    } finally {
      err.mockRestore();
    }
  });
});

describe("SaveService.getSquadIndex — shared in-flight build", () => {
  test("concurrent callers share one listing and get the same index", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(mem.dal);
    const [a, b, c] = await Promise.all([svc.getSquadIndex(SAVE), svc.getSquadIndex(SAVE), svc.getSquadIndex(SAVE)]);
    expect(mem.lists()).toBe(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
    await svc.getSquadIndex(SAVE); // cached afterwards
    expect(mem.lists()).toBe(1);
  });

  test("parallel saveSquad calls of indexed squads list once", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(mem.dal);
    const united = mem.disk.get("premier_league/33")!.squad;
    const pool = mem.disk.get("premier_league/40")!.squad;
    await Promise.all([
      svc.saveSquad(SAVE, "premier_league", "33", { ...united }),
      svc.saveSquad(SAVE, "premier_league", "40", { ...pool }),
    ]);
    expect(mem.lists()).toBe(1);
  });

  test("a failed build is not shared or cached — the next call retries", async () => {
    let failing = true;
    const mem = memoryDAL(files(), { failList: () => failing });
    const svc = new SaveService(mem.dal);
    const both = await Promise.allSettled([svc.getSquadIndex(SAVE), svc.getSquadIndex(SAVE)]);
    expect(both.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(mem.lists()).toBe(1);

    failing = false;
    expect((await svc.getSquadIndex(SAVE)).byId("33")?.leagueSlug).toBe("premier_league");
    expect(mem.lists()).toBe(2);
  });

  test("a build that was listing when the index was dropped is not cached", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(new BufferingSaveDAL(mem.dal)); // buffered: no version bump on write
    const stale = svc.getSquadIndex(SAVE);
    await svc.saveSquad(SAVE, "premier_league", "newcastle", squad("34", "newcastle")); // drops the index
    await stale;
    expect((await svc.getSquadIndex(SAVE)).byId("34")?.leagueSlug).toBe("premier_league");
  });
});

describe("SaveService.addNewSquads (/import-squads)", () => {
  test("writes only squads new to the save, and lists the save once before + once after", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(mem.dal);
    await svc.moveSquad(SAVE, "33", "championship");
    const listsBefore = mem.lists();

    const written = await svc.addNewSquads(SAVE, [
      { leagueSlug: "premier_league", stem: "33", squad: squad("33", "manchester_united") }, // moved → not resurrected
      { leagueSlug: "premier_league", stem: "40", squad: squad("40", "liverpool") }, // already there
      { leagueSlug: "premier_league", stem: "34", squad: squad("34", "newcastle") },
      { leagueSlug: "la_liga", stem: "34", squad: squad("34", "newcastle") }, // same id twice in the import
      { leagueSlug: "la_liga", stem: "541", squad: squad("541", "real_madrid") },
    ]);

    expect(written).toBe(2);
    expect(mem.lists() - listsBefore).toBe(1);
    expect([...mem.disk.keys()].sort()).toEqual([
      "championship/33",
      "la_liga/541",
      "of_x/of_club",
      "premier_league/34",
      "premier_league/40",
    ]);
    const index = await svc.getSquadIndex(SAVE);
    expect(mem.lists() - listsBefore).toBe(2);
    expect(index.byId("541")?.leagueSlug).toBe("la_liga");
  });

  test("nothing new keeps the cached index", async () => {
    const mem = memoryDAL(files());
    const svc = new SaveService(mem.dal);
    expect(await svc.addNewSquads(SAVE, [{ leagueSlug: "premier_league", stem: "40", squad: squad("40") }])).toBe(0);
    await svc.getSquadIndex(SAVE);
    expect(mem.lists()).toBe(1);
  });
});
