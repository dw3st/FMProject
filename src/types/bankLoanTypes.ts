/** A bank loan of the human club (`.claude/rules/game/finances.md` → "Empréstimo do banco"). */
export interface BankLoan {
  /** What the club received, EUR. */
  principal: number;
  /** Principal + interest, EUR. */
  total: number;
  /** Fixed weekly payment, EUR (the last one pays what is left). */
  weekly: number;
  /** Still to pay, EUR. */
  remaining: number;
  /** "YYYY-MM-DD": the first payment is on a later Monday. */
  takenOn: string;
  seasons: number;
  /** The Monday of the last payment: a replayed day does not take it twice. */
  lastPaid?: string;
}
