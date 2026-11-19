/**
 * Tests only: forces the match generator (`Infrastructure/MatchRng.ts`) the way `spyOn(Math, "random")` forced
 * `Math.random` before the engine had its own seeded generator. Same call order: every engine draw goes through it.
 */
import { forceMatchRandom } from '@/GameEngine/Infrastructure/MatchRng';

export interface MatchRandomSpy {
  mockImplementation(fn: () => number): MatchRandomSpy;
  mockReturnValue(v: number): MatchRandomSpy;
  mockRestore(): void;
}

export function spyMatchRandom(): MatchRandomSpy {
  const spy: MatchRandomSpy = {
    mockImplementation(fn) { forceMatchRandom(fn); return spy; },
    mockReturnValue(v) { forceMatchRandom(() => v); return spy; },
    mockRestore() { forceMatchRandom(null); },
  };
  return spy;
}
