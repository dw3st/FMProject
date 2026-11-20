import { useEffect, useState } from "react";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getMomentum, getMomentumTimeline } from "@/GameEngine/Domain/Momentum";

/**
 * Stage 17: the momentum bar (engine A/B: + = A) and its per-minute timeline, refreshed on every `momentumPoints` and
 * stats reset, and once a second (a highlights-mode jump restores the stats without an event; the bar fades with time). Used by the match screens only (they are the `gameBus` subscribers).
 */
export function useMomentum(): { bar: number; timeline: number[]; points: { A: number; B: number } } {
  const read = () => { const m = getMomentum(); return { bar: m.bar, timeline: getMomentumTimeline(), points: m.points }; };
  const [m, setM] = useState(read);
  useEffect(() => {
    let raf = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setM(read()); }); };
    const offs = [gameBus.on("momentumPoints", kick), gameBus.on("statsUpdated", kick)];
    const timer = setInterval(kick, 1000);
    return () => { offs.forEach(off => off()); clearInterval(timer); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return m;
}
