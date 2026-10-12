import { describe, expect, test } from "bun:test";
import { NO_PANEL_PAUSE, manualToggle, openPanelPause, pausedAfterClose } from "@/GameInterface/panelPause";

describe("panel pause", () => {
  test("a match paused by hand (goal) stays paused when the panel closes", () => {
    const pp = openPanelPause(NO_PANEL_PAUSE, false, true);
    expect(pausedAfterClose(pp, true)).toBe(true);
  });

  test("a running match paused by the panel resumes on close", () => {
    const pp = openPanelPause(NO_PANEL_PAUSE, false, false);
    expect(pausedAfterClose(pp, true)).toBe(false);
  });

  test("an injury reopening an open panel keeps who paused it", () => {
    const pp = openPanelPause(openPanelPause(NO_PANEL_PAUSE, false, true), true, true);
    expect(pausedAfterClose(pp, true)).toBe(true);
  });

  test("Pause clicked with the panel open: closing does not resume", () => {
    let pp = openPanelPause(NO_PANEL_PAUSE, false, false);
    pp = manualToggle(); // Play
    pp = manualToggle(); // Pause again
    expect(pausedAfterClose(pp, true)).toBe(true);
  });
});
