/** Where the live match (in the frame) puts its friends' radio: a slot in the footer (`StatusBar`). */
export const MATCH_RADIO_SLOT = "fm-match-radio";

/**
 * The game frame's footer slot for the live match's friends' radio, when the match page runs inside the frame (8.8.10);
 * null when the match page is on its own (preference "Match inside the game" off) or in a broadcast window.
 */
export function frameRadioSlot(): HTMLElement | null {
  try {
    if (window.parent === window) return null;
    return window.parent.document.getElementById(MATCH_RADIO_SLOT);
  } catch {
    return null;
  }
}

/** The match page asks the frame to open a chat (its own chat windows stay closed inside the frame). */
export const OPEN_CHAT_MESSAGE = "fm-open-chat";
