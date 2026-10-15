/**
 * AI clubs rest by their own calendar (`.claude/rules/game/multiplayer.md`): the day before and the day after each
 * of their official matches, unless they play that day. Before seats every club rested on the human league's
 * seeded rest days. Seats rest on their own `restDays`.
 */
export function aiRestingClubs(args: {
  playedYesterday: ReadonlySet<string>;
  playsTomorrow: ReadonlySet<string>;
  playsToday: ReadonlySet<string>;
}): Set<string> {
  const out = new Set<string>();
  for (const id of [...args.playedYesterday, ...args.playsTomorrow]) {
    if (!args.playsToday.has(id)) out.add(id);
  }
  return out;
}
