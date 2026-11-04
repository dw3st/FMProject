import { daysBetween } from "@/Domain/dates";
import { personalityOf, traitBand } from "@/Domain/personality/personality";
import { PERSONALITY as P } from "@/Domain/personality/personalityConfig";
import { effectiveStars } from "@/Domain/staff/staff";
import type { TraitBand } from "@/types/personalityTypes";
import type { MentoredTrait, RosterPlayer, Squad } from "@/types/playerTypes";

/** The assistant works on a young player's mentality (`.claude/rules/game/personality.md` → "Mentalidade"). */
export const MENTORING = {
  MAX_PLAYERS: 3,
  /** Age limits when it starts; at the rollover he is already a year older, hence + 1 there. */
  YOUNG_AGE: 23,
  MAX_AGE: 29,
  /** Points of the trait per season. */
  GAIN_YOUNG: 1,
  GAIN_OLDER: 0.5,
  /** A good assistant makes it quicker. */
  GOOD_ASSISTANT_STARS: 4,
  GOOD_ASSISTANT_MULT: 1.5,
  /** A season that barely started for him does not count. */
  MIN_DAYS: 90,
} as const;

export function isMentoredTrait(v: unknown): v is MentoredTrait {
  return v === "professionalism" || v === "temperament";
}

/** Already the best it can be: 20 of professionalism, 1 of temperament (20 = hot head). */
export function traitAtBest(p: RosterPlayer, trait: MentoredTrait): boolean {
  const t = personalityOf(p);
  return trait === "professionalism" ? t.professionalism >= P.MAX : t.temperament <= P.MIN;
}

export type MentoringRefusal = "tooOld" | "onLoan" | "atBest" | "mentoringFull";

export function mentoringRefusal(squad: Squad, player: RosterPlayer, trait: MentoredTrait): MentoringRefusal | null {
  if (player.age > MENTORING.MAX_AGE) return "tooOld";
  if (player.loan) return "onLoan";
  if (traitAtBest(player, trait)) return "atBest";
  const others = squad.players.filter((p) => p.mentoring && p.id !== player.id).length;
  return others >= MENTORING.MAX_PLAYERS ? "mentoringFull" : null;
}

export interface MentoringNews {
  playerId: string;
  playerName: string;
  trait: MentoredTrait;
  /** The band after the change. */
  band: TraitBand;
  /** The trait reached its best: the work is over. */
  finished: boolean;
}

/** End of the club's season: the players in the work for long enough move on (the squad has already aged). */
export function advanceMentoring(squad: Squad, date: string): { squad: Squad; news: MentoringNews[] } {
  if (!squad.players.some((p) => p.mentoring)) return { squad, news: [] };
  const mult = effectiveStars(squad, "assistant") >= MENTORING.GOOD_ASSISTANT_STARS ? MENTORING.GOOD_ASSISTANT_MULT : 1;
  const news: MentoringNews[] = [];
  const players = squad.players.map((p) => {
    const m = p.mentoring;
    if (!m || daysBetween(m.since, date) < MENTORING.MIN_DAYS || p.age - 1 > MENTORING.MAX_AGE) return p;
    const gain = (p.age - 1 <= MENTORING.YOUNG_AGE ? MENTORING.GAIN_YOUNG : MENTORING.GAIN_OLDER) * mult;
    const progress = m.progress + gain;
    const whole = Math.floor(progress);
    if (whole === 0) return { ...p, mentoring: { ...m, progress } };
    const grown: RosterPlayer = {
      ...p,
      personalityGrowth: { ...p.personalityGrowth, [m.trait]: (p.personalityGrowth?.[m.trait] ?? 0) + whole },
      mentoring: { ...m, progress: progress - whole },
    };
    const finished = traitAtBest(grown, m.trait);
    const t = personalityOf(grown);
    news.push({
      playerId: p.id, playerName: p.name, trait: m.trait,
      band: traitBand(m.trait === "professionalism" ? t.professionalism : t.temperament), finished,
    });
    if (!finished) return grown;
    const { mentoring: _done, ...rest } = grown;
    return rest as RosterPlayer;
  });
  return { squad: { ...squad, players }, news };
}
