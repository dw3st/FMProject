import { useSyncExternalStore } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { interceptedTarget, matchAppPath } from "@/GameInterface/router/appRoutes";

// Navigation inside the fixed frame (`docs/superpowers/specs/2026-11-06-spa-shell-design.md`). On a page of its own
// (match, preview, landing…) the frame is not running and `navigate` is a normal page load, so every caller can use it.

export interface RouteLocation {
  pathname: string;
  search: string;
  /** Changes on every in-frame navigation (also to the same URL): the screen remounts on it. */
  key: number;
}

let frameActive = false;
let counter = 0;
let current: RouteLocation = read();
const listeners = new Set<() => void>();

function read(): RouteLocation {
  if (typeof window === "undefined") return { pathname: "/", search: "", key: counter };
  return { pathname: window.location.pathname, search: window.location.search, key: counter };
}

function emit() {
  current = read();
  for (const l of listeners) l();
}

/** Called once by the frame: from then on frame paths change without a page load. */
export function activateFrame(): () => void {
  frameActive = true;
  // The live match runs in an iframe of the frame (same origin): its navigations go to the frame.
  (window as unknown as FrameWindow).__fmNavigate = navigate;
  current = read();
  const onPop = () => { counter++; emit(); };
  window.addEventListener("popstate", onPop);
  return () => {
    frameActive = false;
    delete (window as unknown as FrameWindow).__fmNavigate;
    window.removeEventListener("popstate", onPop);
  };
}

interface FrameWindow {
  __fmNavigate?: (to: string, opts?: { replace?: boolean }) => void;
}

/** The frame's navigate when this page runs in an iframe of the frame (the live match), else null. */
function parentFrameNavigate(): FrameWindow["__fmNavigate"] | null {
  try {
    if (window.parent === window) return null;
    return (window.parent as unknown as FrameWindow).__fmNavigate ?? null;
  } catch {
    return null; // another origin
  }
}

export function isFrameActive(): boolean {
  return frameActive;
}

/** Go to `to` (path with search). Inside the frame a frame path changes in place; anything else loads the page. */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try { url = new URL(to, window.location.origin); } catch { return; }
  const internal = frameActive && url.origin === window.location.origin && !!matchAppPath(url.pathname);
  if (!internal) {
    const parentNav = frameActive ? null : parentFrameNavigate();
    if (parentNav) { parentNav(to, opts); return; }
    if (opts.replace) window.location.replace(to);
    else window.location.href = to;
    return;
  }
  const target = url.pathname + url.search + url.hash;
  if (opts.replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
  counter++;
  emit();
}

/**
 * onClick of a link inside something clickable (a table row): keeps the click from the row. React's stopPropagation
 * also stops the native event, so the frame's link listener never sees it and the page would reload (8.8.26).
 */
export function followLinkOnly(e: ReactMouseEvent<HTMLAnchorElement>): void {
  e.stopPropagation();
  if (!frameActive) return;
  const a = e.currentTarget;
  const to = interceptedTarget(e, { href: a.href, target: a.target, hasDownload: a.hasAttribute("download") }, window.location.origin);
  if (!to) return;
  e.preventDefault();
  navigate(to);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function snapshot(): RouteLocation {
  return current;
}

/** The current location; re-renders on every in-frame navigation. */
export function useRoute(): RouteLocation {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
