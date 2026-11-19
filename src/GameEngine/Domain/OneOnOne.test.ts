import { describe, expect, test } from 'bun:test';
import { TEST_SCENARIOS } from '@/GameEngine/Support/TestCases';
import { decide } from '@/GameEngine/Domain/DecisionTree';
import type { GamePlayer } from '@/GameEngine/types';

const scenario = TEST_SCENARIOS.find(s => s.id === 'one-on-one-pass')!;

function holderDecision(edit?: (players: GamePlayer[]) => void) {
  const state = scenario.createState();
  const players = state.players.map(p => ({ ...p }));
  edit?.(players);
  const holder = players[0]!;
  return decide(holder, holder, true, false, players, null, 0, null, null);
}

describe('one-on-one with the keeper (#156)', () => {
  test('through on goal, a wider teammate further from goal does not get the ball', () => {
    const d = holderDecision();
    // Stage 6 (FM xG): a through ball can now win when its cell is closer to goal with a clearly higher xG (the keeper
    // out of the cell's shooting triangle); the ball never goes to the wider teammate further from goal.
    if (d.type === 'pass') throw new Error('passed to the wider teammate');
    if (d.type === 'through_ball') expect(Math.hypot(115 - d.cellX, Math.max(0, Math.abs(d.cellY - 37) - 4))).toBeLessThan(14);
    else expect(['shoot', 'carry']).toContain(d.type);
  });

  test('a teammate clearly better placed (closer, much higher xG) can still be found', () => {
    // Holder at a tight angle near the byline, a teammate unmarked in front of goal.
    const d = holderDecision(ps => {
      ps[0]!.x = 107; ps[0]!.y = 52;
      ps[1]!.x = 108; ps[1]!.y = 37;
      ps[2]!.x = 104; ps[2]!.y = 53;
      ps[3]!.x = 100; ps[3]!.y = 50;
      ps[4]!.x = 113.5; ps[4]!.y = 40;
    });
    expect(d.type).toBe('pass');
    if (d.type === 'pass') expect(d.targetId).toBe(2);
  });
});
