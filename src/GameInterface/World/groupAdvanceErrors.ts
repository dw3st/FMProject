import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";

/** Error codes the group-advance routes (and the client) can produce; each has `world.advance.errors.<code>`. */
export const GROUP_ADVANCE_ERROR_CODES = [
  "dayClosed", "notYourMatch", "seatOpponent", "noWinner", "notMulti", "lobby", "groupAdvance", "tooLarge",
  "invalidBody", "invalidDecision", "invalidRecording", "invalidDate", "network", "generic", "dayFailed", "noError",
] as const;
export type GroupAdvanceErrorCode = (typeof GROUP_ADVANCE_ERROR_CODES)[number];

const KNOWN = GROUP_ADVANCE_ERROR_CODES;
const TERMINAL_CODES = ["dayClosed", "notYourMatch", "seatOpponent", "noWinner"] as const;

/** i18n key for an error code of the group-advance routes (unknown codes fall back to `generic`). */
export function groupAdvanceErrorKey(code: string): string {
  return `world.advance.errors.${(KNOWN as readonly string[]).includes(code) ? code : "generic"}`;
}

const TERMINAL = new Set<string>(TERMINAL_CODES);

/**
 * Where the match screen goes when its live recording was refused. `dayClosed`: the deadline ran the day meanwhile
 * (the assistant simulated the game), so the official result of `date`, without an error.
 */
export function liveSendFailureUrl(code: string, date: string): string {
  return code === "dayClosed"
    ? `/match-result?date=${encodeURIComponent(date)}`
    : `/match-result?error=${encodeURIComponent(code)}`;
}

/** Terminal errors never get better by trying again. */
export function isTerminalGroupError(code: string): boolean {
  return TERMINAL.has(code);
}

type Failure = { ok: false; status: number; error: string };
type SendResult = { ok: true } | Failure;

/** Transient = network failure (status 0) or a 5xx: worth retrying. */
export function isTransientFailure(r: Failure): boolean {
  return r.status === 0 || r.status >= 500;
}

/** Sends with up to `attempts` tries (short wait between) while the failure is transient. */
export async function sendWithRetry(
  send: () => Promise<SendResult>,
  attempts = 3,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SendResult> {
  let last: SendResult = await send();
  for (let i = 1; i < attempts && !last.ok && isTransientFailure(last); i++) {
    await wait(500 * i);
    last = await send();
  }
  return last;
}

export interface StoredRecording {
  date: string;
  fixtureId: string;
  recording: PlayedMatchRecording;
}

const key = (saveId: string) => `fm.pendingRecording.${saveId}`;

/** The recording that failed to send, kept so "Try again" on the result screen can resend it. */
export function storePendingRecording(saveId: string, value: StoredRecording): void {
  try {
    sessionStorage.setItem(key(saveId), JSON.stringify(value));
  } catch {
    // storage unavailable: the retry button simply won't have a recording
  }
}

export function loadPendingRecording(saveId: string): StoredRecording | null {
  try {
    const raw = sessionStorage.getItem(key(saveId));
    return raw ? (JSON.parse(raw) as StoredRecording) : null;
  } catch {
    return null;
  }
}

export function clearPendingRecording(saveId: string): void {
  try {
    sessionStorage.removeItem(key(saveId));
  } catch {
    // ignore
  }
}
