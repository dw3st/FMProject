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
  const others = mentoredPlayers(squad).filter((p) => p.id !== player.id).length;
  return others >= MENTORING.MAX_PLAYERS ? "mentoringFull" : null;
}

/** The club's players and academy players in the assistant's work (the academy too since report 2eeaae39). */
export function mentoredPlayers(squad: Squad): RosterPlayer[] {
  return [...squad.players, ...(squad.youth ?? [])].filter((p) => p.mentoring);
}

/** A player of the club or of its academy, by id. */
export function findOwnPlayer(squad: Squad, id: string): { player: RosterPlayer; academy: boolean } | null {
  const first = squad.players.find((p) => p.id === id);
  if (first) return { player: first, academy: false };
  const young = squad.youth?.find((p) => p.id === id);
  return young ? { player: young, academy: true } : null;
}

/** One player in the assistant's work, for the player page (tester report 2026-11-17). */
export interface MentoringRow {
  id: string;
  name: string;
  trait: MentoredTrait;
  since: string;
  /** Points of the trait he gained so far (`personalityGrowth`, temperament counted down). */
  gained: number;
  /** In the academy (`squad.youth`). */
  academy?: true;
  /** With the end of the club's season known: whether the work counts at that end of season, and how much. */
  counts?: boolean;
  amount?: number;
}

export function mentoringTeam(squad: Squad, seasonEnd?: string | null): MentoringRow[] {
  const youth = new Set((squad.youth ?? []).map((p) => p.id));
  const good = seasonEnd ? hasGoodAssistant(squad) : false;
  return mentoredPlayers(squad).map((p) => {
    const next = seasonEnd ? nextMentoringGain(p.age, p.mentoring!.since, seasonEnd, good) : null;
    return {
      id: p.id, name: p.name, trait: p.mentoring!.trait, since: p.mentoring!.since,
      gained: Math.abs(p.personalityGrowth?.[p.mentoring!.trait] ?? 0),
      ...(youth.has(p.id) ? { academy: true as const } : {}),
      ...(next ? { counts: next.counts, amount: next.amount } : {}),
    };
  });
}

export function hasGoodAssistant(squad: Squad): boolean {
  return effectiveStars(squad, "assistant") >= MENTORING.GOOD_ASSISTANT_STARS;
}

/**
 * What the next end of season gives a player in the work: the season's gain (by today's age, the assistant) and whether
 * he will have the MIN_DAYS by then. Past MAX_AGE at that rollover nothing.
 */
export function nextMentoringGain(age: number, since: string, seasonEnd: string, goodAssistant: boolean): { amount: number; counts: boolean } {
  if (age > MENTORING.MAX_AGE) return { amount: 0, counts: false };
  const amount = (age <= MENTORING.YOUNG_AGE ? MENTORING.GAIN_YOUNG : MENTORING.GAIN_OLDER) * (goodAssistant ? MENTORING.GOOD_ASSISTANT_MULT : 1);
  return { amount, counts: daysBetween(since, seasonEnd) >= MENTORING.MIN_DAYS };
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

/**
 * End of the club's season: the players in the work for long enough move on. The squad has already aged; the
 * academy has not (it ages with the youth rollover, later the same day), so its age is taken as it is.
 */
export function advanceMentoring(squad: Squad, date: string): { squad: Squad; news: MentoringNews[] } {
  if (mentoredPlayers(squad).length === 0) return { squad, news: [] };
  const mult = effectiveStars(squad, "assistant") >= MENTORING.GOOD_ASSISTANT_STARS ? MENTORING.GOOD_ASSISTANT_MULT : 1;
  const news: MentoringNews[] = [];
  const grow = (p: RosterPlayer, age: number): RosterPlayer => {
    const m = p.mentoring;
    if (!m || daysBetween(m.since, date) < MENTORING.MIN_DAYS || age > MENTORING.MAX_AGE) return p;
    const gain = (age <= MENTORING.YOUNG_AGE ? MENTORING.GAIN_YOUNG : MENTORING.GAIN_OLDER) * mult;
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
  };
  const players = squad.players.map((p) => grow(p, p.age - 1));
  const youth = squad.youth?.map((p) => grow(p, p.age));
  return { squad: { ...squad, players, ...(youth ? { youth } : {}) }, news };
}
