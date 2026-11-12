/**
 * The game as an app (10.6): the manifest link of every page, the browser's install dialog, and the full-screen
 * switch of a phone that plays in the browser. Nothing here is needed to play; every call is safe where the
 * browser has no such thing.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { APP_THEME_COLOR, installState, isIosDevice, MANIFEST_PATH, type InstallState } from "@/Domain/pwa/manifest";

/** Chrome's install event (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

function addHead(tag: "link" | "meta", attrs: Record<string, string>): void {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
}

/** Once per page: the manifest and the colours a phone paints its bars with; starts listening for the install dialog. */
export function installAppHead(): void {
  if (typeof document === "undefined" || document.querySelector('link[rel="manifest"]')) return;
  // The match page inside the frame is not an app of its own.
  if (window.parent !== window) return;
  addHead("link", { rel: "manifest", href: MANIFEST_PATH });
  addHead("meta", { name: "theme-color", content: APP_THEME_COLOR });
  addHead("meta", { name: "mobile-web-app-capable", content: "yes" });
  addHead("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
  addHead("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (installedNow) return true;
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  return mq("(display-mode: fullscreen)") && !document.fullscreenElement
    || mq("(display-mode: standalone)")
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function currentState(): InstallState {
  if (typeof window === "undefined") return "none";
  return installState({
    standalone: isStandalone(),
    hasPrompt: deferred !== null,
    ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** The install block: its state and the action that opens the browser's dialog (only in the "prompt" state). */
export function useAppInstall(): { state: InstallState; install: () => Promise<void> } {
  const state = useSyncExternalStore(subscribe, currentState, () => "none" as InstallState);
  const install = useCallback(async () => {
    const ev = deferred;
    if (!ev) return;
    await ev.prompt();
    const choice = await ev.userChoice.catch(() => null);
    // The event serves one dialog; a dismissed one comes back only when the browser fires it again.
    deferred = null;
    if (choice?.outcome === "accepted") installedNow = true;
    notify();
  }, []);
  return { state, install };
}

type LockableOrientation = ScreenOrientation & { lock?: (o: "landscape") => Promise<void> };

/** Full screen in the browser tab; on a phone it also turns the game on its side. False where the browser has none. */
export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const supported = typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function";
  const [active, setActive] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = useCallback(() => {
    if (!supported) return;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
    void document.documentElement.requestFullscreen({ navigationUI: "hide" })
      .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape"))
      .catch(() => {});
  }, [supported]);
  return { supported, active, toggle };
}
