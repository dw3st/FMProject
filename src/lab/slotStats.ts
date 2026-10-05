/**
 * Per-slot statistics of a full-engine lab match (player instructions, `player-instructions.md`):
 * passes, shots, goals, crosses, tackles, pressing ticks, mean x / |y − 37| with the ball and end
 * energy, by formation slot (a substitute counts for the slot he plays). Fed by the `simulateMatch`
 * `onTick` hook plus the result's player stats.
 */
import { isLivePhase } from "@/GameEngine/Domain/gameState";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import type { MatchResult } from "@/GameEngine/Domain/SimulateMatch";
import type { GameState, TeamId } from "@/GameEngine/types";
import type { LabSlotRaw, LabSlotView } from "@/lab/types";

export function emptySlotRaw(role = ""): LabSlotRaw {
  return { role, passes: 0, shots: 0, goals: 0, crosses: 0, tackles: 0, pressTicks: 0, xSum: 0, widthSum: 0, posSamples: 0, endEnergySum: 0, endEnergyN: 0 };
}

/** Element-wise sum (by slot index); the role of the first non-empty entry is kept. */
export function addSlotRaws(a: LabSlotRaw[] | undefined, b: LabSlotRaw[] | undefined): LabSlotRaw[] {
  const out: LabSlotRaw[] = [];
  const n = Math.max(a?.length ?? 0, b?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const x = a?.[i] ?? emptySlotRaw();
    const y = b?.[i] ?? emptySlotRaw();
    out.push({
      role: x.role || y.role,
      passes: x.passes + y.passes,
      shots: x.shots + y.shots,
      goals: x.goals + y.goals,
      crosses: x.crosses + y.crosses,
      tackles: x.tackles + y.tackles,
      pressTicks: x.pressTicks + y.pressTicks,
      xSum: x.xSum + y.xSum,
      widthSum: x.widthSum + y.widthSum,
      posSamples: x.posSamples + y.posSamples,
      endEnergySum: x.endEnergySum + y.endEnergySum,
      endEnergyN: x.endEnergyN + y.endEnergyN,
    });
  }
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function slotViews(raws: LabSlotRaw[] | undefined, matches: number): LabSlotView[] {
  const m = Math.max(1, matches);
  return (raws ?? []).map((s) => ({
    role: s.role,
    passes: r2(s.passes / m),
    shots: r2(s.shots / m),
    goals: r2(s.goals / m),
    crosses: r2(s.crosses / m),
    tackles: r2(s.tackles / m),
    pressTicks: r2(s.pressTicks / m),
    avgX: s.posSamples > 0 ? r2(s.xSum / s.posSamples) : 0,
    avgWidth: s.posSamples > 0 ? r2(s.widthSum / s.posSamples) : 0,
    endEnergy: s.endEnergyN > 0 ? r2(s.endEnergySum / s.endEnergyN) : 0,
  }));
}

/** Collector for one match: pass `onTick` to `simulateMatch`, then `finish(result)`. */
export function createSlotCollector() {
  const where = new Map<number, { team: TeamId; slot: number }>();
  const slots: Record<TeamId, LabSlotRaw[]> = { A: [], B: [] };
  const at = (team: TeamId, slot: number, role: string) => {
    while (slots[team].length <= slot) slots[team].push(emptySlotRaw());
    const s = slots[team][slot]!;
    if (!s.role) s.role = role;
    return s;
  };
  return {
    onTick(s: GameState): void {
      for (const p of s.players) if (p.slotIndex >= 0) where.set(p.id, { team: p.team, slot: p.slotIndex });
      if (!isLivePhase(s.matchPhase) || s.setPiece || s.pass || s.looseBall) return;
      const holder = s.players.find((p) => p.id === s.ballHolderId);
      if (!holder) return;
      for (const p of s.players) {
        if (p.slotIndex < 0) continue;
        const st = at(p.team, p.slotIndex, p.role);
        if (p.team === holder.team) {
          if (p.id === holder.id) continue;
          st.xSum += p.attackDir === 1 ? p.x : PITCH_LENGTH - p.x;
          st.widthSum += Math.abs(p.y - 37);
          st.posSamples++;
        } else if (s.decisions[p.id]?.type === "press") {
          st.pressTicks++;
        }
      }
    },
    finish(r: MatchResult): Record<TeamId, LabSlotRaw[]> {
      for (const [id, ps] of r.playerStats) {
        const w = where.get(id);
        if (!w) continue;
        const st = at(w.team, w.slot, "");
        st.passes += ps.passesAttempted;
        st.shots += ps.shots;
        st.goals += ps.goals;
        st.crosses += ps.crosses;
        st.tackles += ps.tackles;
      }
      for (const p of r.players) {
        if (p.slotIndex < 0) continue;
        const st = at(p.team, p.slotIndex, p.role);
        st.endEnergySum += p.energy;
        st.endEnergyN++;
      }
      return slots;
    },
  };
}
