/**
 * The player's own "new visual" switch (Settings): on by default; off keeps the drawn turf to compare. Per browser,
 * read when a page loads (every screen is its own page).
 */
const KEY = "fm.visual.new";

export function readNewVisual(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeNewVisual(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // no storage: the default stays
  }
}

/** The match camera (art phase 5): the whole pitch (default) or zoomed in following the ball. */
const CAMERA_KEY = "fm.match.camera";
export type MatchCameraPref = "fixed" | "follow";

export function readMatchCamera(): MatchCameraPref {
  try {
    return localStorage.getItem(CAMERA_KEY) === "follow" ? "follow" : "fixed";
  } catch {
    return "fixed";
  }
}

export function writeMatchCamera(v: MatchCameraPref): void {
  try {
    localStorage.setItem(CAMERA_KEY, v);
  } catch {
    // no storage: the default stays
  }
}

/** The goal replay (art phase 5): on by default. */
const REPLAY_KEY = "fm.match.replay";

export function readGoalReplay(): boolean {
  try {
    return localStorage.getItem(REPLAY_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeGoalReplay(on: boolean): void {
  try {
    localStorage.setItem(REPLAY_KEY, on ? "1" : "0");
  } catch {
    // no storage: the default stays
  }
}
