import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { buildLiveMatchState, type LiveMatchInput } from "@/Domain/match/liveMatchSetup";
import { formationForSimId } from "@/Domain/matchFormations";
import { tickState, fillInjuryVacancy, LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import { initStats } from "@/GameEngine/Domain/Statistics";
import { initRatings } from "@/GameEngine/Domain/PlayerRating";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { createForecast } from "@/GameEngine/Support/ForecastCore";
import { HighlightPlayback, type ForecastPort } from "@/GameEngine/Support/HighlightPlayback";
import { restoreLiveSnapshot } from "@/GameEngine/Support/LiveSnapshot";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

const sq = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../example_data/squads/premier_league/${f}`, import.meta.url)), "utf8")) as Squad;
const A = sq("33.json"), B = sq("34.json");

function fresh(seed: number): GameState {
  const side = (s: Squad, human: boolean): LiveMatchInput["A"] => ({ players: s.players, formation: formationForSimId("4-3-3"), human, morale: "neutral", tactics: { style: "balanced", mentality: "balanced" } });
  const s = buildLiveMatchState({ A: side(A, true), B: side(B, false), date: "2027-02-10", knockout: false, seed, clockScale: LEGACY_CLOCK_SCALE });
  s.manualInjurySubs = { A: true };
  initRatings([...s.players, ...s.benchA, ...s.benchB].map(p => p.id));
  initStats([...s.players, ...s.benchA, ...s.benchB].map(p => ({ id: p.id, team: p.team })));
  return s;
}

let forecasting = false;
function inlinePort(): ForecastPort {
  const port: ForecastPort = {
    onChunk: null,
    start(gen, snap, opts) {
      forecasting = true;
      const keep = structuredClone(snap);
      const fc = createForecast(structuredClone(snap), opts);
      const chunks = [];
      while (!fc.done) chunks.push(fc.run(1000));
      fc.dispose();
      restoreLiveSnapshot(keep);
      forecasting = false;
      for (const c of chunks) port.onChunk?.(gen, c);
    },
    stop() {},
  };
  return port;
}

/** The pitch and the match screen in highlights mode: counts how often the injury panel opens for each injury. */
function play(seed: number) {
  let s = fresh(seed);
  const pb = new HighlightPlayback(inlinePort(), "extended", { humanTeams: ["A"], ui: () => undefined });
  const opens: { id: number; hasVacancy: boolean }[] = [];
  let pending: { injuredId: number; suggestedInId: number | null } | null = null;
  const off = gameBus.on("injuryNeedsSub", e => { if (!forecasting && e.team === "A") pending = e; });
  pb.invalidate(s);
  for (let g = 0; g < 300_000 && s.matchPhase !== "matchEnd"; g++) {
    if (pending) {
      const p = pending as { injuredId: number; suggestedInId: number | null };
      pending = null;
      opens.push({ id: p.injuredId, hasVacancy: (s.injuryVacancies?.A ?? []).some(v => v.injuredId === p.injuredId) });
      const inId = p.suggestedInId ?? s.benchA[0]?.id;
      if (inId != null) s = fillInjuryVacancy(s, "A", p.injuredId, inId);
      pb.invalidate(s);
      continue;
    }
    const act = pb.step(s);
    if (act.kind === "jump") {
      s = restoreLiveSnapshot(structuredClone(act.point.snap));
      const inj = pb.pendingInjury(s);
      if (inj) gameBus.emit("injuryNeedsSub", inj);
      continue;
    }
    if (act.kind === "freeze") continue;
    s = tickState(s, SIM_STEP).state;
  }
  off();
  pb.dispose();
  return opens;
}

describe("injury panel in highlights mode, end to end", () => {
  test("each injury opens the panel once, always with the vacancy", () => {
    // Seeds with a team-A injury (found by scanning 1..20); before the fix seed 11 opened the panel 4 times for 2 injuries.
    let injuries = 0;
    for (const seed of [11, 15, 20]) {
      const opens = play(seed);
      injuries += new Set(opens.map(o => o.id)).size;
      const ids = opens.map(o => o.id);
      expect({ seed, ids }).toEqual({ seed, ids: [...new Set(ids)] });
      for (const o of opens) expect({ seed, o }).toEqual({ seed, o: { ...o, hasVacancy: true } });
    }
    expect(injuries).toBeGreaterThanOrEqual(4);
  }, 120_000);
});
