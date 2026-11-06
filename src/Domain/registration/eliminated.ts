/**
 * A club with no more matches in a knockout competition (cup or continental): its registration list no longer counts
 * for anything, so the Registration tab marks it (tester report, 4.47.19). Pure.
 */
import { fixtureWinner } from "@/Domain/cups/cupProgress";
import { tieWinner } from "@/Domain/continental/knockout";
import type { Fixture } from "@/types/calendarTypes";

export function outOfCompetition(fixtures: readonly Fixture[], clubId: string, championId: string | null | undefined): boolean {
  const mine = fixtures.filter((f) => f.home === clubId || f.away === clubId);
  if (mine.some((f) => !f.played)) return false;
  if (championId) return true;
  // Out in the group stage: the knockout draw is made and the club is not in it.
  const anyKnockout = fixtures.some((f) => f.knockout);
  const myKnockout = mine.filter((f) => f.knockout);
  if (anyKnockout && mine.length > 0 && myKnockout.length === 0) return true;
  const legs = new Map<string, Fixture[]>();
  for (const f of myKnockout) {
    if (f.tieId && f.leg) {
      const l = legs.get(f.tieId) ?? [];
      l.push(f);
      legs.set(f.tieId, l);
      continue;
    }
    const w = fixtureWinner(f);
    if (w && w !== clubId) return true;
  }
  for (const l of legs.values()) {
    const leg1 = l.find((f) => f.leg === 1), leg2 = l.find((f) => f.leg === 2);
    if (!leg1 || !leg2) continue;
    const w = tieWinner(leg1, leg2);
    if (w && w !== clubId) return true;
  }
  return false;
}
