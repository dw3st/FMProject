/**
 * Who owns the pause while the substitution panel is open.
 *
 * Opening the panel pauses the match; closing it resumes play only when it was the panel that paused
 * it. A match the user had paused by hand (e.g. right after a goal, to make a change) stays paused
 * when the panel closes, and any Play/Pause click while the panel is open hands the pause back to the user.
 */
export interface PanelPause {
  /** True when closing the panel must resume play (the panel paused a running match). */
  resumeOnClose: boolean;
}

export const NO_PANEL_PAUSE: PanelPause = { resumeOnClose: false };

/** Panel opened (by the user or by an injury with no replacement): the match pauses. */
export function openPanelPause(current: PanelPause, panelOpen: boolean, paused: boolean): PanelPause {
  if (panelOpen) return current; // already open: keep who paused it
  return { resumeOnClose: !paused };
}

/** Panel closed: whether the match is paused afterwards. */
export function pausedAfterClose(pp: PanelPause, paused: boolean): boolean {
  return pp.resumeOnClose ? false : paused;
}

/** A Play/Pause click: from then on the pause is the user's. */
export function manualToggle(): PanelPause {
  return NO_PANEL_PAUSE;
}
