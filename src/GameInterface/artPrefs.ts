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

/** Graphics quality of the live match (art phase 8): automatic (default), high or light. */
const QUALITY_KEY = "fm.visual.quality";
export type QualityPref = "auto" | "high" | "light";

export function readQuality(): QualityPref {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === "high" || v === "light" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeQuality(v: QualityPref): void {
  try {
    localStorage.setItem(QUALITY_KEY, v);
  } catch {
    // no storage: the default stays
  }
}

/** Proportions of the players in the live match (art phase 9): the current sprites or the slimmer "realistic" ones. */
const PLAYER_LOOK_KEY = "fm.visual.players";
export type PlayerLookPref = "current" | "real";

export function readPlayerLook(): PlayerLookPref {
  try {
    return localStorage.getItem(PLAYER_LOOK_KEY) === "real" ? "real" : "current";
  } catch {
    return "current";
  }
}

export function writePlayerLook(v: PlayerLookPref): void {
  try {
    localStorage.setItem(PLAYER_LOOK_KEY, v);
  } catch {
    // no storage: the default stays
  }
}
