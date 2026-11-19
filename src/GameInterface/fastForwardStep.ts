/**
 * The client side of "Avançar até o próximo jogo": the fast-forward asks the server for ONE day at a time, so a Cancel
 * stops after the day that is running (tester report: a press by mistake ran to the next match). The server still
 * decides every stop (match day, sacking, offers, renewal, press invite: `runAdvanceBatch`); this only reads its answer.
 */

/** One day per request: Cancel waits at most for the day in progress. */
export const FAST_FORWARD_STEP_DAYS = 1;

export interface FastForwardReply {
  done?: boolean;
  daysAdvanced?: number;
  error?: string;
  sacked?: boolean;
  renewalOffer?: boolean;
}

export type FastForwardAction = "fired" | "renewal" | "error" | "done" | "cancelled" | "continue";

/** What the loop does after one reply. `cancelled` = the manager pressed Cancel during the day that just ran. */
export function nextFastForwardAction(reply: FastForwardReply, httpOk: boolean, cancelRequested: boolean): FastForwardAction {
  if (reply.sacked) return "fired";
  if (reply.error === "renewalPending" || reply.renewalOffer) return "renewal";
  if (!httpOk || reply.error) return "error";
  if (reply.done) return "done";
  // No day advanced without reaching the target: nothing more to do (never spin).
  if (cancelRequested || (reply.daysAdvanced ?? 0) === 0) return "cancelled";
  return "continue";
}
