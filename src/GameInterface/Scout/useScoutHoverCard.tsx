import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import { HOVER_CARD_WIDTH, ScoutHoverCard } from "@/GameInterface/Scout/ScoutHoverCard";

/** Pause on the name before the card shows (ms), as in the scout search. */
const HOVER_DELAY_MS = 280;

/**
 * The scout search's floating player card for a table that only has player ids (reports, watch list): the row is
 * fetched from `scout-rows` on the first hover and kept for the life of the table. A player the search does not know
 * (a clubless youngster) shows no card.
 */
export function useScoutHoverCard(saveId: string): {
  hoverProps: (playerId: string) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
  card: ReactNode;
} {
  const [hover, setHover] = useState<{ player: DisplayPlayer; x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const wanted = useRef<string | null>(null);
  const rows = useRef(new Map<string, DisplayPlayer | null>());
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    wanted.current = null;
    setHover(null);
  };
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const show = async (playerId: string, x: number, y: number) => {
    let player = rows.current.get(playerId);
    if (player === undefined) {
      try {
        const res = await fetch(`/api/saves/${saveId}/scout-rows?ids=${encodeURIComponent(playerId)}`);
        const body = res.ok ? ((await res.json()) as { rows?: DisplayPlayer[] }) : null;
        if (!body) return;
        player = body.rows?.[0] ?? null;
        rows.current.set(playerId, player);
      } catch {
        return;
      }
    }
    // The pointer may have left (or moved to another row) while the row was loading.
    if (player && wanted.current === playerId) setHover({ player, x, y });
  };

  const hoverProps = (playerId: string) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      const { clientX, clientY } = e;
      if (timer.current !== null) window.clearTimeout(timer.current);
      wanted.current = playerId;
      timer.current = window.setTimeout(() => {
        const x = clientX + 18 + HOVER_CARD_WIDTH > window.innerWidth ? Math.max(8, clientX - 18 - HOVER_CARD_WIDTH) : clientX + 18;
        const y = Math.max(64, Math.min(clientY - 40, window.innerHeight - 520));
        void show(playerId, x, y);
      }, HOVER_DELAY_MS);
    },
    onMouseLeave: clear,
  });

  return { hoverProps, card: hover ? <ScoutHoverCard player={hover.player} x={hover.x} y={hover.y} /> : null };
}
