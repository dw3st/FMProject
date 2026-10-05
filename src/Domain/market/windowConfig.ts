/** Transfer windows (`.claude/rules/game/transfer-windows.md`, Etapa 25). Every tunable number. */
export const WINDOWS = {
  /** Pre-season window opens this many days after the previous season's end. */
  PRE_OPEN_AFTER_END: 14,
  /** ...and closes this many days after the season starts. */
  PRE_CLOSE_AFTER_START: 16,
  /** Mid-season window length (days, inclusive of the first day). */
  MID_LENGTH: 31,
  /** Mid point after this day of the month → the window starts on the next month's 1st. */
  MID_LATE_DAY: 15,
  /** A new career's club may trade this many days from the career start, window or not (D1). */
  ARRIVAL_GRACE_DAYS: 30,
  /** "Window closing" news this many days before the close. */
  CLOSING_NOTICE_DAYS: 3,
  /** Dashboard attention when the window closes in this many days or fewer. */
  ATTENTION_DAYS: 7,

  /** AI market: attempts per open day over the whole world, scaled by the share of clubs whose window is open. */
  ATTEMPTS_PER_OPEN_DAY: 35,
  /** ...× this in the last DEADLINE_DAYS of a window (deadline day rush). */
  DEADLINE_MULT: 1.5,
  DEADLINE_DAYS: 5,
} as const;
