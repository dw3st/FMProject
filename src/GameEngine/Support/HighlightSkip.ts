/**
 * `/test` only (stage 18, `highlights.md`): "next lance". Simulates ahead from the pitch's state until a new window at
 * `level` opens, then rewinds to that window's start (a ring of the last seconds of states and statistics), so the
 * lance plays from its pre-roll. The match RNG lives in the state, so the replayed seconds are the same play.
 */
import { tickState } from '@/GameEngine/Domain/gameState';
import { SIM_STEP } from '@/GameEngine/Domain/advanceSim';
import { exportStatsState, importStatsState, type StatsSnapshot } from '@/GameEngine/Domain/Statistics';
import { exportRatingState, importRatingState } from '@/GameEngine/Domain/PlayerRating';
import { getHighlights, getHighlightLiveSeconds } from '@/GameEngine/Domain/HighlightTracker';
import { highlightsAtLevel, type HighlightLevel } from '@/GameEngine/Domain/Highlights';
import { HIGHLIGHT_CONFIG } from '@/GameEngine/Configs/HighlightConfig';
import type { GameState } from '@/GameEngine/types';

/** Sim seconds simulated ahead at most before giving up (one half). */
const MAX_AHEAD_S = 2700;

interface Frame { clock: number; state: GameState; stats: StatsSnapshot; ratings: ReturnType<typeof exportRatingState> }

export function skipToNextHighlight(start: GameState, level: HighlightLevel): GameState {
  const known = new Set(highlightsAtLevel(getHighlights(), level).map(h => h.id));
  const keep = Math.ceil((HIGHLIGHT_CONFIG.PRE_MAX_S + HIGHLIGHT_CONFIG.SPELL_LEAD_S + 2) / SIM_STEP);
  const ring: Frame[] = [];
  let s = start;
  for (let i = 0; i < MAX_AHEAD_S / SIM_STEP; i++) {
    ring.push({ clock: getHighlightLiveSeconds(), state: s, stats: exportStatsState(), ratings: exportRatingState() });
    if (ring.length > keep) ring.shift();
    s = tickState(s, SIM_STEP).state;
    if (s.matchPhase === 'matchEnd') return s;
    const fresh = highlightsAtLevel(getHighlights(), level).find(h => !known.has(h.id));
    if (fresh) {
      const frame = ring.find(f => f.clock >= fresh.start - 1e-6) ?? ring[0]!;
      importStatsState(frame.stats);
      importRatingState(frame.ratings);
      return frame.state;
    }
  }
  return s;
}
