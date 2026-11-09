import { useEffect } from "react";
import { readMatchInFrame } from "@/GameInterface/artPrefs";
import { clearMatchRadioSlot } from "@/GameInterface/World/frameHost";

/** The live match page (`/match-live`) inside the frame. */
export const MATCH_PAGE = "/match-live";

/**
 * The live match inside the game frame (spa-shell phase 2): the match page runs in an iframe, so the engine's globals
 * live and die with the match. The page goes back to the frame through `navigate` (result, dashboard). With the
 * preference off, the match page opens on its own as before.
 */
export function MatchFrame({ search }: { search: string }) {
  const inFrame = readMatchInFrame();
  const src = MATCH_PAGE + search;

  useEffect(() => {
    if (!inFrame) window.location.replace(src);
  }, [inFrame, src]);

  // Leaving the match removes the iframe; what it put in the footer has to go with it.
  useEffect(() => clearMatchRadioSlot, []);

  if (!inFrame) return null;
  return (
    <iframe
      src={src}
      title="match"
      allow="autoplay; fullscreen"
      className="block w-full h-full border-0 bg-background"
    />
  );
}
