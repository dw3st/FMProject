// Best-effort product analytics. PostHog is initialised only when the backend
// reports it is configured (POSTHOG_KEY set). posthog-js is lazy-loaded so it
// never ships in the initial bundle when analytics is disabled, and any failure
// here must never break the app.

interface PublicConfig {
  posthog?: { key: string; host: string } | null;
}

let initPromise: Promise<boolean> | null = null;

async function doInit(): Promise<boolean> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return false;

    const cfg = (await res.json()) as PublicConfig;
    if (!cfg.posthog?.key) return false;

    const { default: posthog } = await import("posthog-js");
    posthog.init(cfg.posthog.key, {
      api_host: cfg.posthog.host,
      capture_pageview: true,
      person_profiles: "identified_only",
    });
    return true;
  } catch {
    return false;
  }
}

/** Initialise analytics once (idempotent). Resolves true when PostHog is enabled. */
export function initAnalytics(): Promise<boolean> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

/** Tie the logged-in user (and their email) to their events. Safe to call on
 *  every authed page load — PostHog dedupes the same distinct id. */
export async function identifyUser(user: { id: string; email: string }): Promise<void> {
  if (!(await initAnalytics())) return;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.identify(user.id, { email: user.email });
  } catch {
    // non-critical
  }
}

/** Record a product event (e.g. career_started, match_played, transfer_made).
 *  No-op when analytics is disabled; failures are swallowed. */
export async function capture(event: string, props?: Record<string, unknown>): Promise<void> {
  if (!(await initAnalytics())) return;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.capture(event, props);
  } catch {
    // non-critical
  }
}

/** Clear identity on logout so the next user on this browser isn't merged in. */
export async function resetAnalytics(): Promise<void> {
  if (!(await initAnalytics())) return;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.reset();
  } catch {
    // non-critical
  }
}
