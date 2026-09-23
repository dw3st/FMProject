import { describe, expect, test } from "bun:test";
import { BufferingSaveDAL, FLUSH_CONCURRENCY } from "@/backend/dal/BufferingSaveDAL";
import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import type { Squad } from "@/types/playerTypes";

const SAVE = "save-1";

function squad(id: string, name = id): Squad {
  return { id, name, slug: `slug_${id}`, players: [] } as unknown as Squad;
}

/**
 * Fake inner DAL: records every call, serves squads from an in-memory "disk", and
 * lets a test control write latency / failures. Any method not implemented throws.
 */
function fakeInner(opts: {
  files?: SquadFile[];
  writeDelayMs?: number;
  failWrite?: (clubSlug: string) => boolean;
} = {}) {
  const calls: string[] = [];
  const written: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const disk = new Map((opts.files ?? []).map((f) => [`${f.leagueSlug}/${f.clubSlug}`, f]));

  const impl: Partial<ISaveDAL> = {
    async listSquadFiles() {
      calls.push("listSquadFiles");
      return Array.from(disk.values());
    },
    async listAllSquads() {
      calls.push("listAllSquads");
      return Array.from(disk.values()).map((f) => f.squad);
    },
    async listSquadsInLeague(_s, league) {
      calls.push("listSquadsInLeague");
      return Array.from(disk.values()).filter((f) => f.leagueSlug === league).map((f) => f.squad);
    },
    async readSquad(_s, league, club) {
      calls.push(`readSquad:${league}/${club}`);
      return disk.get(`${league}/${club}`)?.squad ?? null;
    },
    async squadExists(_s, league, club) {
      calls.push(`squadExists:${league}/${club}`);
      return disk.has(`${league}/${club}`);
    },
    async writeSquad(_s, league, club, sq) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await Bun.sleep(opts.writeDelayMs ?? 1);
        if (opts.failWrite?.(club)) throw new Error(`disk full: ${club}`);
        written.push(`${league}/${club}:${sq.name}`);
      } finally {
        inFlight--;
      }
    },
  };
  const dal = new Proxy(impl, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (v) return v;
      return () => {
        throw new Error(`fake inner DAL: ${String(prop)} not implemented`);
      };
    },
  }) as ISaveDAL;
  return { dal, calls, written, maxInFlight: () => maxInFlight };
}

describe("BufferingSaveDAL.flush", () => {
  test("writes every pending resource exactly once, with only its final value", async () => {
    const inner = fakeInner();
    const buf = new BufferingSaveDAL(inner.dal);
    for (let i = 0; i < 100; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`, "v1"));
    // Re-write half of them: only the final value may reach the inner DAL.
    for (let i = 0; i < 50; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`, "v2"));

    await buf.flush();

    expect(inner.written).toHaveLength(100);
    expect(new Set(inner.written).size).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(inner.written).toContain(`lg/c${i}:${i < 50 ? "v2" : "v1"}`);
    }
    // Nothing left pending: a second flush writes nothing.
    await buf.flush();
    expect(inner.written).toHaveLength(100);
  });

  test(`runs at most FLUSH_CONCURRENCY (${FLUSH_CONCURRENCY}) writes at once`, async () => {
    const inner = fakeInner({ writeDelayMs: 5 });
    const buf = new BufferingSaveDAL(inner.dal);
    for (let i = 0; i < FLUSH_CONCURRENCY * 4; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`));

    await buf.flush();

    expect(inner.written).toHaveLength(FLUSH_CONCURRENCY * 4);
    expect(inner.maxInFlight()).toBeLessThanOrEqual(FLUSH_CONCURRENCY);
    expect(inner.maxInFlight()).toBeGreaterThan(1); // actually parallel
  });

  test("a failing write throws one aggregated error after the other writes complete", async () => {
    const inner = fakeInner({ failWrite: (club) => club === "c3" || club === "c7" });
    const buf = new BufferingSaveDAL(inner.dal);
    for (let i = 0; i < 20; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`));

    let caught: unknown;
    try {
      await buf.flush();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(2);
    // Every other write still landed before the throw.
    expect(inner.written).toHaveLength(18);
    expect(inner.written).not.toContain("lg/c3:c3");
    expect(inner.written).not.toContain("lg/c7:c7");
  });
});

describe("BufferingSaveDAL squad reads", () => {
  const files: SquadFile[] = [
    { leagueSlug: "lg", clubSlug: "33", squad: squad("33", "United") },
    { leagueSlug: "lg", clubSlug: "34", squad: squad("34", "City") },
    { leagueSlug: "other", clubSlug: "of_x", squad: squad("of_x", "X") },
  ];
  const innerSquadCalls = (calls: string[]) =>
    calls.filter((c) => /^(listSquadFiles|listAllSquads|listSquadsInLeague|readSquad|squadExists)/.test(c));

  test("listAllSquads then readSquad touches the inner DAL once", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    const all = await buf.listAllSquads(SAVE);
    const one = await buf.readSquad(SAVE, "lg", "33");

    expect(all.map((s) => s.id)).toEqual(["33", "34", "of_x"]);
    expect(one?.name).toBe("United");
    expect(one).toBe(all[0]!); // same object — one cache
    expect(innerSquadCalls(inner.calls)).toEqual(["listSquadFiles"]);
  });

  test("readSquad then listAllSquads, slug-probe misses, exists and per-league reads stay in memory", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    // Concurrent first reads share one load (both sides of a fixture).
    const [a, b] = await Promise.all([buf.readSquad(SAVE, "lg", "33"), buf.readSquad(SAVE, "lg", "34")]);
    // SaveService.getSquad probes {slug}.json first: a miss, answered from memory.
    expect(await buf.readSquad(SAVE, "lg", "slug_33")).toBeNull();
    expect(await buf.squadExists(SAVE, "lg", "slug_33")).toBe(false);
    expect(await buf.squadExists(SAVE, "lg", "34")).toBe(true);
    expect((await buf.listSquadsInLeague(SAVE, "other")).map((s) => s.id)).toEqual(["of_x"]);
    const all = await buf.listAllSquads(SAVE);

    expect(all[0]).toBe(a!);
    expect(all[1]).toBe(b!);
    expect(innerSquadCalls(inner.calls)).toEqual(["listSquadFiles"]);
  });

  test("buffered writes overlay every read path; new files are listed; nothing hits disk before flush", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.writeSquad(SAVE, "lg", "34", squad("34", "City v2"));
    await buf.writeSquad(SAVE, "lg", "99", squad("99", "Newcomer"));

    expect((await buf.readSquad(SAVE, "lg", "34"))?.name).toBe("City v2");
    expect(await buf.squadExists(SAVE, "lg", "99")).toBe(true);
    expect((await buf.listAllSquads(SAVE)).map((s) => s.name)).toEqual(["United", "City v2", "X", "Newcomer"]);
    expect((await buf.listSquadsInLeague(SAVE, "lg")).map((s) => s.name)).toEqual(["United", "City v2", "Newcomer"]);
    expect(inner.written).toHaveLength(0);

    await buf.flush();
    expect(inner.written.sort()).toEqual(["lg/34:City v2", "lg/99:Newcomer"]);
  });
});
