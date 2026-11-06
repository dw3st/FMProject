// The screens that live inside the fixed frame (single page, `docs/superpowers/specs/2026-11-06-spa-shell-design.md`).
// Pure: no React, no DOM. Every other path (landing, login, new game, watch, fired, the live match page `/match-live`) is a page
// of its own and is reached by a normal page load.

export type AppScreen =
  | "dashboard" | "squad" | "player" | "formation" | "club" | "development" | "finances" | "staff"
  | "leagues" | "transfers" | "scout" | "stats" | "inbox" | "achievements" | "news" | "world"
  | "seasonEnd" | "matchRoom" | "comingSoon" | "matchPreview" | "matchResult" | "match";

/**
 * How the frame draws a screen: `full` with the top and bottom bars; `bare` on the whole screen (preview, result);
 * `match` on the whole screen with the live match in an iframe, which brings its own friends and chat.
 */
export type AppChrome = "full" | "bare" | "match";

export interface AppRoute {
  pattern: string;
  screen: AppScreen;
  /** Browser tab title (the old pages' `<title>`). */
  title: string;
  /** Absent = `full`. */
  chrome?: AppChrome;
}

export const APP_ROUTES: readonly AppRoute[] = [
  { pattern: "/dashboard", screen: "dashboard", title: "FMProject - Dashboard" },
  { pattern: "/squad/:league/:club", screen: "squad", title: "FMProject — Squad" },
  { pattern: "/player/:league/:club/:id", screen: "player", title: "FMProject — Player" },
  { pattern: "/formation", screen: "formation", title: "FMProject - Formation" },
  { pattern: "/club", screen: "club", title: "FMProject - Club" },
  { pattern: "/development", screen: "development", title: "FMProject - Player Development" },
  { pattern: "/finances", screen: "finances", title: "FMProject - Club Finances" },
  { pattern: "/staff", screen: "staff", title: "FMProject - Technical Staff" },
  { pattern: "/leagues", screen: "leagues", title: "FMProject — Leagues" },
  { pattern: "/leagues/:league", screen: "leagues", title: "FMProject — Leagues" },
  { pattern: "/transfers", screen: "transfers", title: "FMProject - Transfers" },
  { pattern: "/scout", screen: "scout", title: "FMProject - Scout" },
  { pattern: "/stats", screen: "stats", title: "FMProject - Stats" },
  { pattern: "/inbox", screen: "inbox", title: "FMProject - Inbox" },
  { pattern: "/achievements", screen: "achievements", title: "FMProject - Achievements" },
  { pattern: "/news", screen: "news", title: "FMProject - News" },
  { pattern: "/world", screen: "world", title: "FMProject - League" },
  { pattern: "/season-end", screen: "seasonEnd", title: "FMProject - Season End" },
  { pattern: "/match-room", screen: "matchRoom", title: "FMProject - Match Room" },
  { pattern: "/tactics", screen: "comingSoon", title: "FMProject - Coming Soon" },
  { pattern: "/match-preview", screen: "matchPreview", title: "FMProject - Match Preview", chrome: "bare" },
  { pattern: "/match-result", screen: "matchResult", title: "FMProject - Match Result", chrome: "bare" },
  { pattern: "/match", screen: "match", title: "FMProject - Match", chrome: "match" },
];

export interface RouteMatch {
  route: AppRoute;
  params: Record<string, string>;
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split("/").filter(Boolean);
  const got = pathname.split("/").filter(Boolean);
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const g = got[i]!;
    if (w.startsWith(":")) {
      let value: string;
      try { value = decodeURIComponent(g); } catch { return null; }
      params[w.slice(1)] = value;
    } else if (w !== g) {
      return null;
    }
  }
  return params;
}

/** The frame route of a path, or null when the path is a page of its own. */
export function matchAppPath(pathname: string): RouteMatch | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const route of APP_ROUTES) {
    const params = matchPattern(route.pattern, clean);
    if (params) return { route, params };
  }
  return null;
}

/**
 * The in-frame target of a link (`/squad/a/b?tab=x#y` → the same string), or null when the link leaves the frame:
 * another origin, a path that is not a frame route, or something that is not a URL.
 */
export function appTarget(href: string, origin: string): string | null {
  let url: URL;
  try { url = new URL(href, origin); } catch { return null; }
  if (url.origin !== origin) return null;
  if (!matchAppPath(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

export interface ClickLike {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface AnchorLike {
  href: string;
  target: string;
  hasDownload: boolean;
}

/** The in-frame target of a click on a link, or null when the browser should handle the click as always. */
export function interceptedTarget(e: ClickLike, a: AnchorLike, origin: string): string | null {
  if (e.defaultPrevented || e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if (a.hasDownload) return null;
  if (a.target && a.target !== "_self") return null;
  return appTarget(a.href, origin);
}
