import { describe, expect, test } from "bun:test";
import { liveText } from "@/GameInterface/World/liveText";
import type { LiveScoreView } from "@/types/rivalsTypes";

const t = (k: string, o?: Record<string, unknown>) => `${k}|${JSON.stringify(o ?? {})}`;
const live = { status: "live", minute: 67, score: { for: 1, against: 0 } } as LiveScoreView;

describe("liveText", () => {
  test("by status", () => {
    expect(liveText(t, live)).toBe(`rivals.liveLine|${JSON.stringify({ score: "1–0", minute: 67 })}`);
    expect(liveText(t, { ...live, status: "half" })).toBe(`rivals.halfLine|${JSON.stringify({ score: "1–0" })}`);
    expect(liveText(t, { ...live, status: "ended" })).toContain("rivals.endedLine");
    expect(liveText(t, { ...live, status: "stale" })).toContain("rivals.staleLine");
  });
});
