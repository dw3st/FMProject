/**
 * MatchLevelConfig — partial levelling of a match to a reference level (stage 21c).
 *
 * Several engine duels read absolute attributes (tackle base chance, interception chance, keeper effect), so two weak
 * sides barely defend against each other and a weak league scored far more than a strong one (Série C 4.7 goals a match,
 * Premier 2.6). Real football keeps the goal volume of every division close (2.3–2.7). Each match multiplies the
 * attributes of BOTH sides by the same factor k = clamp((REF / level)^ALPHA, 1, MAX), level = mean attribute of the 22
 * starters: the relative strength inside the match is unchanged (a Série A club still beats a Série C one), only the
 * volume moves toward the reference. ALPHA < 1 keeps a weak league a little below a strong one, as in real football.
 * A match at or above REF is unchanged (k = 1).
 */
import type { RosterPlayer } from '@/types/playerTypes';
import { registerEngineMemory, recordPart } from '@/GameEngine/Support/EngineMemory';

export const MATCH_LEVEL = {
  /** Mean starter attribute (0..10) the volume is calibrated at: the Premier League XIs (~4.5). */
  REF: 4.5,
  /** Share of the gap to REF that is closed (log scale). */
  ALPHA: 0.6,
  /** Ceiling of the factor. */
  MAX: 2.5,
};

{
  const raw = typeof process !== 'undefined' ? process.env?.MATCH_LEVEL_OVERRIDES : undefined;
  if (raw) Object.assign(MATCH_LEVEL, JSON.parse(raw));
}

const LEVEL: { k: number } = { k: 1 };

function meanAttr(p: RosterPlayer): number {
  const v = Object.values(p.stats ?? {}).filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** The eleven of a side: the lineup's players, else the 11 best by mean attribute. */
function startersOf(players: RosterPlayer[], lineup?: string[]): RosterPlayer[] {
  if (lineup && lineup.some(Boolean)) {
    const ids = new Set(lineup.filter(Boolean));
    const xi = players.filter(p => ids.has(p.id));
    if (xi.length > 0) return xi;
  }
  return [...players].sort((a, b) => meanAttr(b) - meanAttr(a)).slice(0, 11);
}

/** Factor for a match level (pure). */
export function matchLevelFactor(level: number): number {
  if (!(level > 0)) return 1;
  return Math.max(1, Math.min(MATCH_LEVEL.MAX, (MATCH_LEVEL.REF / level) ** MATCH_LEVEL.ALPHA));
}

/** Mean attribute of both XIs (pure). */
export function matchLevelOf(playersA: RosterPlayer[], playersB: RosterPlayer[], lineupA?: string[], lineupB?: string[]): number {
  const xi = [...startersOf(playersA, lineupA), ...startersOf(playersB, lineupB)];
  return xi.length ? xi.reduce((a, p) => a + meanAttr(p), 0) / xi.length : 0;
}

export function setMatchLevel(level: number | null): void {
  LEVEL.k = level === null ? 1 : matchLevelFactor(level);
}

export function matchLevelMult(): number {
  return LEVEL.k;
}

export function withMatchLevel<S extends object>(stats: S): S {
  const k = LEVEL.k;
  if (k === 1) return stats;
  const out: Record<string, number> = { ...(stats as unknown as Record<string, number>) };
  for (const key of Object.keys(out)) out[key] = Math.min(10, out[key]! * k);
  return out as unknown as S;
}

/** The player with his raw attributes levelled (same object when k = 1). */
export function levelledPlayer(rp: RosterPlayer): RosterPlayer {
  return LEVEL.k === 1 ? rp : { ...rp, stats: withMatchLevel(rp.stats) };
}

registerEngineMemory('MatchLevelConfig.LEVEL', recordPart(LEVEL as unknown as Record<string, unknown>));
