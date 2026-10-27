import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createH2HMatch, type H2HMatch } from "@/backend/h2h/h2hMatch";
import { getDefenseConfig } from "@/GameEngine/Configs/DefenseConfig";
import { getTeamPassConfig } from "@/GameEngine/Configs/AttackConfig";
import { eligibleLivePlayers, type LiveMatchInput, type LiveSideInput } from "@/Domain/match/liveMatchSetup";
import { formationForSimId } from "@/Domain/matchFormations";
import type { Squad } from "@/types/playerTypes";
import type { WorkerOut } from "@/types/h2hTypes";

const DATE = "2026-08-20";

function squad(stem: string): Squad {
  const path = fileURLToPath(new URL(`../../Data/squads/premier_league/${stem}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

function side(s: Squad): LiveSideInput {
  return {
    players: eligibleLivePlayers(s.players, DATE, null),
    formation: formationForSimId("4-3-3"),
    tactics: { style: "balanced", mentality: "balanced" },
    morale: "own",
    human: true,
  };
}

function input(): LiveMatchInput {
  return { A: side(squad("33")), B: side(squad("34")), date: DATE, knockout: false };
}

let match: H2HMatch | null = null;
afterEach(() => { match?.dispose(); match = null; });

function runToEnd(m: H2HMatch, stepMs = 1000, maxTicks = 20_000): WorkerOut[] {
  const out: WorkerOut[] = [];
  for (let i = 0; i < maxTicks && !m.done; i++) out.push(...m.tick(stepMs));
  return out;
}

const ofType = <T extends WorkerOut["type"]>(out: WorkerOut[], type: T) =>
  out.filter((m): m is Extract<WorkerOut, { type: T }> => m.type === type);

describe("createH2HMatch", () => {
  test("runs a whole match at high speed; goal events add up to the final score", () => {
    match = createH2HMatch(input());
    match.setSpeed(600);
    const out = runToEnd(match);
    expect(match.done).toBe(true);
    const dones = ofType(out, "done");
    expect(dones).toHaveLength(1);
    const done = dones[0]!;
    expect(done.state.matchPhase).toBe("matchEnd");
    const events = ofType(out, "event");
    const goals = { A: 0, B: 0 };
    for (const e of events) {
      const p = e.payload as { team: "A" | "B" };
      if (e.name === "goalScored") goals[p.team]++;
      if (e.name === "goalDisallowed") goals[p.team]--;
    }
    expect(goals).toEqual(done.state.score);
    expect(events.some((e) => e.name === "halfTime")).toBe(true);
    expect(events.some((e) => e.name === "matchEnd")).toBe(true);
    // The stats payload restores what buildPlayedMatchRecording reads.
    expect(done.stats.snapshot.players.length).toBeGreaterThan(20);
    expect(done.stats.ratings.length).toBeGreaterThan(20);
    expect(done.stats.goals.length).toBe(done.state.score.A + done.state.score.B);
    // Nothing more after done.
    expect(match.tick(1000)).toEqual([]);
    // Everything posted must be structured-cloneable.
    expect(() => structuredClone(out)).not.toThrow();
  }, 60_000);

  test("frames every 100 ms and a state every second at 1x", () => {
    match = createH2HMatch(input());
    const out: WorkerOut[] = [];
    for (let i = 0; i < 20; i++) out.push(...match.tick(50)); // 1 s, still in the pre-match presentation
    expect(match.state.matchPhase).toBe("preMatch");
    expect(ofType(out, "frame")).toHaveLength(10);
    expect(ofType(out, "state")).toHaveLength(1);
    expect(ofType(out, "frame").at(-1)!.players.length).toBe(22);
  });

  test("paused: the clock does not move", () => {
    match = createH2HMatch(input());
    match.setSpeed(20);
    for (let i = 0; i < 40; i++) match.tick(50); // into the first half
    expect(match.state.matchPhase).toBe("firstHalf");
    match.setPaused(true);
    const t0 = match.state.matchTime;
    const out: WorkerOut[] = [];
    for (let i = 0; i < 40; i++) out.push(...match.tick(50));
    expect(match.state.matchTime).toBe(t0);
    const minutes = new Set(ofType(out, "frame").map((f) => f.minute));
    expect(minutes.size).toBe(1);
    match.setPaused(false);
    for (let i = 0; i < 10; i++) match.tick(50);
    expect(match.state.matchTime).toBeGreaterThan(t0);
  });

  test("a mentality command changes side B's config only", () => {
    match = createH2HMatch(input());
    const defA = JSON.stringify(getDefenseConfig("A"));
    const passA = JSON.stringify(getTeamPassConfig("A"));
    const defB = JSON.stringify(getDefenseConfig("B"));
    const passB = JSON.stringify(getTeamPassConfig("B"));
    const out = match.command("B", { kind: "mentality", mentality: "attacking" });
    expect(JSON.stringify(getDefenseConfig("B"))).not.toBe(defB);
    expect(JSON.stringify(getTeamPassConfig("B"))).not.toBe(passB);
    expect(JSON.stringify(getDefenseConfig("A"))).toBe(defA);
    expect(JSON.stringify(getTeamPassConfig("A"))).toBe(passA);
    expect(ofType(out, "state")).toHaveLength(1);
  });

  test("a sub command substitutes for that side at the next stoppage", () => {
    match = createH2HMatch(input());
    match.setSpeed(20);
    for (let i = 0; i < 40; i++) match.tick(50);
    const outPlayer = match.state.players.find((p) => p.team === "B" && p.role !== "GK")!;
    const inPlayer = match.state.benchB.find((p) => p.role !== "GK")!;
    match.command("B", { kind: "sub", outId: outPlayer.id, inId: inPlayer.id });
    expect(match.state.pendingSubsB).toEqual([{ outId: outPlayer.id, inId: inPlayer.id }]);
    // A side cannot queue for the other one.
    match.command("A", { kind: "sub", outId: outPlayer.id, inId: inPlayer.id });
    expect(match.state.pendingSubsA).toEqual([]);
    match.setSpeed(600);
    const out: WorkerOut[] = [];
    for (let i = 0; i < 2000 && !match.done; i++) {
      out.push(...match.tick(200));
      if (match.state.substitutions.some((s) => s.playerInId === inPlayer.id)) break;
    }
    const sub = match.state.substitutions.find((s) => s.playerInId === inPlayer.id);
    expect(sub?.team).toBe("B");
    expect(ofType(out, "event").some((e) => e.name === "playerSubstituted")).toBe(true);
  }, 60_000);

  test("auto on/off toggles the assistant and the manual injury subs of that side", () => {
    match = createH2HMatch(input());
    expect(match.state.manualInjurySubs?.A).toBe(true);
    match.setAuto("A", true);
    expect(match.state.autoSubs?.A).toBe(true);
    expect(match.state.manualInjurySubs?.A).toBeUndefined();
    expect(match.state.manualInjurySubs?.B).toBe(true);
    match.setAuto("A", false);
    expect(match.state.autoSubs?.A).toBeUndefined();
    expect(match.state.manualInjurySubs?.A).toBe(true);
  });
});

describe("h2hWorker", () => {
  test("the real worker runs a match to done", async () => {
    const worker = new Worker(new URL("./h2hWorker.ts", import.meta.url).href, { type: "module" });
    const done = new Promise<Extract<WorkerOut, { type: "done" }>>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOut>) => { if (e.data.type === "done") resolve(e.data); };
      worker.onerror = (e) => reject(e);
    });
    worker.postMessage({ type: "speed", factor: 600 });
    worker.postMessage({ type: "init", input: input() });
    const msg = await done;
    worker.terminate();
    expect(msg.state.matchPhase).toBe("matchEnd");
  }, 60_000);
});
