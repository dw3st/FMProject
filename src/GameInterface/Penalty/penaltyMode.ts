// The manager's choice before a match (`MatchPreviewScreen`): kick and save his penalties in 2D, or automatic.
// Per browser; storage can fail (private window), then it is automatic.
export type PenaltyMode = "manual" | "auto";
const KEY = "fm.match.penaltyMode";

export function loadPenaltyMode(): PenaltyMode {
  try {
    return localStorage.getItem(KEY) === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

export function savePenaltyMode(mode: PenaltyMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable: the choice lasts this page only */
  }
}
