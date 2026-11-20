/**
 * The mind off the ball and in defence (stage 16, `Configs/DefensiveMindConfig.ts`, `decisions.md` → "Stage 16").
 *
 * FM rolls a player's decisions, composure, concentration, anticipation and aggression at every decision update. The
 * holder's part is `HolderMind.ts`; this is the rest. Per window of `WINDOW_S` seconds of play every outfield player
 * without the ball rolls decisions, anticipation, concentration and aggression (the same attribute test, mood and form
 * window as the holder: `mentalRoll`, `windowedRoll`). The tick loop keeps the rolls on the player (`GamePlayer.mind`,
 * `refreshMindRolls`); the evaluators read them as modifiers on the intent scores they already computed:
 *
 * - defence (`applyDefensiveMind`): noise on the four intents; aggression on press / step in; a concentration lapse
 *   drops the mark (track_mark → hold_shape) and holds back the engagement intents;
 * - off the ball (`applyOffBallMind`): noise; anticipation and flair on make_run; a lapse leaves him in his zone;
 * - the mark target (`mindMarkView`): anticipation reads where the mark is going.
 *
 * Pure apart from the dice in `refreshMindRolls` (all through `matchRandom`). No rolls = no effect.
 */
import { DEFENSIVE_MIND as D } from '@/GameEngine/Configs/DefensiveMindConfig';
import { DECISION_FLAGS, HOLDER_MIND } from '@/GameEngine/Configs/DecisionConfig';
import { gaussianDraw, mentalRoll, type MoodBand } from '@/GameEngine/Infrastructure/ActionOutcomes';
import { matchRandom } from '@/GameEngine/Infrastructure/MatchRng';
import {
  DEFAULT_MENTAL, fatigueLapseMult, fmScale, formWindow, moodBand, windowedRoll,
} from '@/GameEngine/Domain/HolderMind';
import { anticipationLookahead, predictedPoint } from '@/GameEngine/Domain/Movement';
import type { GamePlayer, MindRolls, PlayerMental } from '@/GameEngine/types';
import type { DefensiveIntent } from '@/GameEngine/Domain/DefensivePositioning';

type OffBallIntent = 'offer_support' | 'hold_space' | 'make_run';
import { clamp } from '@/Domain/math';

/** Intent slots of `MindRolls.z`. */
const DEF_SLOT: Record<DefensiveIntent, number> = { hold_shape: 0, track_mark: 1, press_holder: 2, step_into_carry_lane: 3 };
const OFF_SLOT: Record<OffBallIntent, number> = { offer_support: 0, hold_space: 1, make_run: 2 };
const Z_SLOTS = 4;

/** The profile the mind reads; like every mental attribute it only counts with the holder's mind on (`HOLDER`). */
function mentalOf(p: GamePlayer): PlayerMental {
  return DECISION_FLAGS.HOLDER ? p.mental ?? DEFAULT_MENTAL : DEFAULT_MENTAL;
}

/** Concentration and aggression (0..1) of a profile: the derived ones when the match did not set them. */
export function mindAttributes(m: PlayerMental): { concentration: number; aggression: number } {
  return {
    concentration: m.concentration ?? clamp(D.CONC_ANTICIPATION * m.anticipation / (D.CONC_ANTICIPATION + D.CONC_DECISIONS)
      + D.CONC_DECISIONS * m.decisions / (D.CONC_ANTICIPATION + D.CONC_DECISIONS), 0, 1),
    aggression: m.aggression ?? 0.4,
  };
}

/**
 * Concentration and aggression from the roster (0..1 mental values, roster / 10 for the rest, personality shifts −1..1).
 * Called once per match by `matchMentalOf`.
 */
export function deriveMind(
  m: Pick<PlayerMental, 'anticipation' | 'decisions'>,
  stats: { pressing?: number; tackling?: number; strength?: number },
  shift: { prof: number; temp: number },
): { concentration: number; aggression: number } {
  const r = (v: number | undefined) => clamp((v ?? 5) / 10, 0, 1);
  return {
    concentration: clamp(
      D.CONC_ANTICIPATION * m.anticipation + D.CONC_DECISIONS * m.decisions + D.CONC_PRESSING * r(stats.pressing)
        + D.CONC_PROF * shift.prof,
      0, 1,
    ),
    aggression: clamp(
      D.AGGR_TACKLING * r(stats.tackling) + D.AGGR_STRENGTH * r(stats.strength) + D.AGGR_TEMP * shift.temp,
      0, 1,
    ),
  };
}

/** The luck of a roll: roll / (a + plus), 0..1. */
function luck(roll: number, a100: number, plus: number): number {
  return clamp(roll / (a100 + plus), 0, 1);
}

/** σ (relative) from the decisions and anticipation attributes and their rolls' luck. */
export function mindSigma(m: PlayerMental, dec: number, antic: number, min: number, span: number): number {
  const scale = (fmScale(m.decisions) + fmScale(m.anticipation)) / 200;
  const T = (luck(dec, m.decisions * 100, D.ROLL_PLUS) + luck(antic, m.anticipation * 100, D.ROLL_PLUS)) / 2;
  return min + span * (1 - scale * (0.4 + 0.6 * T));
}

/**
 * The player's mind window at `matchTime` (game seconds): kept until `nextAt`, then rolled again. Always the same number
 * of draws (four rolls, aggression with its mood draw, four z) so the generator's stream does not depend on the result.
 * `timeScale` converts seconds of play into game seconds.
 */
export function refreshMindRolls(p: GamePlayer, matchTime: number, timeScale: number): MindRolls {
  const prev = p.mind;
  if (prev && matchTime < prev.nextAt) return prev;
  const m = mentalOf(p);
  const { concentration, aggression } = mindAttributes(m);
  const band = moodBand(m.mood);
  const s = formWindow(matchTime);
  const dec100 = m.decisions * 100;
  const ant100 = m.anticipation * 100;
  const con100 = concentration * 100;
  const agg100 = aggression * 100;
  const dec = windowedRoll(mentalRoll(dec100, band, D.ROLL_PLUS), dec100, s);
  const antic = windowedRoll(mentalRoll(ant100, band, D.ROLL_PLUS), ant100, s);
  // Concentration lapses with fatigue (the holder's decisions term) and below the LAPSE_ROLL bar.
  const rawConc = mentalRoll(con100, band, D.ROLL_PLUS);
  const fat = fatigueLapseMult(p.energy, m.consistency);
  const lapse = con100 < s && rawConc / fat < D.LAPSE_ROLL;
  const conc = lapse ? 0 : con100 >= s ? Math.max(1, rawConc) : rawConc;
  // Aggression: FM rolls its mood against 150 − a (a hot head is more often in an aggressive mood), then U·(a + 5).
  // A hot head sits in a narrower range, so his mood decides the roll's shape more often.
  const sMood = m.mood * D.AGGR_MOOD_SCALE;
  const ra = matchRandom() * (150 - agg100);
  const aggBand: MoodBand = ra < sMood ? 'good' : ra < -sMood ? 'bad' : 'normal';
  const aggr = mentalRoll(agg100, aggBand, D.AGGR_PLUS);
  const z: number[] = [];
  for (let i = 0; i < Z_SLOTS; i++) z.push(gaussianDraw());
  return {
    nextAt: matchTime + D.WINDOW_S * timeScale,
    dec: dec.roll,
    antic: antic.roll,
    conc,
    aggr,
    lapse,
    sigma: mindSigma(m, dec.roll, antic.roll, D.DEF_SIGMA_MIN, D.DEF_SIGMA_SPAN),
    z,
  };
}

/** k = clamp((roll − center)/center, −1, 1). */
function rollK(roll: number, center: number): number {
  return clamp((roll - center) / center, -1, 1);
}

/** What the mind did to one defensive decision (for the log and the statistics). */
export interface DefensiveMindEffect {
  /** The argmax before and after the mind. */
  before: DefensiveIntent;
  after: DefensiveIntent;
  lapse: boolean;
  /** Aggression k (−1..1). */
  aggrK: number;
}

function argmaxDef(scores: Record<DefensiveIntent, number>): DefensiveIntent {
  // The engine's tie order: press_holder > step_into_carry_lane > track_mark > hold_shape.
  let best: DefensiveIntent = 'hold_shape';
  let v = -Infinity;
  for (const k of ['press_holder', 'step_into_carry_lane', 'track_mark', 'hold_shape'] as DefensiveIntent[]) {
    if (scores[k] > v) { v = scores[k]; best = k; }
  }
  return best;
}

/**
 * Modifies the defensive intent scores in place by the player's mind window (none = untouched, returns null).
 * The engine's argmax and hysteresis run after it on the modified scores.
 */
export function applyDefensiveMind(player: GamePlayer, scores: Record<DefensiveIntent, number>): DefensiveMindEffect | null {
  const r = player.mind;
  if (!r || player.role === 'GK') return null;
  const before = argmaxDef(scores);
  for (const k of Object.keys(DEF_SLOT) as DefensiveIntent[]) {
    scores[k] = Math.max(0, scores[k] * (1 + r.sigma * (r.z[DEF_SLOT[k]] ?? 0)));
  }
  const aggrK = rollK(r.aggr, D.AGGR_CENTER);
  scores.press_holder *= 1 + D.AGGR_W * aggrK;
  scores.step_into_carry_lane *= 1 + D.AGGR_W * aggrK;
  if (r.lapse) {
    scores.hold_shape = Math.max(scores.hold_shape, scores.track_mark);
    scores.track_mark = 0;
    scores.press_holder *= D.LAPSE_ENGAGE_MULT;
    scores.step_into_carry_lane *= D.LAPSE_ENGAGE_MULT;
  }
  return { before, after: argmaxDef(scores), lapse: r.lapse, aggrK };
}

/**
 * Modifies the off-ball intent scores in place (none = untouched). Noise, anticipation and flair on make_run, a lapse
 * leaves him in his zone. Returns whether a lapse applied.
 */
export function applyOffBallMind(player: GamePlayer, scores: Record<OffBallIntent, number>): boolean | null {
  const r = player.mind;
  if (!r || player.role === 'GK') return null;
  const m = mentalOf(player);
  const sigma = mindSigma(m, r.dec, r.antic, D.OFF_SIGMA_MIN, D.OFF_SIGMA_SPAN);
  for (const k of Object.keys(OFF_SLOT) as OffBallIntent[]) {
    scores[k] = Math.max(0, scores[k] * (1 + sigma * (r.z[OFF_SLOT[k]] ?? 0)));
  }
  const flairK = 2 * clamp(m.flair / HOLDER_MIND.MENTAL_TOP, 0, 1) - 1;
  scores.make_run *= (1 + D.OFF_ANTIC_RUN_W * rollK(r.antic, D.OFF_ANTIC_CENTER)) * (1 + D.OFF_FLAIR_RUN_W * flairK);
  if (r.lapse) {
    scores.hold_space = Math.max(scores.hold_space, scores.offer_support, scores.make_run);
    scores.offer_support *= D.OFF_LAPSE_MULT;
    scores.make_run *= D.OFF_LAPSE_MULT;
  }
  return r.lapse;
}

/**
 * The mark as the defender reads him: anticipation projects his run `lookahead × luck × SHARE` seconds ahead; a lapse
 * (or no window) leaves the true mark.
 */
export function mindMarkView(defender: GamePlayer, mark: GamePlayer): GamePlayer {
  const r = defender.mind;
  if (!r || r.lapse || !mark.vel) return mark;
  const m = mentalOf(defender);
  const secs = anticipationLookahead(defender) * luck(r.antic, m.anticipation * 100, D.ROLL_PLUS) * D.ANTIC_MARK_SHARE;
  if (secs <= 0) return mark;
  const pt = predictedPoint(mark, secs);
  return { ...mark, x: pt.x, y: pt.y };
}
