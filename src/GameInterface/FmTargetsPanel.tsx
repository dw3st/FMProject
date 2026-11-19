import { useEffect, useState } from "react";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getTeamStats } from "@/GameEngine/Domain/Statistics";
import { matchMinute } from "@/GameEngine/Domain/gameState";
import type { GameState } from "@/GameEngine/types";
import { CONDITION_MINUTES, FM_CONDITION, fmCountsOf, fmTargetRows, median } from "@/lab/fmTargets";

/**
 * /test debug panel (engine rebuild stage 0): the FM per-match targets (R9, both teams, `src/lab/fmTargets.ts`) next
 * to the current match's value so far, plus the outfield median condition against FM's at the same minute and the
 * match seed (`GameState.seed`, replays the match).
 */
export function FmTargetsPanel({ gameState }: { gameState: GameState | null }) {
  const [, bump] = useState(0);
  useEffect(() => gameBus.on("statsUpdated", () => bump((n) => n + 1)), []);
  const a = getTeamStats("A");
  const b = getTeamStats("B");
  const rows = fmTargetRows(fmCountsOf({ ...a, goals: gameState?.score.A ?? a.goals }, { ...b, goals: gameState?.score.B ?? b.goals }));
  const minute = gameState ? matchMinute(gameState) : 0;
  const idx = CONDITION_MINUTES.findIndex((m) => minute <= m);
  const outfield = gameState?.players.filter((p) => p.role !== "GK").map((p) => p.energy) ?? [];
  return (
    <div className="bg-card/80 border-t border-border p-3 text-xs font-mono">
      <div className="flex gap-4 mb-2 text-white/70">
        <span>FM targets (per match, both teams). Minute {minute}' — the match values are so far, FM's are full time.</span>
        {gameState?.seed !== undefined && <span>seed {gameState.seed}</span>}
      </div>
      <table className="w-full max-w-xl">
        <thead>
          <tr className="text-white/50 text-left">
            <th className="pr-3">Metric</th><th className="pr-3 text-right">This match</th><th className="pr-3 text-right">FM</th>
            <th className="pr-3 text-right">×</th><th className="pr-3">Conf.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.target.key} className="border-t border-white/5">
              <td className="pr-3 text-white/80">{r.target.label}</td>
              <td className="pr-3 text-right tabular-nums">{r.ours}</td>
              <td className="pr-3 text-right tabular-nums text-white/60">{r.fm}</td>
              <td className="pr-3 text-right tabular-nums text-white/60">{r.ratio === null ? "" : r.ratio.toFixed(2)}</td>
              <td className="pr-3 text-white/50">{r.target.confidence}</td>
            </tr>
          ))}
          <tr className="border-t border-white/5">
            <td className="pr-3 text-white/80">Outfield condition (median)</td>
            <td className="pr-3 text-right tabular-nums">{outfield.length ? median(outfield).toFixed(1) : "—"}</td>
            <td className="pr-3 text-right tabular-nums text-white/60">{idx >= 0 ? `${FM_CONDITION[idx]} at ${CONDITION_MINUTES[idx]}'` : "—"}</td>
            <td /><td className="pr-3 text-white/50">H</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
