import type { WorldInboxMessage, WorldSeasonClosedInboxMessage } from "@/types/inboxTypes";
import type { NewsItem } from "@/types/newsTypes";

/** A manager joined (`joined`), left on his own (`left`) or was removed by the owner (`removed`). */
export interface MemberChange {
  seatId: string;
  event: "joined" | "left" | "removed";
  managerName: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
}

const KIND = { joined: "member_joined", left: "member_left", removed: "member_removed" } as const;

/** Inbox of every other seat of the world. The screen translates it (`world.inbox.*`). */
export function buildWorldMemberMessage(date: string, c: MemberChange): WorldInboxMessage {
  return {
    id: `world-${c.event}-${c.seatId}-${date}`,
    date,
    createdAt: date,
    read: false,
    category: "world",
    kind: KIND[c.event],
    subject: c.event === "joined" ? `${c.managerName} joins the league` : `${c.managerName} leaves the league`,
    preview: c.clubName,
    managerName: c.managerName,
    clubName: c.clubName,
  };
}

/** A manager's season closed (friends' league standings): one per closed row, to every seat of the day. */
export function buildSeasonClosedMessage(date: string, a: {
  seatId: string; managerName: string; clubName: string; season: string; points: number; rank: number; of: number;
}): WorldSeasonClosedInboxMessage {
  const signed = a.points > 0 ? `+${a.points}` : `${a.points}`;
  return {
    id: `world-season_closed-${a.seatId}-${a.season}-${date}`,
    date,
    createdAt: date,
    read: false,
    category: "world",
    kind: "season_closed",
    subject: `${a.managerName}'s season closed: ${signed}`,
    preview: `${a.clubName} · ${a.rank} of ${a.of}`,
    managerName: a.managerName,
    clubName: a.clubName,
    season: a.season,
    points: a.points,
    rank: a.rank,
    of: a.of,
  };
}

/** World news (`world_member`, importance 3, only written in a multiplayer world). */
export function worldMemberNews(date: string, c: MemberChange): NewsItem {
  return {
    id: `${date}:world_member:${c.seatId}:${c.event}`,
    date,
    kind: "world_member",
    importance: 3,
    league: c.leagueSlug,
    clubIds: c.clubId ? [c.clubId] : [],
    playerIds: [],
    params: { manager: c.managerName, club: c.clubName, event: c.event },
  };
}
