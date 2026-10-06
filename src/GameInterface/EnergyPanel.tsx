import { useMemo, useRef } from "react";
import type { GameState, GamePlayer } from "@/GameEngine/types";
import type { StaffEffects } from "@/Domain/staff/staff";
import { moraleExecutionMult } from "@/Domain/morale/morale";
import { temperamentFoulMult, temperamentYellowMult } from "@/Domain/personality/personality";
import { MORALE } from "@/Domain/morale/moraleConfig";

/**
 * `/test` debug panel — live per-player energy and drain-per-game-minute, computed from the
 * deltas between consecutive `stateChanged` snapshots (there is no engine event for "energy
 * changed"; this panel reads `GamePlayer.energy` directly off the live `GameState` each tick).
 *
 * The instantaneous tick-to-tick rate is noisy (a 0.2s real tick is ~2.6 game-seconds — a tiny
 * energy delta over a tiny time window), so the displayed rate is an exponential moving average
 * per player rather than the raw single-tick delta.
 */

const SMOOTHING = 0.85;

interface Props {
  gameState: GameState | null;
  teamColorA: string;
  teamColorB: string;
  /** Technical-staff effects of each side (`staffEffectsOf`): recovery between games, injury risk. */
  staffA?: StaffEffects;
  staffB?: StaffEffects;
  /** Style familiarity effects of each side: attribute multiplier and press stamina multiplier. */
  styleA?: StyleEffects;
  styleB?: StyleEffects;
}

interface StyleEffects {
  familiarity: number;
  execution: number;
  pressStamina: number;
}

export function EnergyPanel({ gameState, teamColorA, teamColorB, staffA, staffB, styleA, styleB }: Props) {
  const prevRef = useRef<Map<number, { energy: number; matchTime: number }>>(new Map());
  const smoothedDrainRef = useRef<Map<number, number>>(new Map());
  const lastMatchTimeRef = useRef(0);

  const players = gameState?.players ?? [];
  const matchTime = gameState?.matchTime ?? 0;

  // A new scenario (or a replay) makes matchTime jump backward — reset the trackers so we don't
  // compute a nonsense rate from a huge, meaningless time delta.
  if (matchTime < lastMatchTimeRef.current - 0.01) {
    prevRef.current.clear();
    smoothedDrainRef.current.clear();
  }
  lastMatchTimeRef.current = matchTime;

  const drainByPlayer = useMemo(() => {
    for (const p of players) {
      const prev = prevRef.current.get(p.id);
      if (prev) {
        const dtMinutes = (matchTime - prev.matchTime) / 60;
        if (dtMinutes > 0.0005) {
          const instant = (prev.energy - p.energy) / dtMinutes;
          const prevSmoothed = smoothedDrainRef.current.get(p.id) ?? instant;
          smoothedDrainRef.current.set(p.id, prevSmoothed * SMOOTHING + instant * (1 - SMOOTHING));
        }
      }
      prevRef.current.set(p.id, { energy: p.energy, matchTime });
    }
    return new Map(smoothedDrainRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, matchTime]);

  if (!gameState) {
    return <div className="text-xs text-muted-foreground p-3">No live match — start a scenario first.</div>;
  }

  const teamA = players.filter((p) => p.team === "A").slice().sort((a, b) => a.energy - b.energy);
  const teamB = players.filter((p) => p.team === "B").slice().sort((a, b) => a.energy - b.energy);

  return (
    <div className="bg-card/80 backdrop-blur-sm border-t border-border">
      <div className="px-4 py-2 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Energy &amp; Fatigue
        </h3>
      </div>
      <div className="flex gap-4 p-2">
        <EnergyTeamTable accentColor={teamColorA} players={teamA} drain={drainByPlayer} side="left" staff={staffA} style={styleA} />
        <EnergyTeamTable accentColor={teamColorB} players={teamB} drain={drainByPlayer} side="right" staff={staffB} style={styleB} />
      </div>
    </div>
  );
}

function energyColor(energy: number): string {
  if (energy >= 70) return "text-emerald-400";
  if (energy >= 40) return "text-amber-400";
  return "text-red-400";
}

function EnergyTeamTable({
  accentColor,
  players,
  drain,
  side,
  staff,
  style,
}: {
  accentColor: string;
  players: GamePlayer[];
  drain: Map<number, number>;
  side: "left" | "right";
  staff?: StaffEffects;
  style?: StyleEffects;
}) {
  return (
    <div className="flex-1 min-w-0">
      {staff && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground tabular-nums">
          Staff: recovery x{staff.recoveryMult.toFixed(2)} / injury x{staff.injuryMult.toFixed(2)}
        </div>
      )}
      {style && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground tabular-nums">
          Familiarity {style.familiarity}: attributes x{style.execution.toFixed(3)} / press stamina x{style.pressStamina.toFixed(2)}
        </div>
      )}
      {players.length > 0 && (() => {
        // Morale (`.claude/rules/game/morale.md`): each player's attributes × (1 + 0.02 × factor).
        const avg = players.reduce((a, p) => a + (p.morale ?? MORALE.NEUTRAL), 0) / players.length;
        return (
          <div className="px-3 py-1 text-[10px] text-muted-foreground tabular-nums">
            Morale {Math.round(avg)}: attributes x{moraleExecutionMult(avg).toFixed(3)}
          </div>
        );
      })()}
      {players.length > 0 && (() => {
        // Temperament (`.claude/rules/game/personality.md`): foul chance x (1 + 0.45 t) per player.
        const t = players.reduce((a, p) => a + (p.temperament ?? 0), 0) / players.length;
        return (
          <div className="px-3 py-1 text-[10px] text-muted-foreground tabular-nums">
            Temperament {(10.5 + 9.5 * t).toFixed(1)}: fouls x{temperamentFoulMult(t).toFixed(2)} / yellow x{temperamentYellowMult(t).toFixed(2)}
          </div>
        );
      })()}
      <div className="grid grid-cols-[40px_1fr_60px_90px] gap-1 px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground border-b border-border/50">
        <div />
        <div className={side === "right" ? "text-right" : ""}>Name</div>
        <div className="text-right">Energy</div>
        <div className="text-right">Drain/min</div>
      </div>
      <div className="text-xs">
        {players.map((p) => {
          const rate = drain.get(p.id) ?? 0;
          return (
            <div
              key={p.id}
              className="grid grid-cols-[40px_1fr_60px_90px] gap-1 px-3 py-1 border-b border-border/20 hover:bg-secondary/20"
            >
              <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />
                <span className="text-[10px] font-bold text-muted-foreground">{p.role}</span>
              </div>
              <div className={`font-medium text-foreground truncate ${side === "right" ? "text-right" : ""}`}>
                {p.name}
              </div>
              <div className={`text-right font-bold tabular-nums ${energyColor(p.energy)}`}>
                {Math.round(p.energy)}
              </div>
              <div className="text-right text-muted-foreground tabular-nums">
                {rate > 0.05 ? `-${rate.toFixed(1)}/min` : rate < -0.05 ? `+${(-rate).toFixed(1)}/min` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
