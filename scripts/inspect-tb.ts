#!/usr/bin/env bun
/**
 * One-off debug script: replay through-ball cell scoring against a saved snapshot.
 *
 * Usage:  bun scripts/inspect-tb.ts <snapshot-path>
 *
 * Phase 6 will replace this with an MCP tool `evaluate_through_ball`. Until
 * then, run this to inspect why a particular through ball scored where it did.
 */

import type { GameState, GamePlayer } from '@/GameEngine/types';
import { computeCrowdGrid } from '@/GameEngine/Infrastructure/CrowdGrid';
import { computeOffsideLine } from '@/GameEngine/Domain/Offside';
import { enumerateCandidateCells } from '@/GameEngine/Domain/ThroughBallCells';
import { normalizeGamePlayers } from '@/GameEngine/Domain/RuntimeLineup';
import { evaluatePassLanes } from '@/GameEngine/Domain/PassLanes';

const path = process.argv[2];
if (!path) {
  console.error('usage: bun scripts/inspect-tb.ts <snapshot-path>');
  process.exit(1);
}

const snapshot = await Bun.file(path).json();
const rawState = snapshot.rawState as GameState;
// rosterPlayers may be plain objects without runtimeStats restored — normalise.
const players = normalizeGamePlayers(rawState.players) as unknown as GamePlayer[];
const state: GameState = { ...rawState, players };

const holder = state.players.find(p => p.id === state.ballHolderId);
if (!holder) {
  console.error('No ball holder in snapshot');
  process.exit(1);
}

console.log(`\n=== Through-ball replay: ${holder.name} (${holder.role}, team ${holder.team}) at (${holder.x.toFixed(1)}, ${holder.y.toFixed(1)})`);
console.log(`Match time: ${(state.matchTime / 60).toFixed(1)}'   Score: A ${state.score.A} - ${state.score.B} B   Pass in flight: ${state.pass != null}\n`);

const grid = computeCrowdGrid(state);
const offsideLine = computeOffsideLine(holder.attackDir, state.players, holder.team, holder.x);
console.log(`Offside line: ${offsideLine?.toFixed(1) ?? 'null'} yds (attackDir=${holder.attackDir})\n`);

const cells = enumerateCandidateCells(holder, state.players, grid, offsideLine);
console.log(`Total surviving candidates: ${cells.length}\n`);

if (cells.length === 0) {
  console.log('NO candidate cells survived Phase 1 cull. Reasons:');
  console.log('  - All cells in own half, or');
  console.log('  - No teammate close enough by ETA, or');
  console.log('  - Visual horizon too short, or');
  console.log('  - All cells too crowded with opponents');
  process.exit(0);
}

const top = cells.slice(0, 8);
console.log('Top 8 candidate cells (sorted by score):');
console.log('');
console.log('  cell        score   raceMargin  runner            defender         components');
console.log('  ---------   -----   ----------  ---------------   --------------   ------------------------------------');
for (const c of top) {
  const a = c.components.bestAttackerId
    ? state.players.find(p => p.id === c.components.bestAttackerId)
    : null;
  const d = c.components.bestDefenderId
    ? state.players.find(p => p.id === c.components.bestDefenderId)
    : null;
  const aLabel = a ? `${a.name} (${a.role}) eta ${c.components.bestAttackerEta.toFixed(2)}s` : '—';
  const dLabel = d ? `${d.name} (${d.role}) eta ${c.components.bestDefenderEta.toFixed(2)}s` : '—';
  const margin = c.components.raceMargin;
  const marginStr = margin >= 0 ? `+${margin.toFixed(2)}` : margin.toFixed(2);
  const comp = `R${c.components.raceMarginScore.toFixed(2)} S${c.components.spaceQualityScore.toFixed(2)} G${c.components.goalThreatScore.toFixed(2)} P${c.components.passerSkillScore.toFixed(2)} Path${c.components.pathClearScore.toFixed(2)} -L${c.components.laneRiskPenalty.toFixed(2)} -O${c.components.offsideRiskPenalty.toFixed(2)}`;
  console.log(`  (${c.x.toFixed(1).padStart(5)}, ${c.y.toFixed(1).padStart(5)})  ${c.score.toFixed(2)}    ${marginStr.padStart(6)}s    ${aLabel.padEnd(17)}  ${dLabel.padEnd(15)}  ${comp}`);
}
console.log('');
// ── Side-by-side: TB best cell vs top regular pass (decision-space comparison) ──
const teamMates = state.players.filter(p => p.team === holder.team && p.id !== holder.id);
const oppPlayers = state.players.filter(p => p.team !== holder.team);
const intent    = state.teamIntent?.[holder.team] ?? 'balanced';
const lanes     = evaluatePassLanes(holder, teamMates, oppPlayers, intent);
const bestPass  = lanes.reduce((a, b) => b.score > a.score ? b : a);
const passReceiver = state.players.find(p => p.id === bestPass.toId);

const tbRaw     = cells[0]!.score;
const tbComp    = 1 - Math.exp(-tbRaw / 0.9);              // THROUGH_BALL_STRONG_RAW = 0.9
const passRaw   = bestPass.score;
const passComp  = 1 - Math.exp(-passRaw / 1.0);            // PASS_STRONG_RAW = 1.0

console.log('=== Decision-space comparison ===');
console.log('               raw       compressed (decision space)');
console.log(`  best TB     ${tbRaw.toFixed(3)}    ${tbComp.toFixed(3)}`);
console.log(`  best pass   ${passRaw.toFixed(3)}    ${passComp.toFixed(3)}    → ${passReceiver?.name} (${passReceiver?.role})`);
console.log(`  winner: ${tbComp > passComp ? 'THROUGH BALL' : 'PASS'} by ${Math.abs(tbComp - passComp).toFixed(3)}\n`);

console.log('=== Goal threat formula reminder ===');
console.log('  goalX = attackDir==1 ? 115 : 0');
console.log('  dist  = |goalX - cellX|');
console.log('  third = 115/3 ≈ 38.33');
console.log('  if (dist > third) return 0   ← attacking third starts at x=76.67');
console.log('  proximity  = 1 − dist/third');
console.log('  distFactor = proximity²');
console.log('  angleFactor = openAngle / MAX_OPEN_ANGLE');
console.log('  return distFactor × 0.35 + angleFactor × 0.65');
console.log('');
console.log(`For Team A attacking right (attackDir=+1): goal threat is non-zero only for cells with x > 76.67`);
console.log(`Best cell x: ${cells[0]!.x.toFixed(1)} → ${cells[0]!.x > 76.67 ? 'in attacking third (goal score active)' : 'OUTSIDE attacking third (goal=0)'}`);
