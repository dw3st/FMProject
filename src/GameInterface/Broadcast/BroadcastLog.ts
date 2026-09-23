/**
 * Broadcast commentary line — single “live” sentence for UI (e.g. match ticker).
 *
 * Import BroadcastSubscriber once to fill this from game-bus events.
 */

let currentLine = '';
const listeners = new Set<(line: string) => void>();

function notify(): void {
  listeners.forEach(fn => fn(currentLine));
}

export function setBroadcastLine(message: string): void {
  currentLine = message;
  notify();
}

export function clearBroadcastLine(): void {
  currentLine = '';
  notify();
}

export function getBroadcastLine(): string {
  return currentLine;
}

/** Subscribe to the live line. Returns unsubscribe. */
export function onBroadcastLine(fn: (line: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
