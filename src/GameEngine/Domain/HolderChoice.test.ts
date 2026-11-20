import { describe, expect, test } from 'bun:test';
import { compressByRisk, pickCandidate, riskCap, scoreCandidates, type HolderCandidate } from '@/GameEngine/Domain/HolderChoice';
import { TEST_SCENARIOS } from '@/GameEngine/Support/TestCases';
import { decide } from '@/GameEngine/Domain/DecisionTree';
import { setDecisionFlags } from '@/GameEngine/Configs/DecisionConfig';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { setDebugMode } from '@/GameEngine/Support/DebugLog';
import { matchMinute } from '@/GameEngine/Domain/gameState';
import type { GameState } from '@/GameEngine/types';

const cand = (over: Partial<HolderCandidate<string>>): HolderCandidate<string> => ({
  cat: 0, kind: 'pass', label: '', value: 0.5, mult: 1, risk: 0, quality: 0, decision: 'x', ...over,
});

describe('FM holder picker (stage 8)', () => {
  test('the risk cap is (100 − risk)³ / 10 and keeps 10% of the excess', () => {
    expect(riskCap(0)).toBe(100_000);
    expect(riskCap(50)).toBe(12_500);
    expect(compressByRisk(5000, 50)).toEqual({ score: 5000, compressed: false });
    const c = compressByRisk(9000, 80); // cap 800
    expect(c.compressed).toBe(true);
    expect(c.score).toBeCloseTo(800 + 0.1 * 8200, 6);
  });

  test('risk 100 vetoes; a zero value too', () => {
    const s = scoreCandidates([cand({ risk: 100, value: 0.9 }), cand({ value: 0 }), cand({ value: 0.3 })]);
    expect(s[0]!.vetoed).toBe(true);
    expect(s[1]!.vetoed).toBe(true);
    expect(pickCandidate(s)).toBe(2);
  });

  test('argmax; a tie goes to the lower risk, then the higher quality', () => {
    const s = scoreCandidates([cand({ value: 0.5, risk: 20 }), cand({ value: 0.5, risk: 10, quality: -5 }), cand({ value: 0.5, risk: 10, quality: 5 })]);
    expect(pickCandidate(s)).toBe(2);
  });

  test('the multiplier scales the score; a weak kick is cut by f24', () => {
    const s = scoreCandidates([cand({ cat: 3, mult: 1.14, value: 0.5 }), cand({ cat: 1, value: 0.2 })]);
    expect(s[0]!.score).toBe(5700);
    expect(s[1]!.score).toBe(Math.round(0.2 * 10_000 * 5 * 0.04));
  });

  test('an all-vetoed list picks nothing', () => {
    expect(pickCandidate(scoreCandidates([cand({ risk: 100 })]))).toBe(-1);
  });
});

function scenarioDecision(id: string, flags?: Record<string, boolean>) {
  setDecisionFlags(flags);
  setDebugMode(true);
  const seen: { candidates: number; vetoed: number }[] = [];
  const off = gameBus.on('holderChoice', e => seen.push({ candidates: e.candidates, vetoed: e.vetoed }));
  try {
    const s = TEST_SCENARIOS.find(t => t.id === id)!.createState() as GameState;
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    const lead = s.score.A - s.score.B;
    const d = decide(holder, holder, true, false, s.players, null, 1, null, null, { A: 'balanced', B: 'balanced' }, null, s.matchTime, { lead, minute: matchMinute(s) });
    return { d, seen };
  } finally {
    off();
    setDebugMode(false);
    setDecisionFlags();
  }
}

describe('FM holder chooser in the engine (stage 8)', () => {
  test('leading late near the corner flag: he keeps it there', () => {
    const { d } = scenarioDecision('fm-holder-flag');
    expect(d.type === 'carry' && d.step).toBe('flag');
  });

  test('every candidate is offered, some vetoed', () => {
    const { seen } = scenarioDecision('fm-holder-hold');
    expect(seen.length).toBe(1);
    expect(seen[0]!.candidates).toBeGreaterThan(8);
    expect(seen[0]!.vetoed).toBeGreaterThan(0);
  });

  test('with FM_HOLDER off the chooser is not used', () => {
    const { d, seen } = scenarioDecision('fm-holder-flag', { FM_HOLDER: false });
    expect(seen.length).toBe(0);
    expect(d.type === 'carry' && d.step === 'flag').toBe(false);
  });
});
