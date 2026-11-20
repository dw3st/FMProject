/**
 * Guard for the mid-match snapshot (stage 19, `live-modes.md`): every engine module with top-level state that lives
 * from one tick to the next must register it (`registerEngineMemory`), or a restored snapshot (highlights mode,
 * resume) drifts from the match it was taken from. A new module-level `let`, Map, Set, WeakMap or per-team record in
 * `src/GameEngine` fails this test until it is registered or listed below with the reason it needs none.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** `file:name` → why it is not engine memory (or where else it is snapshotted). */
const ALLOW: Record<string, string> = {
  "Domain/Statistics.ts:store": "exportStatsState",
  "Domain/Statistics.ts:playerTeam": "exportStatsState",
  "Domain/Statistics.ts:endEnergy": "exportStatsState",
  "Domain/Statistics.ts:goalLog": "exportStatsState",
  "Domain/Statistics.ts:teamFlags": "exportStatsState",
  "Domain/Statistics.ts:bucketMix": "exportStatsState (decisionMix)",
  "Domain/Statistics.ts:playerMix": "exportStatsState (decisionMix)",
  "Domain/Statistics.ts:lastHolder": "exportStatsState (carry)",
  "Domain/Statistics.ts:lastDecision": "exportStatsState (carry)",
  "Domain/Statistics.ts:lastMind": "exportStatsState (carry)",
  "Domain/Statistics.ts:markedNow": "exportStatsState (carry)",
  "Domain/Statistics.ts:lastChoiceHolder": "exportStatsState (carry)",
  "Domain/Statistics.ts:decisionUnsubs": "bus subscriptions, not match state",
  "Domain/Momentum.ts:pos": "exportStatsState (momentum)",
  "Domain/Momentum.ts:live": "exportStatsState (momentum)",
  "Domain/Momentum.ts:minute": "exportStatsState (momentum)",
  "Domain/Momentum.ts:prevHolder": "exportStatsState (momentum)",
  "Domain/Momentum.ts:perMinute": "exportStatsState (momentum)",
  "Domain/Momentum.ts:totals": "exportStatsState (momentum)",
  "Domain/PlayerRating.ts:legacy": "exportRatingState",
  "Domain/PlayerRating.ts:tallies": "exportRatingState",
  "Domain/PlayerRating.ts:residual": "exportRatingState",
  "Domain/PlayerRating.ts:teamOf": "exportRatingState",
  "Domain/PlayerRating.ts:lastShot": "exportRatingState",
  "Domain/PlayerRating.ts:mistake": "exportRatingState",
  "Domain/PlayerRating.ts:lastTouch": "exportRatingState",
  "Domain/HighlightTracker.ts:state": "exportStatsState (highlights)",
  "Domain/HighlightTracker.ts:loggedOpen": "debug log dedupe",
  "Domain/DecisionTelemetry.ts:enabled": "telemetry switch, set per run",
  "Domain/DecisionTelemetry.ts:last": "written and read inside one decision",
  "Domain/HolderMind.ts:lastMind": "written and read inside one decision",
  "Domain/DefensivePositioning.ts:_backLineX": "set by every tick before it is read",
  "Domain/DefensivePositioning.ts:_lastStandOff": "debug log dedupe",
  "Domain/gameState.ts:_lastShadow": "debug log dedupe",
  "Domain/TeamShape.ts:_templates": "cache derived from the formation object",
  "Domain/TeamShape.ts:_formation": "set by every tick before it is read",
  "Domain/TeamShape.ts:_cover": "set by every tick before it is read",
  "Infrastructure/MatchRng.ts:a": "the generator state lives in GameState.rng (loadMatchRng)",
  "Infrastructure/MatchRng.ts:forced": "test hook",
  "Support/EngineMemory.ts:parts": "the registry itself",
  "Configs/InstructionConfig.ts:TEAM": "registered as InstructionConfig.TEAM (custom part)",
  "Configs/InstructionConfig.ts:VERSION": "cache key, bumped when the store is imported",
  "Configs/InstructionConfig.ts:_onBall": "registered as InstructionConfig.clock",
  "Configs/InstructionConfig.ts:_possessionTime": "registered as InstructionConfig.clock",
  "Configs/DefenseConfig.ts:TEAM_WITH_EXTRAS": "cache derived from TEAM_CONFIGS and the instruction store (keyed on both)",
  "Support/DebugSubscriber.ts:lastState": "debug panel",
  "Support/TestCases.ts:_nextId": "scenario builder",
  "Support/DebugLog.ts:nextId": "debug log",
  "Support/DebugLog.ts:enabled": "debug switch",
  "Support/forecastWorker.ts:current": "worker shell",
  "Support/forecastWorker.ts:timer": "worker shell",
};

const PATTERNS = [
  /^(?:export )?let (\w+)/,
  /^(?:export )?const (\w+)(?::[^=]*)? = new (?:Map|Set|WeakMap)\b/,
  /^(?:export )?const (\w+): (?:Partial<)?Record<TeamId\b/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return n.endsWith(".ts") && !n.endsWith(".test.ts") ? [p] : [];
  });
}

describe("engine memory guard", () => {
  test("every top-level engine state is registered for snapshots, or listed with a reason", () => {
    const missing: string[] = [];
    for (const path of files(ROOT)) {
      const rel = path.slice(ROOT.length).replaceAll("\\", "/").replace(/^\//, "");
      const text = readFileSync(path, "utf8");
      const lines = text.split("\n");
      const registered = new Set<string>();
      lines.forEach((l, i) => {
        if (!l.includes("registerEngineMemory(")) return;
        for (const w of lines.slice(i, i + 8).join(" ").match(/\w+/g) ?? []) registered.add(w);
      });
      for (const l of lines) {
        for (const re of PATTERNS) {
          const m = l.match(re);
          if (!m) continue;
          const name = m[1]!;
          // An UPPER_CASE Set/Map is a constant table (roles, phases); per-team records are always state.
          if (!re.source.includes("Record") && /^[A-Z0-9_]+$/.test(name)) continue;
          if (registered.has(name) || ALLOW[`${rel}:${name}`]) continue;
          missing.push(`${rel}:${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
