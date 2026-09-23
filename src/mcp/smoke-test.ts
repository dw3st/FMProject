#!/usr/bin/env bun
/**
 * Smoke test — exercises every query function against the current debug snapshot.
 * Run: bun src/mcp/smoke-test.ts <path-to-snapshot>
 */

import { loadSnapshot } from '@/mcp/loadState';
import {
  queryAllPasses,
  queryPass,
  queryCarryLanes,
  queryDefensiveIntent,
  queryOffBall,
  queryShot,
  queryGKQuality,
  queryInterceptionCorridors,
  querySummary,
} from '@/mcp/queries';

const path = process.argv[2] ?? 'debug/2026-04-29T14-15-45-938Z.json';
console.log(`\n=== loading ${path} ===\n`);

const snap  = await loadSnapshot(path);
const state = snap.state;

const sep = (label: string) => console.log(`\n── ${label} ───────────────────────────────`);

sep('summary');
const summary = querySummary(state);
console.log(JSON.stringify({
  matchTime:  summary.matchTime,
  matchPhase: summary.matchPhase,
  score:      summary.score,
  ballHolder: summary.ballHolder,
  passInFlight: summary.passInFlight,
  shotInFlight: summary.shotInFlight,
}, null, 2));

sep('evaluate_all_passes');
const passes = queryAllPasses(state);
console.log(`holder: ${passes.holder.name} (${passes.holder.team})`);
console.log(`build_up: ${passes.buildUp}, width: ${passes.width}, MIN_PASS_SCORE: ${passes.minPassScore}`);
console.log(`top 5 passes:`);
for (const p of passes.passes.slice(0, 5)) {
  console.log(`  ${p.receiverName.padEnd(12)} (${p.role.padEnd(3)}) dist=${p.distance.toFixed(1)}yd  score=${p.score.toFixed(3)}  ${p.open ? 'OPEN' : 'closed'}`);
}

sep('score_pass — top candidate');
if (passes.passes.length > 0) {
  const target = passes.passes[0]!;
  const single = queryPass(state, target.receiverId);
  console.log(JSON.stringify(single, null, 2));
}

sep('evaluate_carry');
const carry = queryCarryLanes(state);
console.log(`holder: ${carry.holder.name} at (${carry.holder.x.toFixed(1)}, ${carry.holder.y.toFixed(1)})`);
console.log(`build_up: ${carry.buildUp}, MIN_TOTAL_SCORE: ${carry.minTotalScore}`);
for (const lane of carry.lanes) {
  console.log(`  ${lane.label.padEnd(14)} angle=${lane.angleDeg.toFixed(0).padStart(4)}°  target=(${lane.targetX.toFixed(1)},${lane.targetY.toFixed(1)})  score=${lane.score.toFixed(3)}`);
}

sep('score_defensive_intent — first defender');
const defendingTeam = passes.holder.team === 'A' ? 'B' : 'A';
const defenders = state.players.filter(p => p.team === defendingTeam && p.role !== 'GK');
if (defenders.length > 0) {
  const def = defenders[0]!;
  const result = queryDefensiveIntent(state, def.id, snap.storedScores);
  console.log(`defender: ${result.defender.name} (${result.defender.role})`);
  console.log(`recomputed decision: ${JSON.stringify(result.decision)}`);
  if (result.storedScores) {
    const s = result.storedScores as { chosenIntent: string; scores: Record<string, number>; holderThreat: number; markThreat: number };
    console.log(`stored chosen intent: ${s.chosenIntent}`);
    console.log(`stored scores: ${JSON.stringify(s.scores)}`);
    console.log(`holderThreat=${s.holderThreat?.toFixed(3)}, markThreat=${s.markThreat?.toFixed(3)}`);
  }
}

sep('score_off_ball — first attacker (not holder)');
const attackers = state.players.filter(p => p.team === passes.holder.team && p.id !== passes.holder.id && p.role !== 'GK');
if (attackers.length > 0) {
  const att = attackers[0]!;
  const result = queryOffBall(state, att.id, snap.storedScores);
  console.log(`attacker: ${result.player.name} (${result.player.role}) at (${result.player.x.toFixed(1)}, ${result.player.y.toFixed(1)})`);
  console.log(`offsideLine: ${result.offsideLine}`);
  console.log(`recomputed decision: ${JSON.stringify(result.decision)}`);
  if (result.storedScores) {
    const s = result.storedScores as { intent: string; intentScores: Record<string, number>; bestScore: number };
    console.log(`stored intent: ${s.intent}, bestScore: ${s.bestScore?.toFixed(3)}`);
    console.log(`intent scores: ${JSON.stringify(s.intentScores)}`);
  }
}

sep('evaluate_shot — current ball holder shooting from where they are');
if (passes.holder.id != null) {
  const shotResult = queryShot(state, passes.holder.id);
  console.log(`shooter: ${shotResult.shooter.name} (${shotResult.shooter.role})`);
  console.log(`distance: ${shotResult.distance}yd  openAngle: ${shotResult.openAngleDeg}°`);
  console.log(`pressure: ${shotResult.pressure}  (${shotResult.pressingDefenders.length} defenders within 5yd)`);
  console.log(`xG: ${shotResult.xg}  shooterEffect: ${shotResult.shooterEffect}  gkEffect: ${shotResult.gkEffect}`);
  console.log(`final goalChance: ${(shotResult.goalChance * 100).toFixed(1)}%`);
}

sep('evaluate_shot — hypothetical shot from the penalty spot');
const penaltyShooter = state.players.find(p => p.team === passes.holder.team && p.role === 'ST') ?? state.players.find(p => p.team === passes.holder.team && p.id !== passes.holder.id);
if (penaltyShooter) {
  const fromX = penaltyShooter.attackDir === 1 ? 103 : 12;  // 12 yards out
  const fromY = 37;
  const shotResult = queryShot(state, penaltyShooter.id, { fromX, fromY });
  console.log(`hypothetical: ${shotResult.shooter.name} from penalty spot (${fromX}, ${fromY})`);
  console.log(`distance: ${shotResult.distance}yd  xG: ${shotResult.xg}  goalChance: ${(shotResult.goalChance * 100).toFixed(1)}%`);
}

sep('gk_position_quality');
const gks = state.players.filter(p => p.role === 'GK');
for (const gk of gks) {
  const result = queryGKQuality(state, gk.id);
  console.log(`${result.gk.name} (team ${result.gk.team}) at (${result.gk.x.toFixed(1)}, ${result.gk.y.toFixed(1)}): quality=${result.positionQuality}`);
}

sep('interception_corridors');
const corridors = queryInterceptionCorridors(state);
for (const d of corridors.defenders.slice(0, 5)) {
  console.log(`  ${d.name.padEnd(12)} (${d.role.padEnd(3)}) speed=${d.speed} accel=${d.acceleration}  corridor=${d.corridor}yd  baseChance=${d.baseInterceptionChance}`);
}

console.log(`\n=== smoke test complete ===\n`);
