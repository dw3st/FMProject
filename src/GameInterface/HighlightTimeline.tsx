/**
 * `/test` debug panel of the highlight layer (stage 18, `.claude/rules/game-engine/highlights.md`): the lances of the
 * current match on a timeline of the live play, the level filter, and "Next lance" (simulates ahead and rewinds to the
 * next window's start, `HighlightSkip.ts`). Debug screen: not the game's UI.
 */
import { useState } from "react";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getHighlights, getHighlightLiveSeconds } from "@/GameEngine/Domain/HighlightTracker";
import { HIGHLIGHT_LEVELS, highlightsAtLevel, summarizeHighlights, type HighlightLevel } from "@/GameEngine/Domain/Highlights";
import { skipToNextHighlight } from "@/GameEngine/Support/HighlightSkip";
import { TIME_SCALE } from "@/GameEngine/Domain/gameState";
import type { GameState } from "@/GameEngine/types";

const LEVEL_CLASS: Record<HighlightLevel, string> = {
  main: "bg-red-500",
  extended: "bg-amber-400",
  full: "bg-sky-500",
};
/** Live sim seconds of a whole match (two halves) — the axis when the match is shorter so far. */
const MATCH_SECONDS = (2 * 2700) / TIME_SCALE;

export function HighlightTimeline({ gameState }: { gameState: GameState | null }) {
  const [level, setLevel] = useState<HighlightLevel>("extended");
  void gameState; // re-rendered by the live state; the data is the tracker's
  const all = getHighlights();
  const clock = getHighlightLiveSeconds();
  const axis = Math.max(MATCH_SECONDS, clock);
  const shown = highlightsAtLevel(all, level);
  const sum = summarizeHighlights(all, clock);
  const pct = (t: number) => `${(100 * t) / axis}%`;
  return (
    <div className="p-3 text-sm space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold">Lances</span>
        {HIGHLIGHT_LEVELS.map(l => (
          <button key={l} onClick={() => setLevel(l)}
            className={`px-2 py-0.5 rounded border ${level === l ? "border-white/60 bg-white/15" : "border-white/10"}`}>
            {l} {sum[l].count} · {sum[l].seconds.toFixed(0)} s · {(100 * sum[l].share).toFixed(0)}%
          </button>
        ))}
        <button className="ml-auto px-2 py-0.5 rounded border border-white/20 hover:bg-white/10"
          title="Simulates ahead until the next lance at this level and jumps to its start"
          onClick={() => gameBus.emit("testCommand", { type: "edit", edit: s => skipToNextHighlight(s, level) })}>
          Next lance ⏭
        </button>
      </div>
      <div className="relative h-6 rounded bg-white/5 overflow-hidden">
        {shown.map(h => (
          <div key={h.id} className={`absolute top-1 bottom-1 ${LEVEL_CLASS[h.level]} opacity-80`}
            style={{ left: pct(h.start), width: pct(Math.max(0.5, h.end - h.start)) }}
            title={`${h.minute}' ${h.kind} (${h.level}) ${h.team ?? ""} · ${(h.end - h.start).toFixed(1)} s · ${h.triggers.join(", ")}`} />
        ))}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: pct(clock) }} />
        <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: pct(MATCH_SECONDS / 2) }} />
      </div>
      <div className="max-h-40 overflow-y-auto font-mono text-[13px] space-y-0.5">
        {[...shown].reverse().slice(0, 30).map(h => (
          <div key={h.id} className="flex gap-2">
            <span className={`w-2 h-2 mt-1.5 rounded-full ${LEVEL_CLASS[h.level]}`} />
            <span className="w-10 tabular-nums">{h.minute}'</span>
            <span className="w-28">{h.kind}</span>
            <span className="w-6">{h.team ?? "–"}</span>
            <span className="w-28 tabular-nums">{h.start.toFixed(1)}–{h.end.toFixed(1)} s</span>
            <span className="text-white/50 truncate">{h.triggers.join(" · ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
