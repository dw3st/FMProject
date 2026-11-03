/**
 * "Only you left" with the tab in the background: the tab title always, a browser notification when the manager turned
 * it on in Settings (the browser asks for permission once, on that click).
 */
const KEY = "fm.world.turnNotification";

export function turnNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function readTurnNotification(): boolean {
  if (!turnNotificationSupported() || Notification.permission !== "granted") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function writeTurnNotification(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // no storage: the choice lasts this page
  }
}

/** Turns it on, asking the browser first. False when the browser refused. */
export async function enableTurnNotification(): Promise<boolean> {
  if (!turnNotificationSupported()) return false;
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  const granted = permission === "granted";
  writeTurnNotification(granted);
  return granted;
}

export function disableTurnNotification(): void {
  writeTurnNotification(false);
}

let titleBefore: string | null = null;

function restoreTitle(): void {
  if (document.hidden || titleBefore === null) return;
  document.title = titleBefore;
  titleBefore = null;
  document.removeEventListener("visibilitychange", restoreTitle);
}

export function announceTurn(title: string, body: string): void {
  if (!document.hidden) return;
  if (titleBefore === null) {
    titleBefore = document.title;
    document.addEventListener("visibilitychange", restoreTitle);
  }
  document.title = `${title} · ${titleBefore}`;
  if (!readTurnNotification()) return;
  try {
    const n = new Notification(title, { body, tag: "fm-world-turn" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Android Chrome only allows notifications from a service worker: the title and the chime remain.
  }
}
