const KNOWN = ["dayClosed", "notYourMatch", "seatOpponent", "noWinner"] as const;

/** i18n key for an error code of the group-advance routes (unknown codes fall back to `generic`). */
export function groupAdvanceErrorKey(code: string): string {
  return `world.advance.error.${(KNOWN as readonly string[]).includes(code) ? code : "generic"}`;
}
