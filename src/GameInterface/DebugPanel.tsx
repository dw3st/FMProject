import { useEffect, useRef, useState } from "react";
import { onDebugLog, getDebugLog } from "@/GameEngine/Suport/DebugLog";
import type { DebugEntry } from "@/GameEngine/Suport/DebugLog";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import type { GameState } from "@/GameEngine/types";
import { JsonView, darkStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

const CATEGORY_CLASS: Record<DebugEntry["category"], string> = {
  decision:     "text-cyan-400",
  tackle:       "text-orange-400",
  interception: "text-yellow-400",
  pass:         "text-blue-400",
  shot:         "text-red-400",
  possession:   "text-emerald-400",
  offside:      "text-purple-400",
  dribble:      "text-fuchsia-400",
  throughBall:  "text-purple-400",
};

type ActionScoreKey = 'shoot' | 'pass' | 'carry' | 'dribble' | 'throughBall';

const ACTION_ROWS: { key: ActionScoreKey; label: string; color: string; bestKey: GameEvents['decisionScores']['best'] }[] = [
  { key: 'shoot',       label: 'SHOOT',   color: 'bg-red-500',     bestKey: 'shoot' },
  { key: 'pass',        label: 'PASS',    color: 'bg-blue-500',    bestKey: 'pass' },
  { key: 'carry',       label: 'CARRY',   color: 'bg-emerald-500', bestKey: 'carry' },
  { key: 'dribble',     label: 'DRIBBLE', color: 'bg-fuchsia-500', bestKey: 'dribble' },
  { key: 'throughBall', label: 'TB',      color: 'bg-purple-500',  bestKey: 'through_ball' },
];

/** Single component row inside an action breakdown grid. */
function BdItem({ label, value, sign = '+' }: { label: string; value: number; sign?: '+' | '-' }) {
  const cls = sign === '+' ? 'text-emerald-400/80' : 'text-rose-400/80';
  const prefix = sign === '+' ? (value >= 0 ? '+' : '') : (value > 0 ? '−' : '');
  const display = sign === '-' ? Math.abs(value) : value;
  return (
    <span>
      {label} <span className={`tabular-nums ${cls}`}>{prefix}{display.toFixed(2)}</span>
    </span>
  );
}

type OffBallIntent = GameEvents['offBallScores']['intent'];
type DefIntent    = GameEvents['defensiveScores']['chosenIntent'];

const INTENT_ROWS: { key: OffBallIntent; label: string; activeColor: string }[] = [
  { key: 'offer_support', label: 'SUPPORT', activeColor: 'bg-emerald-500' },
  { key: 'hold_space',    label: 'SHAPE',   activeColor: 'bg-violet-500'  },
  { key: 'make_run',      label: 'RUN',     activeColor: 'bg-red-500'     },
];

const INTENT_TEXT_COLOR: Record<OffBallIntent, string> = {
  offer_support: 'text-emerald-400',
  hold_space:    'text-violet-400',
  make_run:      'text-red-400',
};

const INTENT_LABEL: Record<OffBallIntent, string> = {
  offer_support: 'SUPPORT',
  hold_space:    'SHAPE',
  make_run:      'RUN',
};

const DEF_INTENT_ROWS: { key: DefIntent; label: string; activeColor: string }[] = [
  { key: 'hold_shape',           label: 'SHAPE',  activeColor: 'bg-blue-500'    },
  { key: 'track_mark',           label: 'MARK',   activeColor: 'bg-cyan-500'    },
  { key: 'press_holder',         label: 'PRESS',  activeColor: 'bg-orange-500'  },
  { key: 'step_into_carry_lane', label: 'STEP',   activeColor: 'bg-red-500'     },
];

const DEF_INTENT_TEXT_COLOR: Record<DefIntent, string> = {
  hold_shape:           'text-blue-400',
  track_mark:           'text-cyan-400',
  press_holder:         'text-orange-400',
  step_into_carry_lane: 'text-red-400',
};

const OFF_BALL_DECISION_COLOR: Record<GameEvents['offBallScores']['decision'], string> = {
  support_run:  'text-cyan-400',
  create_space: 'text-purple-400',
  idle:         'text-muted-foreground/40',
};

interface Props {
  gameState?: GameState;
  selectedPlayerId?: number | null;
  ballHolderId?: number;
  /**
   * Which sub-panel to render. `"both"` (default) preserves the original
   * combined layout. `"log"` renders only the debug-log/state column.
   * `"scores"` renders only the live decision-scores column.
   */
  slot?: 'both' | 'log' | 'scores';
  /** Optional explicit height for the log scroll area. Defaults to h-44. */
  logHeightClass?: string;
}

export function DebugPanel({ gameState, selectedPlayerId, ballHolderId, slot = 'both', logHeightClass = 'h-44' }: Props) {
  const [entries, setEntries]         = useState<DebugEntry[]>(getDebugLog);
  const [tab, setTab]                 = useState<"log" | "state">("log");
  const [scores, setScores]           = useState<GameEvents['decisionScores'] | null>(null);
  const [offBallMap, setOffBallMap]   = useState<Map<number, GameEvents['offBallScores']>>(new Map);
  const [defMap, setDefMap]           = useState<Map<number, GameEvents['defensiveScores']>>(new Map);
  const [tbScores, setTbScores]       = useState<GameEvents['throughBallScores'] | null>(null);
  const selectedPlayerIdRef = useRef(selectedPlayerId);
  useEffect(() => { selectedPlayerIdRef.current = selectedPlayerId; }, [selectedPlayerId]);

  useEffect(() => onDebugLog(setEntries), []);
  useEffect(() => gameBus.on('decisionScores', setScores), []);
  useEffect(() => gameBus.on('throughBallScores', setTbScores), []);
  useEffect(() => gameBus.on('offBallScores', data => {
    setOffBallMap(prev => {
      const next = new Map(prev);
      next.set(data.playerId, data);
      return next;
    });
  }), []);
  useEffect(() => gameBus.on('defensiveScores', data => {
    setDefMap(prev => {
      const next = new Map(prev);
      next.set(data.playerId, data);
      return next;
    });
  }), []);

  const DEFENDING_TYPES = new Set(['hold_shape', 'track_mark', 'press', 'step_into_carry_lane', 'tackle']);
  const showBallHolder = selectedPlayerId === null || selectedPlayerId === undefined || selectedPlayerId === ballHolderId;
  const selectedDecision = selectedPlayerId != null ? gameState?.decisions?.[selectedPlayerId] : null;
  const isDefendingByDecision = selectedDecision != null && DEFENDING_TYPES.has(selectedDecision.type);
  const selectedPlayer  = selectedPlayerId != null ? gameState?.players.find(p => p.id === selectedPlayerId) : null;
  const ballHolderTeam  = gameState?.players.find(p => p.id === ballHolderId)?.team;
  const isDefendingByTeam = selectedPlayer != null && selectedPlayer.team !== ballHolderTeam;
  const isDefending     = !showBallHolder && (isDefendingByDecision || isDefendingByTeam);
  const offBallData     = !showBallHolder && !isDefending && selectedPlayerId != null ? offBallMap.get(selectedPlayerId) ?? null : null;
  const defData         = !showBallHolder && isDefending && selectedPlayerId != null ? defMap.get(selectedPlayerId) ?? null : null;
  // Show 'defensive' as soon as we know the player is defending — don't wait for first event
  const rightPanelMode  = showBallHolder ? 'holder' : (isDefending ? 'defensive' : (offBallData ? 'offball' : 'none'));

  const logSection = (
    <div className={`min-w-0 ${slot === 'both' ? 'flex-1 border-r border-border' : 'flex-1'}`}>
      <div className="flex items-center border-b border-border">
        {(["log", ...(gameState ? ["state"] : [])] as ("log" | "state")[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer ${
              tab === t
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "log" ? "Debug Log" : "Game State"}
          </button>
        ))}
      </div>

      {tab === "log" ? (
        <div className={`${logHeightClass} overflow-y-auto py-1.5 font-mono`}>
          {entries.map(e => (
            <div key={e.id} className="flex gap-2 px-3 py-px text-[11px] leading-relaxed">
              <span className="text-muted-foreground/40 shrink-0 w-14">
                {new Date(e.time).toISOString().slice(17, 23)}
              </span>
              <span className={`shrink-0 w-20 font-bold ${CATEGORY_CLASS[e.category]}`}>
                {e.category.toUpperCase()}
              </span>
              <span className="text-foreground/70">{e.message}</span>
            </div>
          ))}
        </div>
      ) : gameState ? (
        <div className={`${logHeightClass} overflow-y-auto px-2 py-1.5 text-[11px]`}>
          <JsonView data={gameState} style={darkStyles} />
        </div>
      ) : null}
    </div>
  );

  if (slot === 'log') {
    return <div className="card-arcade rounded-xl overflow-hidden flex">{logSection}</div>;
  }

  const scoresSection = (
    <div className={`${slot === 'both' ? 'w-52 shrink-0' : 'w-full'} flex flex-col min-h-0`}>
        <div className="px-3 py-1.5 border-b border-border text-[10px] font-bold tracking-widest uppercase text-muted-foreground shrink-0">
          {rightPanelMode === 'holder' ? 'Decision Scores' : rightPanelMode === 'offball' ? 'Off-Ball Scores' : rightPanelMode === 'defensive' ? 'Defensive Scores' : 'Scores'}
        </div>
        <div className="flex-1 flex flex-col px-3 py-2 gap-2 overflow-y-auto">

          {/* ── Ball holder view ── */}
          {rightPanelMode === 'holder' && (scores ? (
            <>
              <div className="text-[11px] font-semibold text-foreground/80 truncate mb-1">
                {scores.playerName}
              </div>
              {ACTION_ROWS.map(({ key, label, color, bestKey }) => {
                const val    = scores[key] as number;
                const isBest = scores.best === bestKey;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`text-[10px] w-12 font-bold shrink-0 ${isBest ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {label}
                    </span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-75 ${isBest ? color : 'bg-white/20'}`}
                        style={{ width: `${Math.min(100, val * 100).toFixed(1)}%` }} />
                    </div>
                    <span className={`text-[10px] w-8 text-right tabular-nums shrink-0 ${isBest ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                      {(val * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
              {/* ── Per-action breakdowns (raw weights driving each score) ── */}
              {scores.breakdowns && (
                <div className="mt-1 pt-1.5 border-t border-white/5 space-y-1.5">
                  {/* SHOOT */}
                  {(() => {
                    const b = scores.breakdowns.shoot;
                    return (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold tracking-widest uppercase text-red-400/80">Shoot (raw)</span>
                          <span className="text-[10px] font-bold tabular-nums text-red-400">{(b.score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-[9px] tabular-nums text-muted-foreground/70">
                          <BdItem label="xG"    value={b.xg} />
                          <BdItem label="role"  value={b.roleScore} />
                          <BdItem label="floor" value={b.xgFloor} />
                          <BdItem label="int"   value={b.intentBonus} />
                        </div>
                        <div className="text-[9px] tabular-nums text-muted-foreground/50">
                          dist {b.dist.toFixed(1)}y
                          <span className="ml-2">∠ {(b.openAngle * 180 / Math.PI).toFixed(0)}°</span>
                          <span className="ml-2">press {b.pressure.toFixed(2)}</span>
                          <span className="ml-2">thr {b.threshold.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* PASS */}
                  {(() => {
                    const b = scores.breakdowns.pass;
                    return (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold tracking-widest uppercase text-blue-400/80">Pass (raw)</span>
                          <span className="text-[10px] font-bold tabular-nums text-blue-400">{(b.score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-[9px] tabular-nums text-muted-foreground/70">
                          <BdItem label="prog"  value={b.progressScore} />
                          <BdItem label="lane"  value={b.laneScore} />
                          <BdItem label="space" value={b.receiverSpaceScore} />
                          <BdItem label="goal"  value={b.goalProximityBonus} />
                          <BdItem label="dist"  value={b.distancePenalty} sign="-" />
                          <BdItem label="vis"   value={b.visionRangePenalty} sign="-" />
                          <BdItem label="mod"   value={b.playerModifier} />
                          <BdItem label="tac"   value={b.tacticalModifier} />
                          <BdItem label="far"   value={b.passTargetBonus} />
                        </div>
                        <div className="text-[9px] tabular-nums text-muted-foreground/50">
                          base {b.baseScore.toFixed(2)}
                          <span className="ml-2">raw {b.rawScore.toFixed(2)}</span>
                          {b.toId != null && (() => {
                            const r = gameState?.players.find(p => p.id === b.toId);
                            return r ? <span className="ml-2">→ {r.name}</span> : null;
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  {/* CARRY */}
                  {scores.breakdowns.carry && (() => {
                    const b = scores.breakdowns.carry;
                    return (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold tracking-widest uppercase text-emerald-400/80">Carry (raw)</span>
                          <span className="text-[10px] font-bold tabular-nums text-emerald-400">{(b.score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-[9px] tabular-nums text-muted-foreground/70">
                          <BdItem label="clear" value={b.clearanceScore} />
                          <BdItem label="prog"  value={b.progressScore} />
                          <BdItem label="angle" value={b.angleScore} />
                          <BdItem label="crowd" value={b.crowdPenalty} sign="-" />
                          <BdItem label="role"  value={b.roleBias} />
                          <BdItem label="vis"   value={b.visionBonus} />
                          <BdItem label="press" value={b.pressurePenalty} sign="-" />
                          <BdItem label="mod"   value={b.playerModifier} />
                          <BdItem label="zone"  value={b.rolePenalty} sign="-" />
                          <BdItem label="line"  value={b.bylinePenalty} sign="-" />
                          <BdItem label="far"   value={b.laneBonus} />
                        </div>
                        <div className="text-[9px] tabular-nums text-muted-foreground/50">
                          base {b.baseScore.toFixed(2)}
                          <span className="ml-2">raw {b.rawScore.toFixed(2)}</span>
                          <span className="ml-2">dx {b.dx.toFixed(2)}</span>
                          <span className="ml-1">dy {b.dy.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* DRIBBLE */}
                  {(() => {
                    const b = scores.breakdowns.dribble;
                    return (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold tracking-widest uppercase text-fuchsia-400/80">Dribble (raw)</span>
                          <span className="text-[10px] font-bold tabular-nums text-fuchsia-400">{(b.score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-[9px] tabular-nums text-muted-foreground/70">
                          <BdItem label="role"  value={b.roleTendency} />
                          <BdItem label="block" value={b.forwardBlock} />
                        </div>
                        <div className="text-[9px] tabular-nums text-muted-foreground/50">
                          raw {b.rawScore.toFixed(2)}
                          {b.targetId != null && (() => {
                            const t = gameState?.players.find(p => p.id === b.targetId);
                            return t ? <span className="ml-2">vs {t.name}</span> : null;
                          })()}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Through-ball best cell breakdown ── */}
              {tbScores && tbScores.playerId === scores.playerId && tbScores.cells.length > 0 && (() => {
                const best = tbScores.cells[0]!;
                return (
                  <div className="mt-1 pt-1.5 border-t border-white/5 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold tracking-widest uppercase text-purple-400/80">TB Cell (raw)</span>
                      <span className="text-[10px] font-bold tabular-nums text-purple-400">{(best.score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 text-[9px] tabular-nums text-muted-foreground/70">
                      <span>race  <span className="text-emerald-400/80">+{best.raceMarginScore.toFixed(2)}</span></span>
                      <span>space <span className="text-emerald-400/80">+{best.spaceQualityScore.toFixed(2)}</span></span>
                      <span>goal  <span className="text-emerald-400/80">+{best.goalThreatScore.toFixed(2)}</span></span>
                      <span>skill <span className="text-emerald-400/80">+{best.passerSkillScore.toFixed(2)}</span></span>
                      <span>path  <span className="text-emerald-400/80">+{best.pathClearScore.toFixed(2)}</span></span>
                      <span>lane  <span className="text-rose-400/80">−{best.laneRiskPenalty.toFixed(2)}</span></span>
                      <span>off   <span className="text-rose-400/80">−{best.offsideRiskPenalty.toFixed(2)}</span></span>
                    </div>
                    <div className="text-[9px] tabular-nums text-muted-foreground/50">
                      Δeta {best.raceMargin >= 0 ? '+' : ''}{best.raceMargin.toFixed(2)}s
                      <span className="ml-2">A:{Number.isFinite(best.bestAttackerEta) ? best.bestAttackerEta.toFixed(1) : '∞'}s</span>
                      <span className="ml-1">D:{Number.isFinite(best.bestDefenderEta) ? best.bestDefenderEta.toFixed(1) : '∞'}s</span>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">waiting…</span>
          ))}

          {/* ── Off-ball player view ── */}
          {rightPanelMode === 'offball' && (offBallData ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[11px] font-semibold text-foreground/80 truncate flex-1">
                  {offBallData.playerName}
                </div>
                <span className={`text-[10px] font-bold uppercase ${OFF_BALL_DECISION_COLOR[offBallData.decision]}`}>
                  {offBallData.decision.replace(/_/g, ' ')}
                </span>
                <span className={`text-[10px] font-bold uppercase ${INTENT_TEXT_COLOR[offBallData.intent]}`}>
                  {INTENT_LABEL[offBallData.intent]}
                </span>
              </div>
              {/* Intent score bars */}
              {INTENT_ROWS.map(({ key, label, activeColor }) => {
                const isWinner = offBallData.intent === key;
                const raw = offBallData.intentScores[key];
                const maxScore = Math.max(...Object.values(offBallData.intentScores), 0.01);
                const pct = Math.min(100, (raw / maxScore) * 100);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`text-[10px] w-14 font-bold shrink-0 ${isWinner ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                      {label}
                    </span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-75 ${isWinner ? activeColor : 'bg-white/20'}`}
                        style={{ width: `${pct.toFixed(1)}%` }} />
                    </div>
                    <span className={`text-[10px] w-8 text-right tabular-nums shrink-0 ${isWinner ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                      {raw.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">select a player…</span>
          ))}

          {/* ── Defensive player view ── */}
          {rightPanelMode === 'defensive' && !defData && (
            <span className="text-[11px] text-muted-foreground/40">waiting for debug data…</span>
          )}
          {rightPanelMode === 'defensive' && (defData ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[11px] font-semibold text-foreground/80 truncate flex-1">
                  {defData.playerName}
                </div>
                <span className={`text-[10px] font-bold uppercase ${DEF_INTENT_TEXT_COLOR[defData.chosenIntent]}`}>
                  {defData.chosenIntent.replace(/_/g, ' ')}
                </span>
              </div>
              {DEF_INTENT_ROWS.map(({ key, label, activeColor }) => {
                const isWinner = defData.chosenIntent === key;
                const raw = defData.scores[key];
                const maxScore = Math.max(...Object.values(defData.scores), 0.01);
                const pct = Math.min(100, (raw / maxScore) * 100);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`text-[10px] w-10 font-bold shrink-0 ${isWinner ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                      {label}
                    </span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-75 ${isWinner ? activeColor : 'bg-white/20'}`}
                        style={{ width: `${pct.toFixed(1)}%` }} />
                    </div>
                    <span className={`text-[10px] w-8 text-right tabular-nums shrink-0 ${isWinner ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                      {raw.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground/50">
                <span>threat: {defData.holderThreat.toFixed(2)}</span>
                <span>mark: {defData.markThreat.toFixed(2)}</span>
                <span>carry+: {defData.carryLaneBonus.toFixed(2)}</span>
              </div>
              {gameState && (() => {
                const t = Math.min(1, (gameState.possessionTime ?? 0) / 15);
                const tSq = t * t;
                return (
                  <div className="flex gap-2 text-[9px] text-muted-foreground/50">
                    <span>t: {t.toFixed(2)}</span>
                    <span className="text-orange-400/70">press×{(1 + tSq * 0.8).toFixed(2)}</span>
                    <span className="text-blue-400/70">shape×{(1 - tSq * 0.4).toFixed(2)}</span>
                  </div>
                );
              })()}
            </>
          ) : null)}

          {rightPanelMode === 'none' && (
            <span className="text-[11px] text-muted-foreground/40">select a player…</span>
          )}

        </div>

        {/* ── Possession timer / patience — always visible ── */}
        {gameState && (() => {
          const possTime  = gameState.possessionTime ?? 0;
          const patienceT = Math.min(1, possTime / 15);
          const patienceSq = patienceT * patienceT;
          const holder    = gameState.players.find(p => p.id === gameState.ballHolderId);
          const teamColor = holder?.team === 'A' ? 'text-blue-400' : 'text-red-400';
          return (
            <div className="border-t border-border px-3 py-2 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground/50">Possession</span>
                <span className={`text-[10px] font-bold tabular-nums ${teamColor}`}>
                  Team {holder?.team ?? '?'} — {possTime.toFixed(1)}s
                </span>
              </div>
              {/* Patience ramp bar */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground/50 shrink-0 w-12">patience</span>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${patienceSq > 0.6 ? 'bg-orange-500' : patienceSq > 0.25 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                    style={{ width: `${(patienceSq * 100).toFixed(1)}%` }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-muted-foreground/60 w-8 text-right shrink-0">
                  {(patienceSq * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })()}

      </div>
  );

  if (slot === 'scores') {
    return <div className="card-arcade rounded-xl overflow-hidden flex">{scoresSection}</div>;
  }

  return (
    <div className="mt-3 card-arcade rounded-xl overflow-hidden flex">
      {logSection}
      {scoresSection}
    </div>
  );
}
