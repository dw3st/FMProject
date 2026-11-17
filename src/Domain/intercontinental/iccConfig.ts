import type { IccConfed, IccMatchName } from "@/types/calendarTypes";

/** Intercontinental Cup (`.claude/rules/game/intercontinental.md`): every constant in one place. */
export const ICC_SLUG = "icc";

export const ICC = {
  /** Generated the first day of December (month 12) of each year. */
  MONTH: 12,
  /** Prize money in EUR (human: ledger `prize`; AI: `aiBudgetWithPrize`). */
  PRIZE: {
    PARTICIPATION: 10e6,
    WIN: 15e6,
    TITLE: 25e6,
  },
  /** Manager ranking points for the title (kind `continental`, competition `icc`). */
  MANAGER_POINTS: 100,
  /** Match dates: Wednesdays and Saturdays (UTC day 3 and 6). */
  WEEKDAYS: [3, 6] as readonly number[],
  /** Minimum days between two dates of the cup (a club can play matches 1, 2, 4 and 5). */
  MIN_GAP_DAYS: 2,
  /** How many dates the bracket needs (matches 1 and 3 share the first one). */
  DATES: 4,
} as const;

/** The bracket, in play order. A side is a confederation's entrant or the winner of an earlier match. */
export type IccSide = { confed: IccConfed } | { winnerOf: 1 | 2 | 3 | 4 };

export interface IccBracketSlot {
  n: 1 | 2 | 3 | 4 | 5;
  name: IccMatchName;
  home: IccSide;
  away: IccSide;
  /** Index into the edition's dates (0..3). */
  dateIndex: number;
}

export const ICC_BRACKET: readonly IccBracketSlot[] = [
  { n: 1, name: "afc_ofc", home: { confed: "OFC" }, away: { confed: "AFC" }, dateIndex: 0 },
  { n: 3, name: "americas", home: { confed: "CONCACAF" }, away: { confed: "CONMEBOL" }, dateIndex: 0 },
  { n: 2, name: "apac", home: { winnerOf: 1 }, away: { confed: "CAF" }, dateIndex: 1 },
  { n: 4, name: "challenger", home: { winnerOf: 2 }, away: { winnerOf: 3 }, dateIndex: 2 },
  { n: 5, name: "final", home: { winnerOf: 4 }, away: { confed: "UEFA" }, dateIndex: 3 },
];

/** Entrant picking order: the two continental champions first, so they never lose their slot to a league. */
export const ICC_CONFEDS: readonly IccConfed[] = ["UEFA", "CONMEBOL", "AFC", "CAF", "CONCACAF", "OFC"];
