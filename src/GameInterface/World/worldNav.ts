import type { WorldPhase } from "@/types/multiplayerTypes";

/** Pages outside the game frame: never redirected, so a lobby owner can still open an invite link or start another game. */
const FREE_PATHS = ["/join", "/new-game", "/start", "/login", "/world"];

/** The page a game screen must go to now: `/world` while the world is in the lobby; `/dashboard` from `/world` of a solo save. */
export function worldRedirect(
  pathname: string, save: { mode?: "solo" | "multi"; world?: { phase: WorldPhase } } | null,
): string | null {
  if (!save) return null;
  if (save.world?.phase === "lobby") {
    return FREE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? null : "/world";
  }
  if (pathname === "/world" && save.mode !== "multi") return "/dashboard";
  return null;
}

export function joinCodeFromPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname.split("/")[2] ?? "");
  } catch {
    return "";
  }
}

export function joinLink(origin: string, code: string): string {
  return `${origin}/join/${code}`;
}
