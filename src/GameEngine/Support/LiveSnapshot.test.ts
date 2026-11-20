import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { buildLiveMatchState, type LiveMatchInput } from "@/Domain/match/liveMatchSetup";
import { formationForSimId } from "@/Domain/matchFormations";
import { tickState, changeFormation, LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import { initStats, getTeamStats, getGoalLog } from "@/GameEngine/Domain/Statistics";
import { initRatings, exportRatings } from "@/GameEngine/Domain/PlayerRating";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { highlightsAtLevel } from "@/GameEngine/Domain/Highlights";
import { getHighlights } from "@/GameEngine/Domain/HighlightTracker";
import { captureLiveSnapshot, restoreLiveSnapshot } from "@/GameEngine/Support/LiveSnapshot";
import { createForecast, type ForecastWindow, type ForecastFrontier } from "@/GameEngine/Support/ForecastCore";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

const A = loadSquad("33.json");
const B = loadSquad("34.json");

/** A live match as the page builds it, on the compressed clock (the mechanism does not depend on the clock; it is fast). */
function fresh(seed: number): GameState {
  const side = (sq: Squad, human: boolean): LiveMatchInput["A"] => ({
    players: sq.players, formation: formationForSimId("4-3-3"), human, morale: "neutral",
    tactics: { style: "balanced", mentality: "balanced" },
  });
  const input: LiveMatchInput = {
    A: side(A, true), B: side(B, false), date: "2027-02-10", knockout: false, seed, clockScale: LEGACY_CLOCK_SCALE,
  };
  const s = buildLiveMatchState(input);
  initRatings([...s.players, ...s.benchA, ...s.benchB].map(p => p.id));
  initStats([...s.players, ...s.benchA, ...s.benchB].map(p => ({ id: p.id, team: p.team })));
  return s;
}

function run(s: GameState, steps = Infinity): GameState {
  for (let i = 0; i < steps && s.matchPhase !== "matchEnd"; i++) s = tickState(s, SIM_STEP).state;
  return s;
}

function result(s: GameState) {
  return {
    score: { ...s.score },
    goals: getGoalLog().map(g => ({ ...g })),
    shots: getTeamStats("A").shots + getTeamStats("B").shots,
    passes: getTeamStats("A").passesCompleted + getTeamStats("B").passesCompleted,
    ratings: exportRatings(),
    highlights: getHighlights().length,
  };
}

describe("mid-match snapshot (stage 19)", () => {
  test("a restored snapshot plays the rest of the match exactly as the match it was taken from", () => {
    const straight = result(run(fresh(9191)));

    let s = run(fresh(9191), 700);
    const snap = captureLiveSnapshot(s);
    // Pollute every engine global by playing on (another future), then restore.
    run(s, 400);
    s = restoreLiveSnapshot(structuredClone(snap));
    expect(result(run(s))).toEqual(straight);
  }, 120_000);

  test("the same order at the same minute gives the same match (invalidation)", () => {
    const base = captureLiveSnapshot(run(fresh(5151), 600));
    const order = (snap: typeof base) => {
      let s = restoreLiveSnapshot(structuredClone(snap));
      s = changeFormation(s, "A", formationForSimId("4-4-2"));
      applyTeamTacticsConfig("A", "high_press", "attacking");
      applyTeamAttackConfig("A", "high_press", "attacking");
      s = tickState(s, 0).state;
      return result(run(s));
    };
    const one = order(base);
    run(fresh(1), 300); // another match in between
    expect(order(base)).toEqual(one);
  }, 120_000);

  test("playing only the lances (jumping by the forecast) ends in the same match as playing it all", () => {
    const straight = result(run(fresh(7373)));

    // The page: forecast from kickoff, play each extended lance from its snapshot, skip the rest; at a frontier (an
    // injury to replace by hand: here nobody comes on, as in the straight run) play on and forecast again; at full time
    // play the final step.
    let s = fresh(7373);
    let start = captureLiveSnapshot(s);
    let played = 0;
    let goalsSeen = 0;
    for (let round = 0; round < 20; round++) {
      const fc = createForecast(start, { humanTeams: ["A"] });
      const windows: ForecastWindow[] = [];
      let frontier: ForecastFrontier | null = null;
      while (!fc.done) {
        const c = fc.run(500);
        windows.push(...c.windows);
        frontier = c.frontier ?? frontier;
      }
      fc.dispose();
      for (const w of highlightsAtLevel(windows, "extended") as ForecastWindow[]) {
        if (!w.at) continue; // already inside it (a restart mid-lance)
        s = restoreLiveSnapshot(structuredClone(w.at.snap));
        const before = s.score.A + s.score.B;
        for (let i = 0; i < Math.ceil((w.end - w.start) / SIM_STEP) + 1; i++) s = tickState(s, SIM_STEP).state;
        goalsSeen += s.score.A + s.score.B - before;
        played++;
      }
      s = restoreLiveSnapshot(structuredClone(frontier!.at.snap));
      if (frontier!.reason === "end") break;
      start = captureLiveSnapshot(s);
    }
    s = run(s);
    expect(played).toBeGreaterThan(0);
    expect(s.matchPhase).toBe("matchEnd");
    expect(result(s)).toEqual(straight);
    expect(goalsSeen).toBe(straight.score.A + straight.score.B);
  }, 180_000);
});

import { HighlightPlayback, decidePlayback, type ForecastPort } from "@/GameEngine/Support/HighlightPlayback";
import { getHighlightLiveSeconds } from "@/GameEngine/Domain/HighlightTracker";
import { restoreLiveSnapshot as restore } from "@/GameEngine/Support/LiveSnapshot";

/**
 * The forecast run inline (one thread): it runs to the end at once and the page's globals are put back from the very
 * snapshot it started from (the page's state at that moment).
 */
function inlinePort(): ForecastPort {
  const port: ForecastPort = {
    onChunk: null,
    start(gen, snap, opts) {
      const keep = structuredClone(snap);
      const fc = createForecast(structuredClone(snap), opts);
      const chunks = [];
      while (!fc.done) chunks.push(fc.run(1000));
      fc.dispose();
      restore(keep);
      for (const c of chunks) port.onChunk?.(gen, c);
    },
    stop() {},
  };
  return port;
}

/** The pitch's pump with a playback: play, jump or wait; an order applied once at `orderAt` live seconds. */
function playWithPlayback(seed: number, level: "main" | "extended", order?: { at: number; apply: (s: GameState) => GameState }) {
  let s = fresh(seed);
  const pb = new HighlightPlayback(inlinePort(), level, { humanTeams: ["A"], ui: () => undefined });
  let jumps = 0;
  let played = 0;
  let ordered = false;
  let orderClock = -1;
  pb.onJump(() => { jumps++; });
  pb.invalidate(s);
  for (let guard = 0; guard < 200_000 && s.matchPhase !== "matchEnd"; guard++) {
    const act = pb.step(s);
    if (act.kind === "jump") { s = restore(structuredClone(act.point.snap)); continue; }
    if (act.kind === "freeze") throw new Error("inline forecast never leaves the page waiting");
    if (order && !ordered && getHighlightLiveSeconds() >= order.at) {
      ordered = true;
      orderClock = getHighlightLiveSeconds();
      s = order.apply(s);
      pb.invalidate(s);
      continue;
    }
    s = tickState(s, SIM_STEP).state;
    played++;
  }
  pb.dispose();
  return { s, jumps, played, ordered, orderClock };
}

describe("highlights playback (stage 19)", () => {
  test("the rule: play the lance, jump to the next, the frontier last, wait otherwise", () => {
    const point = (clock: number) => ({ clock, snap: {} as never, ui: {} as never });
    const w = (id: number, start: number, end: number) => ({ id, kind: "goal", level: "main", team: "A", start, end, minute: 0, triggers: [], at: point(start) }) as never;
    const windows = [w(1, 10, 20), w(2, 50, 60)];
    expect(decidePlayback({ clock: 12, phase: "firstHalf", windows, frontier: null, skipId: null, live: false }).kind).toBe("play");
    const j = decidePlayback({ clock: 20, phase: "firstHalf", windows, frontier: null, skipId: null, live: false });
    expect(j.kind === "jump" && j.point.clock).toBe(50);
    expect(decidePlayback({ clock: 12, phase: "firstHalf", windows, frontier: null, skipId: 1, live: false }).kind).toBe("jump");
    expect(decidePlayback({ clock: 60, phase: "firstHalf", windows, frontier: null, skipId: null, live: false }).kind).toBe("freeze");
    const frontier = { reason: "end", at: point(90), open: null } as never;
    const f = decidePlayback({ clock: 60, phase: "secondHalf", windows, frontier, skipId: null, live: false });
    expect(f.kind === "jump" && f.live && f.point.clock).toBe(90);
    expect(decidePlayback({ clock: 0, phase: "preMatch", windows, frontier: null, skipId: null, live: false }).kind).toBe("play");
  });

  test("playing by the playback ends in the same match as playing it all, with an order in the middle too", () => {
    const straight = result(run(fresh(6161)));
    const pb = playWithPlayback(6161, "main");
    expect(pb.jumps).toBeGreaterThan(0);
    expect(pb.s.matchPhase).toBe("matchEnd");
    expect(result(pb.s)).toEqual(straight);

    // An order at 200 live seconds (inside or between lances): the straight run applies it at the same clock.
    const apply = (s: GameState) => {
      const n = changeFormation(s, "A", formationForSimId("3-5-2"));
      applyTeamTacticsConfig("A", "counter_attack", "defensive");
      applyTeamAttackConfig("A", "counter_attack", "defensive");
      return tickState(n, 0).state;
    };
    const viaPlayback = playWithPlayback(6161, "extended", { at: 200, apply });
    const got = result(viaPlayback.s);
    expect(viaPlayback.ordered).toBe(true);
    let st = fresh(6161);
    while (getHighlightLiveSeconds() < viaPlayback.orderClock - 1e-6) st = tickState(st, SIM_STEP).state;
    expect(got).toEqual(result(run(apply(st))));
  }, 240_000);
});
