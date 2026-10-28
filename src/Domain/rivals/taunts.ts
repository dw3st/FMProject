// Reactions and ready phrases (multiplayer part 6). Ids only: the texts live in `rivals.taunts.<id>` (pt-BR, en).
import { scoreLineOf } from "@/Domain/rivals/results";
import type { LiveScoreView, LiveSituation, ReactionId, SeatResult, TauntGroup, TauntKind, TauntMeta } from "@/types/rivalsTypes";

export const REACTIONS: readonly ReactionId[] = ["applause", "fire", "laugh", "sorry"];

/** Specific situations first: the menu shows them before win / draw / loss. */
export const TAUNT_GROUPS: readonly TauntGroup[] = [
  "live_goal_for", "live_goal_against",
  "big_win", "big_loss", "comeback_win", "blown_lead", "late_winner", "late_equalizer",
  "shootout_win", "shootout_loss", "home_loss", "away_win", "win", "draw", "loss",
];

const ids = (group: TauntGroup): string[] => [1, 2, 3, 4].map((n) => `${group}_${n}`);

export const TAUNTS: Record<TauntGroup, readonly string[]> = Object.fromEntries(
  TAUNT_GROUPS.map((g) => [g, ids(g)]),
) as unknown as Record<TauntGroup, readonly string[]>;

const CHEER: ReadonlySet<TauntGroup> = new Set<TauntGroup>(["live_goal_for", "big_win", "comeback_win", "late_winner", "shootout_win", "away_win", "win"]);
const TEASE: ReadonlySet<TauntGroup> = new Set<TauntGroup>(["live_goal_against", "big_loss", "blown_lead", "shootout_loss", "home_loss", "loss"]);

/** Tone of a phrase id (`<group>_<n>`): cheering the friend, teasing him, or neutral (draws). */
export function tauntTone(id: string): "cheer" | "tease" | "neutral" {
  const group = id.replace(/_\d+$/, "") as TauntGroup;
  return CHEER.has(group) ? "cheer" : TEASE.has(group) ? "tease" : "neutral";
}

export const ALL_TAUNT_IDS: readonly string[] = TAUNT_GROUPS.flatMap((g) => TAUNTS[g]);

/** English fallback of a reaction in the stored `body`. */
const REACTION_FALLBACK: Record<ReactionId, string> = {
  applause: "applause", fire: "on fire", laugh: "laughs", sorry: "commiserations",
};

export function isReaction(id: string): id is ReactionId {
  return (REACTIONS as readonly string[]).includes(id);
}

/** Phrase ids for the target's situations, in `TAUNT_GROUPS` order, no duplicates. */
export function tauntsFor(groups: readonly TauntGroup[]): string[] {
  const want = new Set(groups);
  return TAUNT_GROUPS.filter((g) => want.has(g)).flatMap((g) => TAUNTS[g]);
}

export function isTauntFor(id: string, groups: readonly TauntGroup[]): boolean {
  return tauntsFor(groups).includes(id);
}

/** A live game's phrase groups: by the friend's last goal (none before the first goal). */
export function liveGroups(live: Pick<LiveScoreView, "lastGoal">): LiveSituation[] {
  if (!live.lastGoal) return [];
  return [live.lastGoal.side === "for" ? "live_goal_for" : "live_goal_against"];
}

type TauntSource = Pick<SeatResult, "nickname" | "clubId" | "clubName" | "opponentName" | "home" | "score"> & { minute?: number };

/** The meta stored with the chat message: ids and the real score, nothing the client wrote. */
export function tauntMeta(args: { kind: TauntKind; id: string; from: TauntSource; live?: boolean }): TauntMeta {
  const f = args.from;
  return {
    kind: args.kind, id: args.id, target: f.nickname, clubId: f.clubId, clubName: f.clubName,
    opponentName: f.opponentName, home: f.home, score: { for: f.score.for, against: f.score.against },
    ...(args.live ? { live: true as const, minute: f.minute ?? 0 } : {}),
  };
}

/** `taunt` read back from the database or the socket; null when it is not one. */
export function parseTauntMeta(raw: unknown): TauntMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const s = m.score as Record<string, unknown> | undefined;
  if (m.kind !== "reaction" && m.kind !== "phrase") return null;
  if (typeof m.id !== "string" || typeof m.target !== "string" || typeof m.clubId !== "string") return null;
  if (typeof m.clubName !== "string" || typeof m.opponentName !== "string" || typeof m.home !== "boolean") return null;
  if (!s || typeof s.for !== "number" || typeof s.against !== "number") return null;
  if (m.kind === "reaction" ? !isReaction(m.id) : !ALL_TAUNT_IDS.includes(m.id)) return null;
  return {
    kind: m.kind, id: m.id, target: m.target, clubId: m.clubId, clubName: m.clubName, opponentName: m.opponentName,
    home: m.home, score: { for: s.for, against: s.against },
    ...(m.live === true ? { live: true as const, minute: typeof m.minute === "number" ? m.minute : 0 } : {}),
  };
}

/** The stored `body` (English, for a client that does not know taunts). */
export function tauntFallbackBody(meta: TauntMeta, phraseEn: string | null): string {
  const what = meta.kind === "reaction" ? REACTION_FALLBACK[meta.id as ReactionId] : (phraseEn ?? meta.id);
  return `${what} · ${scoreLineOf(meta)}`;
}
