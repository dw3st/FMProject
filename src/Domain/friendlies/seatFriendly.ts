import { addDays } from "@/Domain/dates";

/**
 * Friendly between two managers of a world (9.5, `.claude/rules/game/multiplayer.md` → "Amistoso entre amigos"):
 * one invites from the Rivals card, the game day is the first day free for both, the other accepts in the inbox,
 * and the advance plays it as a quick game, like the director's friendlies: nothing official counts.
 */
export const SEAT_FRIENDLY = {
  /** The first day that can be picked is this many days ahead. */
  MIN_LEAD: 2,
  /** ...and the last one this many. */
  HORIZON: 45,
  /** Pending or accepted friendlies a manager can have. */
  MAX_OPEN: 3,
} as const;

export type SeatFriendlyStatus = "pending" | "accepted" | "declined" | "cancelled" | "played";

export interface SeatFriendly {
  id: string;
  /** Who invited: his club plays at home. */
  fromSeat: string;
  toSeat: string;
  fromClub: string;
  toClub: string;
  date: string;
  status: SeatFriendlyStatus;
  createdOn: string;
  /** Home (the inviter) and away goals once played. */
  score?: { home: number; away: number };
}

/**
 * The first day from `today + MIN_LEAD` to `today + HORIZON` with no official game of either club the day
 * before, the day itself or the day after, not blocked for national teams, and no other friendly of theirs.
 */
export function pickFriendlyDate(today: string, busy: ReadonlySet<string>, blocked: ReadonlySet<string>): string | null {
  for (let k = SEAT_FRIENDLY.MIN_LEAD; k <= SEAT_FRIENDLY.HORIZON; k++) {
    const d = addDays(today, k);
    if (blocked.has(d) || busy.has(d) || busy.has(addDays(d, -1)) || busy.has(addDays(d, 1))) continue;
    return d;
  }
  return null;
}

/** Friendlies still to play (pending or accepted). */
export function openFriendlies(list: readonly SeatFriendly[] | undefined): SeatFriendly[] {
  return (list ?? []).filter((f) => f.status === "pending" || f.status === "accepted");
}

export type FriendlyInviteRefusal = "self" | "tooMany" | "alreadyInvited" | "noDate";

export function inviteRefusal(args: { list: readonly SeatFriendly[] | undefined; fromSeat: string; toSeat: string }): FriendlyInviteRefusal | null {
  if (args.fromSeat === args.toSeat) return "self";
  const open = openFriendlies(args.list);
  if (open.filter((f) => f.fromSeat === args.fromSeat || f.toSeat === args.fromSeat).length >= SEAT_FRIENDLY.MAX_OPEN) return "tooMany";
  const pair = (f: SeatFriendly) => (f.fromSeat === args.fromSeat && f.toSeat === args.toSeat) || (f.fromSeat === args.toSeat && f.toSeat === args.fromSeat);
  if (open.some(pair)) return "alreadyInvited";
  return null;
}

/** Days the two clubs already gave to friendlies (no second one on those days or next to them). */
export function friendlyBusyDays(list: readonly SeatFriendly[] | undefined, clubs: readonly string[]): string[] {
  return openFriendlies(list).filter((f) => clubs.includes(f.fromClub) || clubs.includes(f.toClub)).map((f) => f.date);
}

/** Pending invitations whose day came without an answer are dropped; the list keeps the last 40 closed ones. */
export function pruneFriendlies(list: readonly SeatFriendly[] | undefined, today: string): SeatFriendly[] {
  const out = (list ?? []).map((f) => (f.status === "pending" && f.date <= today ? { ...f, status: "cancelled" as const } : f));
  const open = out.filter((f) => f.status === "pending" || f.status === "accepted");
  const closed = out.filter((f) => !(f.status === "pending" || f.status === "accepted")).slice(-40);
  return [...closed, ...open];
}
