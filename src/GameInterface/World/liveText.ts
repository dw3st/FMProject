import type { LiveScoreView } from "@/types/rivalsTypes";

type T = (key: string, opts?: Record<string, unknown>) => string;

const KEY = { live: "rivals.liveLine", half: "rivals.halfLine", ended: "rivals.endedLine", stale: "rivals.staleLine" } as const;

/** "ao vivo · 1–0 · 67'" (or half-time / full time / interrupted). */
export function liveText(t: T, l: Pick<LiveScoreView, "status" | "minute" | "score">): string {
  const score = `${l.score.for}–${l.score.against}`;
  return l.status === "live" ? t(KEY.live, { score, minute: l.minute }) : t(KEY[l.status], { score });
}
