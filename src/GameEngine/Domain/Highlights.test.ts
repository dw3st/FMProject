import { describe, expect, test } from 'bun:test';
import {
  createHighlightState, highlightEvent, highlightTick, highlightsOf, highlightsAtLevel, nextHighlight, summarizeHighlights,
  type HighlightSample, type HighlightState,
} from '@/GameEngine/Domain/Highlights';

const base: HighlightSample = { dt: 0.2, live: true, minute: 10, possession: 'A', ballX: 57, ballY: 37, attackDirA: 1, deadBall: false };
function run(s: HighlightState, seconds: number, x: Partial<HighlightSample> = {}): void {
  for (let i = 0; i < Math.round(seconds / 0.2); i++) highlightTick(s, { ...base, ...x });
}

describe('highlight classifier', () => {
  test('a shot opens an extended lance with pre-roll from the spell start, closed by the dead ball', () => {
    const s = createHighlightState();
    run(s, 10, { possession: 'B' });
    run(s, 6); // A wins the ball at ~10 s, plays 6 s
    highlightEvent(s, 'shot', 'A');
    run(s, 1);
    run(s, 3, { deadBall: true }); // goal kick
    run(s, 10, { possession: 'B' });
    const [h] = highlightsOf(s);
    expect(h).toBeDefined();
    expect(h!.kind).toBe('shot');
    expect(h!.level).toBe('extended');
    expect(h!.start).toBeCloseTo(16.2 - 6.2 - 1, 0); // spell start − lead, within the max pre-roll
    expect(h!.end).toBeGreaterThan(17);
    expect(h!.end).toBeLessThan(20);
  });

  test('a goal closes the window after the celebration and upgrades it to main', () => {
    const s = createHighlightState();
    run(s, 5);
    highlightEvent(s, 'corner', 'A');
    run(s, 2, { deadBall: true });
    run(s, 1);
    highlightEvent(s, 'goal', 'A');
    run(s, 10, { deadBall: true });
    const list = highlightsOf(s);
    expect(list).toHaveLength(1);
    expect(list[0]!.level).toBe('main');
    expect(list[0]!.kind).toBe('goal');
    expect(list[0]!.triggers).toEqual(['corner', 'goal']);
    expect(list[0]!.end - (5.2 + 3)).toBeCloseTo(5, 0);
  });

  test('levels nest, windows never overlap and a sitting attack fires once per spell', () => {
    const s = createHighlightState();
    run(s, 20, { ballX: 100 }); // A in the final third for 20 s
    run(s, 5, { possession: 'B', ballX: 30 });
    highlightEvent(s, 'red_card', 'B');
    run(s, 12, { possession: 'B', ballX: 40 });
    const list = highlightsOf(s);
    expect(list.filter(h => h.kind === 'attack')).toHaveLength(1);
    for (let i = 1; i < list.length; i++) expect(list[i]!.start).toBeGreaterThanOrEqual(list[i - 1]!.end);
    expect(highlightsAtLevel(list, 'main').map(h => h.kind)).toEqual(['red_card']);
    expect(highlightsAtLevel(list, 'full')).toHaveLength(2);
    const sum = summarizeHighlights(list, s.liveSeconds);
    expect(sum.full.seconds).toBeGreaterThan(sum.main.seconds);
    expect(nextHighlight(list, 0, 'main')!.kind).toBe('red_card');
  });

  test('a less important trigger inside a main window does not stretch it', () => {
    const s = createHighlightState();
    run(s, 4);
    highlightEvent(s, 'clear_chance', 'A');
    run(s, 1);
    for (let i = 0; i < 6; i++) { highlightEvent(s, 'cross', 'A'); run(s, 1.5); }
    const [h] = highlightsOf(s);
    expect(h!.level).toBe('main');
    expect(h!.end - h!.start).toBeLessThan(4 + 10);
  });

  test('half-time closes the open lance and the same input gives the same windows', () => {
    const play = () => {
      const s = createHighlightState();
      run(s, 3);
      highlightEvent(s, 'shot', 'A');
      run(s, 1);
      run(s, 1, { live: false });
      return highlightsOf(s);
    };
    const a = play();
    expect(a).toHaveLength(1);
    expect(a[0]!.end).toBeCloseTo(4, 1);
    expect(play()).toEqual(a);
  });

  test('the break and the second-half kick-off are a main lance of their own', () => {
    const s = createHighlightState();
    run(s, 3);
    highlightEvent(s, 'shot', 'A');
    run(s, 1);
    run(s, 2, { live: false });
    run(s, 12, { possession: 'B' });
    const main = highlightsAtLevel(highlightsOf(s), 'main');
    expect(main).toHaveLength(1);
    expect(main[0]!.kind).toBe('kickoff');
    expect(main[0]!.start).toBeCloseTo(4, 1);
    expect(main[0]!.end).toBeGreaterThan(4.5);
    // The shot of the first half stays an extended lance.
    expect(highlightsOf(s).find(h => h.kind === 'shot')!.level).toBe('extended');
  });
});
