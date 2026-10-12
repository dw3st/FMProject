import type { NationalInboxMessage } from "@/types/inboxTypes";

/** Inbox news of the human club's players with their national teams (`.claude/rules/game/national-teams.md`). */
export function buildNationalMessage(args: {
  date: string;
  kind: "called_up" | "returned";
  players: NationalInboxMessage["players"];
}): NationalInboxMessage {
  const n = args.players.length;
  const names = args.players.map((p) => p.name).join(", ");
  return {
    id: `national-${args.kind}-${args.date}`,
    date: args.date,
    createdAt: new Date().toISOString(),
    read: false,
    category: "national",
    kind: args.kind,
    subject: args.kind === "called_up" ? `${n} player(s) called up by their national teams` : `${n} player(s) back from their national teams`,
    preview: names,
    players: args.players,
  };
}
