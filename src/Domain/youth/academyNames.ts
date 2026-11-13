import { unitFrom } from "@/Domain/rng";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * Names of the players a club brings up (academy intake, prospects, the refill youngsters of the rollover, the
 * generated youth-team fillers). First names and surnames come from the country's name book (the staff's,
 * `staffNameBook.ts`), set by the server once a process; without it (tests, scripts) the callers fall back to the
 * club's own players, as before.
 *
 * 11.1 (tester report: academy players kept names like other players'):
 * - the surname is drawn from `lastYouth` when the book has it: the country's surnames that no well-known player of
 *   the starting world carries, so a youngster is not another Tarkowski or Nketiah;
 * - a surname already in the club (first team, academy, this intake) is drawn again, not only a full-name clash;
 * - the refill youngsters use the same draw (they copied a team-mate's surname).
 */
export interface AcademyNameEntry {
  first: readonly string[];
  last: readonly string[];
  /** Surnames no well-known player carries; absent or short = `last`. */
  lastYouth?: readonly string[];
}
export type AcademyNameBook = Readonly<Record<string, AcademyNameEntry>>;

/** Fewer youth surnames than this: the whole list is used (small countries). */
export const ACADEMY_NAMES = { MIN_YOUTH_SURNAMES: 15, TRIES: 12 } as const;

let academyNameBook: AcademyNameBook | null = null;

export function setAcademyNameBook(book: AcademyNameBook | null): void {
  academyNameBook = book;
}

export const surnameOf = (name: string): string => name.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";

/** The surnames a new youngster must not repeat: everyone at the club, first team and academy. */
export function clubSurnames(squad: { players: readonly Pick<RosterPlayer, "name">[]; youth?: readonly Pick<RosterPlayer, "name">[] }): Set<string> {
  return new Set([...squad.players, ...(squad.youth ?? [])].map((p) => surnameOf(p.name)));
}

/**
 * "I. Surname" from the country's book, or null when the book has nothing for the nationality. `seed` and `slot`
 * make the draw deterministic; `taken` (full names, grown by this call) and `surnames` are the clashes to avoid.
 */
export function drawAcademyName(args: {
  seed: string;
  slot: number | string;
  nationality: string | null | undefined;
  surnames: ReadonlySet<string>;
  taken?: Set<string>;
}): string | null {
  const { seed, slot, nationality, surnames, taken } = args;
  const entry = nationality ? academyNameBook?.[nationality] : undefined;
  if (!entry || entry.first.length === 0 || entry.last.length === 0) return null;
  const lasts = entry.lastYouth && entry.lastYouth.length >= ACADEMY_NAMES.MIN_YOUTH_SURNAMES ? entry.lastYouth : entry.last;
  const nameAt = (salt: string): string => {
    const first = entry.first[Math.floor(unitFrom(`${seed}:first:${slot}${salt}`) * entry.first.length)]!;
    const last = lasts[Math.floor(unitFrom(`${seed}:last:${slot}${salt}`) * lasts.length)]!;
    return `${first[0]}. ${last}`;
  };
  const takenSurnames = new Set([...(taken ?? [])].map(surnameOf));
  const clash = (n: string) => !!taken?.has(n) || surnames.has(surnameOf(n)) || takenSurnames.has(surnameOf(n));
  let name = nameAt("");
  for (let k = 1; clash(name) && k <= ACADEMY_NAMES.TRIES; k++) name = nameAt(`:n${k}`);
  taken?.add(name);
  return name;
}
