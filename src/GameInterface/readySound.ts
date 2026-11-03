import { readMatchVolume, readReadySound } from "@/GameInterface/artPrefs";

/**
 * A short two-note chime: another manager is ready. Works with the tab in the background; the browser only lets a page
 * make sound after a click on it (or on the previous page of the site), otherwise it stays silent.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  return ctx;
}

/** Listens for the first click or key, the gesture the browser asks for. */
export function armReadySound(): () => void {
  const wake = () => { void context()?.resume(); };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);
  return () => {
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
}

export function playReadySound(): void {
  if (!readReadySound()) return;
  const c = context();
  if (!c) return;
  void c.resume().then(() => {
    if (c.state !== "running") return;
    const volume = 0.5 * readMatchVolume();
    [[659.25, 0], [880, 0.14]].forEach(([freq, delay]) => {
      const t = c.currentTime + delay!;
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq!;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }).catch(() => { /* no sound allowed yet */ });
}
