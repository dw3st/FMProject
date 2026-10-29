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
