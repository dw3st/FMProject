/**
 * Offside by a mistimed run (stage 13, `Configs/OffsideRunsConfig.ts`, `game-rules/offside.md` → "Mistimed runs").
 *
 * Pure: the caller (`gameState.tickState`) keeps each attacker's `LineRead` on the player and replaces the true
 * offside line by `perceivedLine(...)` wherever that player's own movement reads it (off-ball runs, attacking shape,
 * off-ball cell scoring). The offside call itself always uses the true line at the pass (`checkReceiverOffside`).
 */
import { OFFSIDE_RUNS as R } from '@/GameEngine/Configs/OffsideRunsConfig';
import { DECISION_FLAGS, HOLDER_MIND } from '@/GameEngine/Configs/DecisionConfig';
import { DEFAULT_MENTAL } from '@/GameEngine/Domain/HolderMind';
import type { GamePlayer, LineRead } from '@/GameEngine/types';
import { clamp } from '@/Domain/math';
import { matchRandom } from '@/GameEngine/Infrastructure/MatchRng';

function mentalOf(p: GamePlayer) {
  return DECISION_FLAGS.HOLDER ? p.mental ?? DEFAULT_MENTAL : DEFAULT_MENTAL;
}

const worldScale = (v: number) => clamp(v / HOLDER_MIND.MENTAL_TOP, 0, 1);

/** His anticipation on the world scale (0..1; the neutral mind without `HOLDER`). */
export function anticipationOf(p: GamePlayer): number {
  return worldScale(mentalOf(p).anticipation);
}

/** Seconds of play between two reads of the line. */
export function readInterval(p: GamePlayer): number {
  return R.READ_BASE_S + R.READ_SPAN_S * (1 - worldScale(mentalOf(p).anticipation));
}

/** σ of the read error (yd). */
export function readSigma(p: GamePlayer): number {
  return R.ERR_SIGMA_YD * (R.ERR_FLOOR + 1 - worldScale(mentalOf(p).decisions));
}

/** Chance that a read is a lapse (he forgets the line until the next read). */
export function lapseChance(p: GamePlayer): number {
  return clamp(R.LAPSE_BASE * (1.5 - mentalOf(p).consistency), 0, 1);
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * The player's read of the line at `matchTime` (game seconds): kept until `nextAt`, then read again from the true
 * `lineX`. `timeScale` converts seconds of play into game seconds. A null line drops the read.
 */
export function refreshLineRead(
  p: GamePlayer, lineX: number | null, matchTime: number, timeScale: number, rng: () => number = matchRandom,
): LineRead | undefined {
  if (lineX === null) return undefined;
  const prev = p.lineRead;
  if (prev && matchTime < prev.nextAt) return prev;
  const sigma = readSigma(p);
  let err = clamp(gaussian(rng) * sigma, -R.ERR_CLIP * sigma, R.ERR_CLIP * sigma);
  const lapse = rng() < lapseChance(p);
  if (lapse) err += R.LAPSE_YD;
  // The line's movement since his last read (yd per game second): what he projects it forward with.
  const vel = prev && prev.at !== undefined && matchTime > prev.at ? (lineX - prev.lineX) / (matchTime - prev.at) : 0;
  return { lineX, err, nextAt: matchTime + readInterval(p) * timeScale, lapse, at: matchTime, vel, look: worldScale(mentalOf(p).anticipation) };
}

/**
 * The line as he believes it is at `matchTime`: his last read, projected on the line's movement as far as his
 * anticipation reads it (`look` × the time since the read; a good reader follows a line that drops or steps up, a poor
 * one stays on the old spot), shifted by his error (past it when err > 0).
 */
export function perceivedLine(read: LineRead, attackDir: 1 | -1, matchTime?: number): number {
  const since = matchTime === undefined || read.at === undefined ? 0 : Math.max(0, matchTime - read.at);
  return read.lineX + (read.vel ?? 0) * since * (read.look ?? 0) + attackDir * read.err;
}
