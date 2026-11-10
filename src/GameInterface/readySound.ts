import { readChatSound, readMatchVolume, readReadySound } from "@/GameInterface/artPrefs";

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
  const asked = Date.now();
  void c.resume().then(() => {
    // Before any click the promise only resolves on that click: a chime that late means nothing.
    if (c.state !== "running" || Date.now() - asked > 1000) return;
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

/**
 * A synthesized "uh-oh" in the spirit of the old messengers (not a recording): two voice-like notes stepping down,
 * a buzzy wave through two vowel formants. Same gesture rule as the ready chime.
 */
const UH_OH: { from: number; to: number; at: number; len: number; formants: [number, number] }[] = [
  { from: 560, to: 600, at: 0, len: 0.14, formants: [650, 1100] },
  { from: 455, to: 430, at: 0.19, len: 0.26, formants: [500, 900] },
];

export function playChatSound(force = false): void {
  if (!force && !readChatSound()) return;
  const c = context();
  if (!c) return;
  const asked = Date.now();
  void c.resume().then(() => {
    if (c.state !== "running" || Date.now() - asked > 1000) return;
    const volume = 0.45 * readMatchVolume();
    for (const n of UH_OH) {
      const t = c.currentTime + n.at;
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(n.from, t);
      osc.frequency.linearRampToValueAtTime(n.to, t + n.len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume, t + 0.02);
      g.gain.setValueAtTime(volume, t + n.len * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n.len);
      for (const f of n.formants) {
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = f;
        bp.Q.value = 6;
        osc.connect(bp).connect(g);
      }
      g.connect(c.destination);
      osc.start(t);
      osc.stop(t + n.len + 0.02);
    }
  }).catch(() => { /* no sound allowed yet */ });
}
