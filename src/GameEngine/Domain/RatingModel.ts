/**
 * Stage 17 (`player-scores.md` → "Stage 17"): the match rating from FM's stat hooks. Every hook only increments a
 * per-player tally; the rating is a pure function of that tally (`ratingFromTally`), so it can be recomputed offline
 * (`scripts/rating-distribution.ts --eval`) and resumed from a snapshot. Weights in `FM_RATING` (`PlayerRatingConfig`).
 */
import { FM_RATING } from '@/GameEngine/Configs/PlayerRatingConfig';
import { clamp } from '@/Domain/math';

/** FM's rating hooks we feed (counts unless noted). */
export interface RatingTally {
  goals: number;
  /** Goals whose shot xG was below FM_RATING.GOOD_GOAL_XG / GREAT_GOAL_XG (penalties never). */
  goodGoals: number;
  greatGoals: number;
  /** Late goals (FM_RATING.DECISIVE_MINUTE on) that levelled or put the team ahead. */
  decisiveGoals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  /** Non-penalty xG of his shots, and the goals they scored (for the xG shortfall). */
  npxg: number;
  npGoals: number;
  /** Shots that came from his pass (key passes / chances created), and their xG in open play (xA). */
  keyPasses: number;
  xa: number;
  passesCompleted: number;
  passesIncomplete: number;
  dribblesWon: number;
  dribblesLost: number;
  crossesCompleted: number;
  tacklesWon: number;
  tacklesLost: number;
  interceptions: number;
  blocks: number;
  clearances: number;
  /** Possession lost by him that the opponent turned into a goal before his team won the ball back. */
  mistakesToGoal: number;
  possessionWon: number;
  aerialWon: number;
  aerialLost: number;
  fouls: number;
  saves: number;
  goodSaves: number;
  greatSaves: number;
  yellow: number;
  red: number;
  penaltiesConceded: number;
}

export const RATING_TALLY_KEYS = [
  'goals', 'goodGoals', 'greatGoals', 'decisiveGoals', 'assists', 'shots', 'shotsOnTarget', 'npxg', 'npGoals',
  'keyPasses', 'xa', 'passesCompleted', 'passesIncomplete', 'dribblesWon', 'dribblesLost', 'crossesCompleted',
  'tacklesWon', 'tacklesLost', 'interceptions', 'blocks', 'clearances', 'mistakesToGoal', 'possessionWon', 'aerialWon',
  'aerialLost', 'fouls', 'saves', 'goodSaves', 'greatSaves', 'yellow', 'red', 'penaltiesConceded',
] as const satisfies readonly (keyof RatingTally)[];

export function emptyTally(): RatingTally {
  return Object.fromEntries(RATING_TALLY_KEYS.map(k => [k, 0])) as unknown as RatingTally;
}

/** Each hook's contribution to the rating (signed), for the /test breakdown. */
export function ratingParts(t: RatingTally, w: typeof FM_RATING = FM_RATING): Record<string, number> {
  const shortfall = Math.max(0, t.npxg - t.npGoals - w.XG_SHORTFALL_FREE);
  return {
    goals: t.goals * w.GOAL + t.goodGoals * w.GOOD_GOAL + t.greatGoals * w.GREAT_GOAL + t.decisiveGoals * w.DECISIVE_GOAL,
    assists: t.assists * w.ASSIST,
    shooting: t.shots * w.SHOT + t.shotsOnTarget * w.SHOT_ON_TARGET + shortfall * w.XG_SHORTFALL,
    creating: t.keyPasses * w.KEY_PASS + t.xa * w.XA + t.crossesCompleted * w.CROSS_COMPLETED,
    passing: t.passesCompleted * w.PASS_COMPLETED + t.passesIncomplete * w.PASS_INCOMPLETE,
    dribbling: t.dribblesWon * w.DRIBBLE_WON + t.dribblesLost * w.DRIBBLE_LOST,
    defending: t.tacklesWon * w.TACKLE_WON + t.tacklesLost * w.TACKLE_LOST + t.interceptions * w.INTERCEPTION
      + t.blocks * w.BLOCK + t.clearances * w.CLEARANCE + t.possessionWon * w.POSSESSION_WON,
    aerial: t.aerialWon * w.AERIAL_WON + t.aerialLost * w.AERIAL_LOST,
    keeping: t.saves * w.SAVE + t.goodSaves * w.GOOD_SAVE + t.greatSaves * w.GREAT_SAVE,
    errors: t.mistakesToGoal * w.MISTAKE_TO_GOAL + t.fouls * w.FOUL + t.penaltiesConceded * w.PENALTY_CONCEDED,
    cards: t.yellow * w.YELLOW + t.red * w.RED,
  };
}

/** The rating 0..10 from a tally (BASELINE + the parts, clamped once at the end). */
export function ratingFromTally(t: RatingTally, w: typeof FM_RATING = FM_RATING): number {
  let sum = w.BASELINE;
  for (const v of Object.values(ratingParts(t, w))) sum += v;
  return clamp(sum, 0, 10);
}
