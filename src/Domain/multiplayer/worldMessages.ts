import type { WorldInboxMessage } from "@/types/inboxTypes";
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
