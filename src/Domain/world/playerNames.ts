/**
 * Players the world would show with the same abbreviated name ("J. Bellingham" at Real Madrid and
 * at Dortmund). The table is built from the base world by `scripts/buildPlayerNameFixes.ts` and
 * applied when a save's squads are read, so running worlds and start kits get it without a rewrite.
 */
import NAME_FIXES from "@/Domain/world/playerNameFixes.json";

const FIXES = NAME_FIXES as Record<string, string>;

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * "J. Bellingham" + "Jude Victor William Bellingham" -> "Jude Bellingham": the first given name that
 * starts with the initial (a player known by a middle name keeps it: "N. Collins" + "Pharrell Nnamdi
 * Collins" -> "Nnamdi Collins"). Null when the name isn't abbreviated or no given name matches.
 */
export function expandedName(name: string, fullName: string | undefined): string | null {
  const m = /^(\p{L})\.\s+(.+)$/u.exec(name);
  if (!m || !fullName) return null;
  const initial = fold(m[1]!);
  const given = fullName
    .trim()
    .split(/\s+/)
    .find((t) => !t.endsWith(".") && fold(t).startsWith(initial));
  return given ? `${given} ${m[2]}` : null;
}

export interface NamedPlayer {
  id: string;
  name: string;
  fullName?: string;
}

/** Id -> full first name for every player whose abbreviated name is shared with another player. */
export function buildNameFixes(players: readonly NamedPlayer[]): Record<string, string> {
  const byName = new Map<string, NamedPlayer[]>();
  for (const p of players) {
    const group = byName.get(p.name);
    if (group) group.push(p);
    else byName.set(p.name, [p]);
  }
  const fixes: Record<string, string> = {};
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    group.forEach((p) => {
      const full = expandedName(p.name, p.fullName);
      if (full) fixes[p.id] = full;
    });
  }
  return fixes;
}

export function fixedPlayerName<P extends { id: string; name: string }>(player: P): P {
  const name = FIXES[player.id];
  return name && name !== player.name ? { ...player, name } : player;
}

/** The same squad when none of its players is in the table. */
export function withFixedPlayerNames<S extends { players: { id: string; name: string }[] }>(squad: S): S {
  if (!squad.players?.some((p) => FIXES[p.id] && FIXES[p.id] !== p.name)) return squad;
  return { ...squad, players: squad.players.map(fixedPlayerName) };
}
