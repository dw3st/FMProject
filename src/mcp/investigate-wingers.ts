#!/usr/bin/env bun
/**
 * One-off investigation: why are RW/LW running further toward the touchline
 * when they're already near it?
 *
 * Reads a snapshot, finds all wingers, prints their position, bounds,
 * off-ball decision, and the stored intent score breakdown.
 */

import { loadSnapshot } from '@/mcp/loadState';
import { queryOffBall, querySummary } from '@/mcp/queries';

const path = process.argv[2] ?? 'debug/2026-04-29T14-40-54-544Z.json';
const snap = await loadSnapshot(path);
const state = snap.state;

const summary = querySummary(state);
console.log(`\n=== ${path} ===`);
console.log(`matchTime ${summary.matchTime}s | score A ${summary.score.A}–${summary.score.B} B`);
console.log(`ballHolder: ${summary.ballHolder?.name} (${summary.ballHolder?.team} ${summary.ballHolder?.role})`);
console.log(`pass in flight? ${summary.passInFlight}\n`);

// Pitch dimensions (yds): X 0..115, Y 0..74. Wingers are roles LW/RW.
const PITCH_WIDTH = 74;

const wingers = state.players.filter(p => p.role === 'LW' || p.role === 'RW');

for (const w of wingers) {
  console.log(`── ${w.name} (${w.team} ${w.role}) ──`);
  console.log(`  position: x=${w.x.toFixed(2)} y=${w.y.toFixed(2)} (touchline distance: top=${w.y.toFixed(1)}yd, bottom=${(PITCH_WIDTH - w.y).toFixed(1)}yd)`);
  console.log(`  bounds:   minY=${w.bounds.minY} maxY=${w.bounds.maxY} (yRange around slot)`);
  console.log(`  attackDir: ${w.attackDir}`);
  console.log(`  basePosition: (${w.basePosition.x}, ${w.basePosition.y})`);
  console.log(`  targetPosition: (${w.targetPosition.x.toFixed(2)}, ${w.targetPosition.y.toFixed(2)})`);

  // Only run off-ball eval if this player's team has the ball (and they're not the holder)
  if (state.ballHolderId !== w.id) {
    const holder = state.players.find(p => p.id === state.ballHolderId);
    if (holder && holder.team === w.team) {
      try {
        const result = queryOffBall(state, w.id, snap.storedScores);
        const decision = result.decision as { type: string; dx?: number; dy?: number };
        console.log(`  off-ball decision: ${decision.type}${decision.dx != null ? ` dx=${decision.dx.toFixed(3)} dy=${decision.dy.toFixed(3)}` : ''}`);
        if (result.storedScores) {
          const s = result.storedScores as { intent: string; intentScores: Record<string, number>; bestScore: number; currentPassScore: number };
          console.log(`  stored intent: ${s.intent} (best target score ${s.bestScore?.toFixed(3)}, currentPassScore ${s.currentPassScore?.toFixed(3)})`);
          console.log(`  intent scores: ${Object.entries(s.intentScores).map(([k,v]) => `${k}=${v.toFixed(3)}`).join(', ')}`);
        }

        // Show the executed move target after FORMATION_PULL would be applied
        // raw target is at +lookahead*roleBias yards along (dx, dy)
        if (decision.dx != null && decision.dy != null) {
          // OffBallConfig values
          const BASE_LOOKAHEAD = 8, MAX_LOOKAHEAD = 16, FORMATION_PULL = 0.3;
          const visionNorm = Math.min(1, w.runtimeStats.withBall.carryVision / 18);
          const lookahead = BASE_LOOKAHEAD + (MAX_LOOKAHEAD - BASE_LOOKAHEAD) * visionNorm;
          const rawTargetY = w.y + decision.dy * lookahead;
          const slotY = w.basePosition.y;
          const finalY = slotY * FORMATION_PULL + rawTargetY * (1 - FORMATION_PULL);
          console.log(`  computed move:`);
          console.log(`    lookahead=${lookahead.toFixed(1)}yd, raw target Y=${rawTargetY.toFixed(2)}, after FORMATION_PULL → finalY=${finalY.toFixed(2)} (clamped to bounds [${w.bounds.minY}, ${w.bounds.maxY}])`);
          console.log(`    Y velocity sign: ${decision.dy > 0 ? 'TOWARD bottom touchline' : decision.dy < 0 ? 'TOWARD top touchline' : 'no Y motion'}`);
          // touchlineDir derivation in OffBallMovement: y < center → -1 (top), else +1 (bottom)
          const touchlineDir = w.y < PITCH_WIDTH / 2 ? -1 : 1;
          console.log(`    touchlineDir for this player: ${touchlineDir} (${touchlineDir === -1 ? 'top' : 'bottom'} side)`);
          // is it moving toward touchline? for top-side players: dy<0 = toward touchline. for bottom-side: dy>0 = toward touchline.
          const movingTowardTouchline = (touchlineDir === -1 && decision.dy < 0) || (touchlineDir === 1 && decision.dy > 0);
          console.log(`    moving TOWARD touchline? ${movingTowardTouchline ? 'YES' : 'no'}`);
        }
      } catch (e) {
        console.log(`  (off-ball eval skipped: ${(e as Error).message})`);
      }
    } else {
      console.log(`  (defending — off-ball not applicable)`);
    }
  }
  console.log();
}

// Also show width tactic for both teams
import { getTeamWidth, getTeamAttackWidth } from '@/GameEngine/Configs/AttackConfig';
console.log(`Team A width tactic: ${getTeamWidth('A')} (attack width multiplier ${getTeamAttackWidth('A')})`);
console.log(`Team B width tactic: ${getTeamWidth('B')} (attack width multiplier ${getTeamAttackWidth('B')})`);
