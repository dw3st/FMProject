import type { WorldMemberView } from "@/types/multiplayerTypes";

/**
 * Clubs run by a human of a friends' league, keyed by club id, with the name the tables show: the member's
 * nickname, else the manager's name. Members without a club (sacked, waiting for offers) are left out.
 */
export function humanClubsOf(members: readonly WorldMemberView[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of members) {
    if (m.unemployed || !m.clubId) continue;
    out.set(m.clubId, m.nickname ?? m.managerName);
  }
  return out;
}
