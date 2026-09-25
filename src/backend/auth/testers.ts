// Tester allowlist for tester-only features (e.g. the in-game Report button).
// Configured via REPORT_TESTERS, a comma-separated list of emails. Read from
// process.env at call time (not cached) so tests can toggle it freely.

/** Parses a raw REPORT_TESTERS value into a normalized (trimmed, lowercased) set of emails. */
export function parseTesterEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return new Set(emails);
}

/** True when `email` is listed in REPORT_TESTERS (case-insensitive, trimmed). */
export function isTesterEmail(email: string): boolean {
  const testers = parseTesterEmails(process.env.REPORT_TESTERS);
  return testers.has(email.trim().toLowerCase());
}
