/**
 * Mental attributes (`.claude/rules/game/mental.md`): decisions, composure, flair, anticipation
 * (0.0–10.0, one decimal) on every roster player. Pure, no I/O.
 *
 * A player without them (world data from before, a save from before) gets them derived from his
 * other attributes, age, id and personality — deterministic, so the same player always gets the same
 * values (`withMentalAttributes`, applied by the DAL reads). Not a migration: like `personalityOf`.
 */
import { MENTAL as M } from "@/Domain/mental/mentalConfig";
import { generatePersonality, mentalShiftOf, personalityOf, type MentalShift } from "@/Domain/personality/personality";
import type { Personality } from "@/types/personalityTypes";
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { roundAttr } from "@/Domain/attributes";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export const MENTAL_KEYS = ["decisions", "composure", "flair", "anticipation"] as const;
export type MentalKey = (typeof MENTAL_KEYS)[number];
export type MentalValues = Record<MentalKey, number>;
export type BaseStats = Omit<PlayerStatsRecord, MentalKey>;

const MENTAL_SET: ReadonlySet<string> = new Set(MENTAL_KEYS);
export function isMentalKey(k: string): k is MentalKey {
  return MENTAL_SET.has(k);
}

const n = (a: number | undefined) => clamp((a ?? 0) / M.SCALE, 0, 1);

/** Experience 0..1 from age. */
export function experienceOf(age: number): number {
  return clamp((age - M.EXP_FROM) / M.EXP_SPAN, 0, 1);
}

/** Deterministic N(0,1) for a player and a key (Box–Muller over mulberry32). */
function gauss(id: string, k: string): number {
  const r = mulberry32(seedFrom(`mental:${id}:${k}`));
  const u1 = Math.max(r(), 1e-12);
  const u2 = r();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** The four mental attributes derived from the 13 others (design §2). */
export function deriveMental(stats: BaseStats, age: number, id: string, shift: MentalShift): MentalValues {
  const exp = experienceOf(age);
  const W = M.WEIGHTS;
  const v = (raw: number, k: MentalKey) => roundAttr(M.SCALE * clamp(raw + M.NOISE * gauss(id, k), 0, 1));
  return {
    decisions: v(
      W.decisions.vision * n(stats.vision) + W.decisions.passing * n(stats.passing)
        + W.decisions.pressing * n(stats.pressing) + W.decisions.exp * exp + W.decisions.prof * shift.prof,
      "decisions",
    ),
    composure: v(
      W.composure.finishing * n(stats.finishing) + W.composure.dribbling * n(stats.dribbling)
        + W.composure.strength * n(stats.strength) + W.composure.passing * n(stats.passing)
        + W.composure.exp * exp + W.composure.temp * shift.temp,
      "composure",
    ),
    flair: v(
      W.flair.dribbling * n(stats.dribbling) + W.flair.vision * n(stats.vision)
        + W.flair.finishing * n(stats.finishing) + W.flair.acceleration * n(stats.acceleration)
        + W.flair.amb * shift.amb + W.flair.prof * shift.prof,
      "flair",
    ),
    anticipation: v(
      W.anticipation.pressing * n(stats.pressing) + W.anticipation.vision * n(stats.vision)
        + W.anticipation.tackling * n(stats.tackling) + W.anticipation.exp * exp,
      "anticipation",
    ),
  };
}

/** Hidden consistency 0..1 (personality and experience). Not stored. */
export function consistencyOf(age: number, shift: MentalShift): number {
  const C = M.CONSISTENCY;
  return clamp(C.BASE + C.PROF * shift.prof + C.TEMP * shift.temp + C.EXP * (experienceOf(age) - 0.5), 0, 1);
}

type MentalHolder = Pick<RosterPlayer, "id" | "age" | "stats"> &
  Partial<Pick<RosterPlayer, "reborn" | "personality" | "personalityGrowth">>;

/** True when every mental key is a number. */
export function hasMental(stats: Partial<PlayerStatsRecord> | undefined): boolean {
  if (!stats) return false;
  for (const k of MENTAL_KEYS) if (typeof stats[k] !== "number") return false;
  return true;
}

/** The stats with every missing mental key derived (same object when nothing is missing). */
export function statsWithMental(stats: PlayerStatsRecord, age: number, id: string, shift: MentalShift): PlayerStatsRecord {
  if (hasMental(stats)) return stats;
  const d = deriveMental(stats, age, id, shift);
  const out = { ...stats } as PlayerStatsRecord;
  for (const k of MENTAL_KEYS) if (typeof out[k] !== "number") out[k] = d[k];
  return out;
}

/**
 * The player with every missing mental key filled (deterministic by id). A player who already has
 * them is returned as is (same object): the DAL reads run this on every player.
 */
export function withMentalAttributes<T extends MentalHolder>(p: T): T {
  if (!p?.stats || hasMental(p.stats)) return p;
  return { ...p, stats: statsWithMental(p.stats, p.age ?? 25, p.id, mentalShiftOf(personalityOf(p))) };
}

/** Mutating variant for the hot DAL paths (a just-parsed JSON object nobody else holds). */
export function fillMentalInPlace(p: MentalHolder): void {
  if (!p?.stats || hasMental(p.stats)) return;
  const d = deriveMental(p.stats, p.age ?? 25, p.id, mentalShiftOf(personalityOf(p)));
  const s = p.stats as unknown as Record<string, number>;
  for (const k of MENTAL_KEYS) if (typeof s[k] !== "number") s[k] = d[k];
}

/** Fills the missing mental keys of every player of a just-parsed squad (elenco and base), in place. */
export function fillSquadMentalInPlace(squad: { players?: MentalHolder[]; youth?: MentalHolder[] }): void {
  for (const p of squad.players ?? []) fillMentalInPlace(p);
  for (const p of squad.youth ?? []) fillMentalInPlace(p);
}

/** Fills the missing mental keys of a retired player's last attributes, in place. */
export function fillRetiredMentalInPlace(r: Pick<RosterPlayer, "id" | "age"> & { statsAtRetirement?: PlayerStatsRecord } & Partial<Pick<RosterPlayer, "reborn" | "personality" | "personalityGrowth">>): void {
  if (!r?.statsAtRetirement || hasMental(r.statsAtRetirement)) return;
  fillMentalInPlace({ ...r, stats: r.statsAtRetirement });
}

/**
 * Full attributes for a generated player: the 13 base ones plus the derived mental ones (the
 * generators' common step). `personality` defaults to the one generated for `id`.
 */
export function mentalStatsFor(base: BaseStats, age: number, id: string, personality?: Personality): PlayerStatsRecord {
  const shift = mentalShiftOf(personality ?? generatePersonality(id));
  return { ...base, ...deriveMental(base, age, id, shift) } as PlayerStatsRecord;
}
