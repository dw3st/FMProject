import type { ClubFinances, RosterPlayer, Squad } from "@/types/playerTypes";

/** A squad as another seat may see it: no private club or player data. */
export type PublicSeatSquad = Omit<Squad, "finances" | "players" | PrivateClubKey> & {
  finances?: Omit<ClubFinances, "budget">;
  players: Omit<RosterPlayer, PrivatePlayerKey>[];
};

type PrivateClubKey = "moraleClub" | "staff" | "facilities" | "managerAttributes" | "styleFamiliarity" | "registrations";
type PrivatePlayerKey = "morale" | "moraleLog" | "squadStatus";

/**
 * The opponent's squad when it is another seat's club (`.claude/rules/game/multiplayer.md` → part 4): the match
 * preview shows it like an AI club, never that seat's morale, talks and promises, staff, facilities, manager
 * attributes, style familiarity, registration lists or balance.
 */
export function publicSeatSquad(squad: Squad): PublicSeatSquad {
  const {
    moraleClub: _mc, staff: _s, facilities: _f, managerAttributes: _ma, styleFamiliarity: _sf, registrations: _r,
    finances, players, ...rest
  } = squad;
  const pub: PublicSeatSquad = {
    ...rest,
    players: players.map(({ morale: _m, moraleLog: _ml, squadStatus: _ss, ...p }) => p),
  };
  if (finances) {
    const { budget: _b, ...f } = finances;
    pub.finances = f;
  }
  return pub;
}
