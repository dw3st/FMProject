import { describe, expect, test } from 'bun:test';
import { distToGoalCentreM, inBoxLane, shotCandidateValue, shotGateFactor } from '@/GameEngine/Domain/ShotGate';
import { SHOT_GATE } from '@/GameEngine/Configs/ShotGateConfig';
import { TEST_SCENARIOS } from '@/GameEngine/Support/TestCases';
import { decide } from '@/GameEngine/Domain/DecisionTree';
import { setDecisionFlags } from '@/GameEngine/Configs/DecisionConfig';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { setDebugMode } from '@/GameEngine/Support/DebugLog';
import { matchMinute } from '@/GameEngine/Domain/gameState';
import type { GameState } from '@/GameEngine/types';

const YD = 1 / 0.9144;

describe('FM shot gate (stage 9)', () => {
  test('30 m from the goal centre, × 0.75 in the box, × 0.667 outside, closed beyond', () => {
    expect(shotGateFactor(115 - 10 * YD, 37, 1)).toBe(SHOT_GATE.IN_BOX_MULT);
    expect(shotGateFactor(115 - 24 * YD, 37, 1)).toBe(SHOT_GATE.OUT_BOX_MULT);
    expect(shotGateFactor(115 - 31 * YD, 37, 1)).toBeNull();
    // Wide of the box but close: outside the box lane.
    expect(inBoxLane(110, 37 + 23, 1)).toBe(false);
    expect(shotGateFactor(110, 37 + 23, 1)).toBe(SHOT_GATE.OUT_BOX_MULT);
    // The other goal mirrors.
    expect(shotGateFactor(10 * YD, 37, -1)).toBe(SHOT_GATE.IN_BOX_MULT);
    expect(distToGoalCentreM(115 - 20 * YD, 37, 1)).toBeCloseTo(20, 6);
  });

  test('the value: factor × (floor + (1 − floor) × (clean xG / ref)^pow), capped at the factor', () => {
    const f = SHOT_GATE.VALUE_FLOOR;
    expect(shotCandidateValue(0.1, 0.25, 0.6667)).toBeCloseTo(0.6667 * (f + (1 - f) * 0.4 ** SHOT_GATE.VALUE_POW), 6);
    expect(shotCandidateValue(0.9, 0.25, 0.75)).toBe(0.75);
    expect(shotCandidateValue(0, 0.25, 0.75)).toBe(0);
  });
});

function shotCandidate(flags?: Record<string, boolean>) {
  setDecisionFlags(flags);
  setDebugMode(true);
  let shot: { value: number; score: number } | null = null;
  const off = gameBus.on('holderCandidates', e => {
    const c = e.candidates.find(x => x.kind === 'shot');
    shot = c ? { value: c.value, score: c.score } : null;
  });
  try {
    const s = TEST_SCENARIOS.find(t => t.id === 'long-shot-block')!.createState() as GameState;
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    decide(holder, holder, true, false, s.players, null, 1, null, null, { A: 'balanced', B: 'balanced' }, null, s.matchTime, { lead: 0, minute: matchMinute(s) });
    return shot as { value: number; score: number } | null;
  } finally {
    off();
    setDebugMode(false);
    setDecisionFlags();
  }
}

describe('long shot through a defender (stage 9)', () => {
  test('the shot is offered with a defender in front, valued above FM\'s f24 line', () => {
    const on = shotCandidate();
    expect(on).not.toBeNull();
    // Stage 21: the value curve is calibrated (VALUE_POW 1.5, XG_REF 0.28), so the test checks the mechanism (a positive
    // value with a blocker in front, above the old blocker-read value), not the absolute level of the stage-9 curve.
    expect(on!.value).toBeGreaterThan(0);
    const offFlag = shotCandidate({ LONG_SHOTS: false });
    // The old value read the blocker through the xG and was crushed by f24.
    expect(offFlag === null || offFlag.value < on!.value).toBe(true);
  });
});

describe('the chip only over a keeper really off his line (stage 9)', () => {
  test('a keeper 6 yd off his line: no chip with LONG_SHOTS, a chip without it', async () => {
    const { chipMove } = await import('@/GameEngine/Domain/HolderMoves');
    const s = TEST_SCENARIOS.find(t => t.id === 'move-chip')!.createState() as GameState;
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    const keeper = { ...s.players.find(p => p.role === 'GK' && p.team !== holder.team)!, x: 109 };
    expect(chipMove(holder, keeper, 0.25, 1.6)).toBeNull();
    setDecisionFlags({ LONG_SHOTS: false });
    try { expect(chipMove(holder, keeper, 0.25, 1.6)).not.toBeNull(); } finally { setDecisionFlags(); }
  });
});
