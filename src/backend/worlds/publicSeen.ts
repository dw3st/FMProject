// "Last seen" of the seats, in memory (public world, part 5b). No imports: `requireSeat` and `publicWorld.ts` both
// use it, and `publicWorld.ts` reaches the auth middleware through the day advance.

const seen = new Map<string, number>(); // `${saveId}:${seatId}` → last request (ms)

/** Called by `requireSeat` for every world: memory only (cheap); `flushSeen` writes it at most hourly. */
export function markSeen(saveId: string, seatId: string, nowMs: number = Date.now()): void {
  seen.set(`${saveId}:${seatId}`, nowMs);
}

/** The seat's last request in this process (ms), or undefined. */
export function seenAt(saveId: string, seatId: string): number | undefined {
  return seen.get(`${saveId}:${seatId}`);
}
