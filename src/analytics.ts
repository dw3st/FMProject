// Best-effort product analytics. PostHog is initialised only when the backend
// reports it is configured (POSTHOG_KEY set). The library is loaded as PostHog's
// own script from its assets host, never bundled: the page server does not split
// dynamic imports, so `import("posthog-js")` put ~210 KB in every page (perf audit
// 4.41.29). Any failure here must never break the app.

interface PublicConfig {
  posthog?: { key: string; host: string } | null;
}

interface PostHogLike {
  init(key: string, opts: Record<string, unknown>): void;
  identify(id: string, props?: Record<string, unknown>): void;
  capture(event: string, props?: Record<string, unknown>): void;
  reset(): void;
}

let initPromise: Promise<PostHogLike | null> | null = null;

/** `https://us.i.posthog.com` → `https://us-assets.i.posthog.com` (where PostHog serves `array.js`). */
export function posthogAssetsHost(apiHost: string): string {
  return apiHost.replace(/^(https?:\/\/)([a-z]+)\.i\.posthog\.com/, "$1$2-assets.i.posthog.com");
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("posthog script"));
    document.head.appendChild(s);
  });
}

async function doInit(): Promise<PostHogLike | null> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return null;
    const cfg = (await res.json()) as PublicConfig;
    if (!cfg.posthog?.key) return null;
    await loadScript(`${posthogAssetsHost(cfg.posthog.host)}/static/array.js`);
    const posthog = (window as unknown as { posthog?: PostHogLike }).posthog;
    if (!posthog) return null;
    posthog.init(cfg.posthog.key, {
      api_host: cfg.posthog.host,
      capture_pageview: true,
      person_profiles: "identified_only",
    });
    return posthog;
  } catch {
    return null;
  }
}

function client(): Promise<PostHogLike | null> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

/** Initialise analytics once (idempotent). Resolves true when PostHog is enabled. */
export async function initAnalytics(): Promise<boolean> {
  return (await client()) !== null;
}

/** Tie the logged-in user (and their email) to their events. Safe to call on
 *  every authed page load — PostHog dedupes the same distinct id. */
export async function identifyUser(user: { id: string; email: string }): Promise<void> {
  try { (await client())?.identify(user.id, { email: user.email }); } catch { /* non-critical */ }
}

/** Record a product event (e.g. career_started, match_played, transfer_made).
 *  No-op when analytics is disabled; failures are swallowed. */
export async function capture(event: string, props?: Record<string, unknown>): Promise<void> {
  try { (await client())?.capture(event, props); } catch { /* non-critical */ }
}

/** Clear identity on logout so the next user on this browser isn't merged in. */
export async function resetAnalytics(): Promise<void> {
  try { (await client())?.reset(); } catch { /* non-critical */ }
}
