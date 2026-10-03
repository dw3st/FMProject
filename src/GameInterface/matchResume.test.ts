import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { initStats, getTeamStats, getAllPlayerStats, exportStatsState, importStatsState } from "@/GameEngine/Domain/Statistics";
import { initRatings, getAllRatings, exportRatings, importRatings } from "@/GameEngine/Domain/PlayerRating";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import {
  MATCH_SNAPSHOT_STORAGE_KEY,
  MAX_SNAPSHOT_CHARS,
  clearMatchSnapshot,
  deserializeMatchSnapshot,
  loadMatchSnapshot,
  matchKey,
  saveMatchSnapshot,
  serializeMatchSnapshot,
  type MatchSnapshot,
} from "@/GameInterface/matchResume";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90 } })) };
}

function liveState(): GameState {
  const f = formation433Json as Formation;
  return {
    ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f),
    matchPhase: "firstHalf",
    presentationCountdown: 0,
    setPiece: null,
  } as GameState;
}

/** Runs `n` real-time ticks of 0.1 s. */
function run(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = tickState(s, 0.1).state;
  return s;
}

/** Fails on anything JSON can't carry faithfully: functions, Maps/Sets, non-finite numbers. */
function assertPlainData(v: unknown, path = "state"): void {
  if (v === null || typeof v === "string" || typeof v === "boolean" || v === undefined) return;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${path} is not finite (${v})`);
    return;
  }
  if (typeof v === "function") throw new Error(`${path} is a function`);
  if (v instanceof Map || v instanceof Set) throw new Error(`${path} is a Map/Set`);
  if (Array.isArray(v)) {
    v.forEach((x, i) => assertPlainData(x, `${path}[${i}]`));
    return;
  }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) assertPlainData(x, `${path}.${k}`);
}

function snapshotOf(state: GameState, key = "save1|2027-02-07|fix_0001"): MatchSnapshot {
  return {
    version: 1,
    key,
    savedAt: 1,
    state,
    stats: exportStatsState(),
    ratings: exportRatings(),
    tactics: {
      A: { style: "possession", mentality: "attacking", axesOverride: { width: "wide" }, familiarity: { possession: 70 } },
      B: { style: "balanced", mentality: "balanced" },
    },
    ui: { gameSpeed: 2, eventFeed: [{ minute: 12, team: "A", kind: "goal", player: "X" }], possession: { A: 300, B: 250 } },
  };
}

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("match snapshot round trip", () => {
  test("GameState + stats + ratings survive serialize/deserialize and the match keeps running", () => {
    let s = liveState();
    initStats(s.players.map((p) => ({ id: p.id, team: p.team })));
    initRatings(s.players.map((p) => p.id));
    s = run(s, 1500);
    expect(s.matchTime).toBeGreaterThan(0);

    const before = { stats: getAllPlayerStats(), teamA: getTeamStats("A"), teamB: getTeamStats("B"), ratings: getAllRatings() };
    const raw = serializeMatchSnapshot(snapshotOf(s));
    const back = deserializeMatchSnapshot(raw)!;
    expect(back).not.toBeNull();

    // The state is plain data: the round trip is lossless except the dropped through-ball cache.
    assertPlainData({ ...s, throughBallCellsCache: null });
    expect(back.state).toEqual({ ...s, throughBallCellsCache: null });
    expect(back.tactics.A).toEqual({ style: "possession", mentality: "attacking", axesOverride: { width: "wide" }, familiarity: { possession: 70 } });
    expect(back.ui.possession).toEqual({ A: 300, B: 250 });

    // A reload wipes the module-level counters; importing the snapshot restores them exactly.
    initStats([]);
    initRatings([]);
    expect(getTeamStats("A").passesAttempted).toBe(0);
    importStatsState(back.stats);
    importRatings(back.ratings);
    expect(getAllPlayerStats()).toEqual(before.stats);
    expect(getTeamStats("A")).toEqual(before.teamA);
    expect(getTeamStats("B")).toEqual(before.teamB);
    expect(getAllRatings()).toEqual(before.ratings);

    // The restored state ticks on from where it stopped, and counters keep accumulating.
    const resumed = run(back.state, 600);
    expect(resumed.matchPhase === back.state.matchPhase ? resumed.matchTime > back.state.matchTime : true).toBe(true);
    const after = getTeamStats("A").passesAttempted + getTeamStats("B").passesAttempted;
    expect(after).toBeGreaterThanOrEqual(before.teamA.passesAttempted + before.teamB.passesAttempted);
  });

  test("rejects text that is not a snapshot of this version", () => {
    expect(deserializeMatchSnapshot(null)).toBeNull();
    expect(deserializeMatchSnapshot("not json")).toBeNull();
    expect(deserializeMatchSnapshot(JSON.stringify({ version: 999, key: "k" }))).toBeNull();
    const ok = JSON.parse(serializeMatchSnapshot(snapshotOf(liveState()))) as Record<string, unknown>;
    expect(deserializeMatchSnapshot(JSON.stringify({ ...ok, stats: null }))).toBeNull();
    expect(deserializeMatchSnapshot(JSON.stringify({ ...ok, state: { players: [] } }))).toBeNull();
  });
});

describe("match snapshot key and clearing", () => {
  test("the key identifies save, date and fixture", () => {
    expect(matchKey("s1", { id: "fix_1", date: "2027-02-07" })).toBe("s1|2027-02-07|fix_1");
    expect(matchKey("s1", { id: "fix_1", date: "2027-02-07" })).not.toBe(matchKey("s1", { id: "fix_1", date: "2027-02-10" }));
    expect(matchKey("s1", { id: "fix_1", date: "2027-02-07" })).not.toBe(matchKey("s2", { id: "fix_1", date: "2027-02-07" }));
  });

  test("same match restores; another match (or a later day) drops the stale snapshot", () => {
    const st = fakeStorage();
    const key = matchKey("s1", { id: "fix_1", date: "2027-02-07" });
    expect(saveMatchSnapshot(snapshotOf(liveState(), key), st)).toBe(true);
    expect(loadMatchSnapshot(key, st)?.key).toBe(key);

    expect(loadMatchSnapshot(matchKey("s1", { id: "fix_2", date: "2027-02-10" }), st)).toBeNull();
    expect(st.map.has(MATCH_SNAPSHOT_STORAGE_KEY)).toBe(false);
    expect(loadMatchSnapshot(key, st)).toBeNull();
  });

  test("an unreadable snapshot is dropped; clear removes it; storage errors never throw", () => {
    const st = fakeStorage();
    st.map.set(MATCH_SNAPSHOT_STORAGE_KEY, "{broken");
    expect(loadMatchSnapshot("k", st)).toBeNull();
    expect(st.map.size).toBe(0);

    saveMatchSnapshot(snapshotOf(liveState(), "k"), st);
    clearMatchSnapshot(st);
    expect(st.map.size).toBe(0);

    const throwing = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(saveMatchSnapshot(snapshotOf(liveState(), "k"), throwing)).toBe(false);
    expect(loadMatchSnapshot("k", throwing)).toBeNull();
    expect(() => clearMatchSnapshot(throwing)).not.toThrow();
    expect(saveMatchSnapshot(snapshotOf(liveState(), "k"), null)).toBe(false);
  });

  test("a snapshot over the size cap is not written", () => {
    const st = fakeStorage();
    const huge = snapshotOf(liveState(), "k");
    huge.ui.eventFeed = [{ minute: 1, team: "A", kind: "goal", player: "x".repeat(MAX_SNAPSHOT_CHARS) }];
    expect(saveMatchSnapshot(huge, st)).toBe(false);
    expect(st.map.size).toBe(0);
  });
});
