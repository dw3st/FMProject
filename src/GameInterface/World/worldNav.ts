import type { WorldPhase } from "@/types/multiplayerTypes";

/** The page a game screen must go to now: `/world` while the world is in the lobby; `/dashboard` from `/world` of a solo save. */
export function worldRedirect(
  pathname: string, save: { mode?: "solo" | "multi"; world?: { phase: WorldPhase } } | null,
): string | null {
  if (!save) return null;
  if (save.world?.phase === "lobby") return pathname === "/world" ? null : "/world";
  if (pathname === "/world" && save.mode !== "multi") return "/dashboard";
  return null;
}

export function joinCodeFromPath(pathname: string): string {
  return decodeURIComponent(pathname.split("/")[2] ?? "");
}

export function joinLink(origin: string, code: string): string {
  return `${origin}/join/${code}`;
}
