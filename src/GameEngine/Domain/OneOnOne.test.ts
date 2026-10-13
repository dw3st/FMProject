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
    expect(['shoot', 'carry']).toContain(d.type);
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
