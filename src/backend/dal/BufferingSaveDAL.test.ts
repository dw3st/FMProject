import { describe, expect, test } from "bun:test";
import { BufferingSaveDAL, FLUSH_CONCURRENCY } from "@/backend/dal/BufferingSaveDAL";
import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import type { Squad } from "@/types/playerTypes";
import type { SaveMeta } from "@/backend/SaveService";
import type { InboxMessage } from "@/types/inboxTypes";

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
  /** Checked at write time, so a test can flip it between flushes. */
  failWrite?: (clubSlug: string) => boolean;
  /** Holds a squad write in flight until the returned promise resolves. */
  gateWrite?: (clubSlug: string) => Promise<void> | undefined;
  /** Checked at delete time. */
  failDelete?: (clubSlug: string) => boolean;
  /** Number of initial listSquadFiles calls that reject. */
  failListSquadFiles?: number;
} = {}) {
  const calls: string[] = [];
  const written: string[] = [];
  const writtenSquads: SquadFile[] = [];
  /** Completed writes of any resource, in completion order ("squad:lg/c1", "meta:save-1", "inbox"). */
  const order: string[] = [];
  const inboxWrites: InboxMessage[][] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let listFailures = opts.failListSquadFiles ?? 0;
  const disk = new Map((opts.files ?? []).map((f) => [`${f.leagueSlug}/${f.clubSlug}`, f]));

  const impl: Partial<ISaveDAL> = {
    async listSquadFiles() {
      calls.push("listSquadFiles");
      await Bun.sleep(0);
      if (listFailures > 0) {
        listFailures--;
        throw new Error("EIO: squads dir unreadable");
      }
      return Array.from(disk.values());
    },
    async readMeta() {
      return null;
    },
    async writeMeta(meta) {
      await Bun.sleep(opts.writeDelayMs ?? 1);
      order.push(`meta:${meta.id}`);
    },
    async readInbox() {
      calls.push("readInbox");
      return [];
    },
    async writeInbox(_s, messages) {
      await Bun.sleep(opts.writeDelayMs ?? 1);
      inboxWrites.push(messages);
      order.push("inbox");
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
    async deleteSquad(_s, league, club) {
      await Bun.sleep(opts.writeDelayMs ?? 1);
      calls.push(`deleteSquad:${league}/${club}`);
      if (opts.failDelete?.(club)) throw new Error(`EPERM: ${league}/${club}`);
      order.push(`delete:${league}/${club}`);
    },
    async listLeagues() {
      calls.push("listLeagues");
      return [...new Set(Array.from(disk.values()).map((f) => f.leagueSlug))];
    },
    async writeSquad(_s, league, club, sq) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await Bun.sleep(opts.writeDelayMs ?? 1);
        await opts.gateWrite?.(club);
        if (opts.failWrite?.(club)) throw new Error(`disk full: ${club}`);
        written.push(`${league}/${club}:${sq.name}`);
        writtenSquads.push({ leagueSlug: league, clubSlug: club, squad: sq });
        order.push(`squad:${league}/${club}`);
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
  return { dal, calls, written, writtenSquads, order, inboxWrites, maxInFlight: () => maxInFlight };
}

const meta = (id: string) => ({ id, currentDate: "2024-08-16" }) as unknown as SaveMeta;
const message = (id: string) => ({ id, subject: id }) as unknown as InboxMessage;

describe("BufferingSaveDAL.flush — meta last", () => {
  test("save meta is written only after every other pending write has completed", async () => {
    const inner = fakeInner({ writeDelayMs: 3 });
    const buf = new BufferingSaveDAL(inner.dal);
    await buf.writeMeta(meta(SAVE)); // buffered FIRST, still written last
    for (let i = 0; i < 40; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`));
    await buf.appendInboxMessage(SAVE, message("m1"));

    await buf.flush();

    expect(inner.order).toHaveLength(42);
    expect(inner.order.at(-1)).toBe(`meta:${SAVE}`);
    expect(inner.order.indexOf(`meta:${SAVE}`)).toBe(41);
  });

  test("when a non-meta write fails, meta is not written and stays pending", async () => {
    let failing = true;
    const inner = fakeInner({ failWrite: (club) => failing && club === "c2" });
    const buf = new BufferingSaveDAL(inner.dal);
    await buf.writeMeta(meta(SAVE));
    for (let i = 0; i < 5; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`));

    await expect(buf.flush()).rejects.toBeInstanceOf(AggregateError);
    expect(inner.order).not.toContain(`meta:${SAVE}`);
    expect(inner.written).toHaveLength(4);

    // Still pending: once the disk recovers, the next flush writes c2 and THEN meta.
    failing = false;
    await buf.flush();
    expect(inner.order.slice(-2)).toEqual(["squad:lg/c2", `meta:${SAVE}`]);
  });
});

describe("BufferingSaveDAL inbox", () => {
  test("several appends in one unit of work accumulate and flush as one list", async () => {
    const inner = fakeInner();
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.appendInboxMessage(SAVE, message("m1"));
    await buf.appendInboxMessage(SAVE, message("m2"));
    await buf.appendInboxMessage(SAVE, message("m3"));

    expect((await buf.readInbox(SAVE)).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(inner.calls.filter((c) => c === "readInbox")).toHaveLength(1);
    expect(inner.inboxWrites).toHaveLength(0);

    await buf.flush();
    expect(inner.inboxWrites.map((l) => l.map((m) => m.id))).toEqual([["m1", "m2", "m3"]]);
  });
});

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

describe("BufferingSaveDAL edge cases", () => {
  const files: SquadFile[] = [
    { leagueSlug: "lg", clubSlug: "33", squad: squad("33", "United") },
    { leagueSlug: "lg", clubSlug: "34", squad: squad("34", "City") },
  ];

  test("a second flush retries only the writes that failed", async () => {
    let failing = true;
    const inner = fakeInner({ failWrite: (club) => failing && (club === "c1" || club === "c4") });
    const buf = new BufferingSaveDAL(inner.dal);
    for (let i = 0; i < 6; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`));

    await expect(buf.flush()).rejects.toBeInstanceOf(AggregateError);
    expect(inner.written.sort()).toEqual(["lg/c0:c0", "lg/c2:c2", "lg/c3:c3", "lg/c5:c5"]);

    failing = false;
    await buf.flush();
    expect(inner.written.slice(4).sort()).toEqual(["lg/c1:c1", "lg/c4:c4"]);
    expect(inner.written).toHaveLength(6);
  });

  test("a resource re-buffered while its flush write is in flight stays pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let startedResolve!: () => void;
    const started = new Promise<void>((r) => (startedResolve = r));
    const inner = fakeInner({
      gateWrite: (club) => {
        if (club !== "c0") return undefined;
        startedResolve();
        return gate;
      },
    });
    const buf = new BufferingSaveDAL(inner.dal);
    await buf.writeSquad(SAVE, "lg", "c0", squad("c0", "v1"));

    const flushing = buf.flush();
    await started; // v1 is now in flight
    await buf.writeSquad(SAVE, "lg", "c0", squad("c0", "v2"));
    release();
    await flushing;

    expect(inner.written).toEqual(["lg/c0:v1"]);
    await buf.flush(); // v2 was not dropped
    expect(inner.written).toEqual(["lg/c0:v1", "lg/c0:v2"]);
    await buf.flush(); // and is now clean
    expect(inner.written).toHaveLength(2);
  });

  test("a failed listSquadFiles load is not cached — the next read retries it", async () => {
    const inner = fakeInner({ files, failListSquadFiles: 1 });
    const buf = new BufferingSaveDAL(inner.dal);

    await expect(buf.readSquad(SAVE, "lg", "33")).rejects.toThrow("EIO");
    expect((await buf.readSquad(SAVE, "lg", "33"))?.name).toBe("United");
    expect((await buf.listAllSquads(SAVE)).map((s) => s.id)).toEqual(["33", "34"]);
    expect(inner.calls.filter((c) => c === "listSquadFiles")).toHaveLength(2);
  });

  test("listSquadFiles overlays buffered edits (in place) and appends new files", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.writeSquad(SAVE, "lg", "33", squad("33", "United v2"));
    await buf.writeSquad(SAVE, "new_lg", "77", squad("77", "Newcomer"));

    const listed = await buf.listSquadFiles(SAVE);
    expect(listed.map((f) => `${f.leagueSlug}/${f.clubSlug}:${f.squad.name}`)).toEqual([
      "lg/33:United v2",
      "lg/34:City",
      "new_lg/77:Newcomer",
    ]);
    expect(inner.calls.filter((c) => c === "listSquadFiles")).toHaveLength(1);
  });
});

describe("BufferingSaveDAL.flush — writes, then deletes, then meta", () => {
  const files: SquadFile[] = [{ leagueSlug: "A", clubSlug: "33", squad: squad("33", "United") }];

  async function bufferedMove(inner: ReturnType<typeof fakeInner>) {
    const buf = new BufferingSaveDAL(inner.dal);
    await buf.writeMeta(meta(SAVE));
    await buf.deleteSquad(SAVE, "A", "33"); // buffered before the write, still flushed after it
    await buf.writeSquad(SAVE, "B", "33", squad("33", "United"));
    for (let i = 0; i < 40; i++) await buf.writeSquad(SAVE, "lg", `c${i}`, squad(`c${i}`));
    return buf;
  }

  test("every delete runs after every write, and meta after both", async () => {
    const inner = fakeInner({ files, writeDelayMs: 2 });
    const buf = await bufferedMove(inner);
    await buf.flush();
    const del = inner.order.indexOf("delete:A/33");
    expect(inner.order.filter((o) => o.startsWith("squad:")).every((o) => inner.order.indexOf(o) < del)).toBe(true);
    expect(inner.order.at(-1)).toBe(`meta:${SAVE}`);
    expect(inner.order).toHaveLength(43);
  });

  test("a move whose write fails leaves A intact, the delete pending and meta unwritten", async () => {
    let failing = true;
    const inner = fakeInner({ files, failWrite: (club) => failing && club === "33" });
    const buf = await bufferedMove(inner);

    await expect(buf.flush()).rejects.toBeInstanceOf(AggregateError);
    expect(inner.calls.filter((c) => c.startsWith("deleteSquad"))).toEqual([]); // A/33 untouched on disk
    expect(inner.order).not.toContain(`meta:${SAVE}`);
    expect(inner.written).toHaveLength(40); // the other writes landed

    // Once the disk recovers: the write, then the delete, then meta.
    failing = false;
    await buf.flush();
    expect(inner.order.slice(-3)).toEqual(["squad:B/33", "delete:A/33", `meta:${SAVE}`]);
  });

  test("a move whose delete fails leaves both copies written and meta unwritten; a retry finishes it", async () => {
    let failing = true;
    const inner = fakeInner({ files, failDelete: () => failing });
    const buf = await bufferedMove(inner);

    await expect(buf.flush()).rejects.toBeInstanceOf(AggregateError);
    expect(inner.written).toContain("B/33:United");
    expect(inner.order).not.toContain("delete:A/33");
    expect(inner.order).not.toContain(`meta:${SAVE}`);

    failing = false;
    await buf.flush();
    expect(inner.order.slice(-2)).toEqual(["delete:A/33", `meta:${SAVE}`]);
  });
});

describe("BufferingSaveDAL.deleteSquad (tombstones)", () => {
  const files: SquadFile[] = [
    { leagueSlug: "A", clubSlug: "33", squad: squad("33", "United") },
    { leagueSlug: "A", clubSlug: "34", squad: squad("34", "City") },
  ];
  const keys = (fs: SquadFile[]) => fs.map((f) => `${f.leagueSlug}/${f.clubSlug}`);

  test("a tombstone hides the key from every read path", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.deleteSquad(SAVE, "A", "33");

    expect(await buf.readSquad(SAVE, "A", "33")).toBeNull();
    expect(await buf.squadExists(SAVE, "A", "33")).toBe(false);
    expect(keys(await buf.listSquadFiles(SAVE))).toEqual(["A/34"]);
    expect((await buf.listAllSquads(SAVE)).map((s) => s.id)).toEqual(["34"]);
    expect((await buf.listSquadsInLeague(SAVE, "A")).map((s) => s.id)).toEqual(["34"]);
  });

  test("move (write in B + delete in A) lists the key only in B, with leagueSlug B", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    const s = (await buf.readSquad(SAVE, "A", "33"))!;
    await buf.writeSquad(SAVE, "B", "33", s);
    await buf.deleteSquad(SAVE, "A", "33");

    const listed = await buf.listSquadFiles(SAVE);
    expect(keys(listed)).toEqual(["A/34", "B/33"]);
    expect(listed.find((f) => f.clubSlug === "33")!.squad.leagueSlug).toBe("B");
    expect((await buf.readSquad(SAVE, "B", "33"))?.leagueSlug).toBe("B");
    expect((await buf.listSquadsInLeague(SAVE, "B")).map((x) => x.leagueSlug)).toEqual(["B"]);

    await buf.flush();
    expect(inner.writtenSquads.map((f) => [f.leagueSlug, f.clubSlug, f.squad.leagueSlug])).toEqual([["B", "33", "B"]]);
    expect(inner.calls.filter((c) => c.startsWith("deleteSquad"))).toEqual(["deleteSquad:A/33"]);
  });

  test("a write after a delete restores the key and replaces the pending delete", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.deleteSquad(SAVE, "A", "33");
    await buf.writeSquad(SAVE, "A", "33", squad("33", "United v2"));

    expect((await buf.readSquad(SAVE, "A", "33"))?.name).toBe("United v2");
    expect(await buf.squadExists(SAVE, "A", "33")).toBe(true);
    expect(keys(await buf.listSquadFiles(SAVE))).toEqual(["A/33", "A/34"]);

    await buf.flush();
    expect(inner.calls.filter((c) => c.startsWith("deleteSquad"))).toEqual([]);
    expect(inner.written).toEqual(["A/33:United v2"]);
  });

  test("flush calls inner.deleteSquad exactly once, before meta", async () => {
    const inner = fakeInner({ files, writeDelayMs: 3 });
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.writeMeta(meta(SAVE));
    await buf.deleteSquad(SAVE, "A", "33");
    await buf.deleteSquad(SAVE, "A", "33"); // idempotent re-delete
    await buf.writeSquad(SAVE, "A", "34", squad("34", "City v2"));

    await buf.flush();
    await buf.flush();

    expect(inner.calls.filter((c) => c.startsWith("deleteSquad"))).toEqual(["deleteSquad:A/33"]);
    expect(inner.order.at(-1)).toBe(`meta:${SAVE}`);
    expect(inner.order.indexOf("delete:A/33")).toBeLessThan(inner.order.indexOf(`meta:${SAVE}`));
  });

  test("writeSquad stores the squad with leagueSlug set to the league it was written to", async () => {
    const inner = fakeInner();
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.writeSquad(SAVE, "B", "77", { ...squad("77"), leagueSlug: "A" } as Squad);

    expect((await buf.readSquad(SAVE, "B", "77"))?.leagueSlug).toBe("B");
    await buf.flush();
    expect(inner.writtenSquads[0]!.squad.leagueSlug).toBe("B");
  });

  test("listLeagues unions inner leagues with buffered ones; tombstones do not add a league", async () => {
    const inner = fakeInner({ files });
    const buf = new BufferingSaveDAL(inner.dal);

    await buf.writeSquad(SAVE, "B", "77", squad("77"));
    await buf.deleteSquad(SAVE, "C", "88");

    expect((await buf.listLeagues(SAVE)).sort()).toEqual(["A", "B"]);
  });
});
