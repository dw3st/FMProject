import { gameArtUrl } from "@/Domain/art/paintedFaces";

/** Recorded sounds (Stable Audio Open on the local ComfyUI, `data_process/assets/audio`); missing = synthesised. */
const SAMPLES = ["crowd-bed", "crowd-rise", "goal-roar", "near-miss", "kick", "net", "whistle-short"] as const;
type Sample = (typeof SAMPLES)[number];

/**
 * Match sound (leva 3), recorded samples with a synthesised fallback (Web Audio): a crowd bed that swells near the goals, the referee's whistle,
 * the strike of the ball, the net, the roar of a goal and the "ooh" of a near miss. No sound files. The context only
 * starts after a click on the page (browser rule) and is suspended while the tab is hidden.
 */
import { cueAllowed, type SoundCue } from "@/Domain/match/matchSound";

export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundCue, number>();
  private volume: number;
  private enabled: boolean;
  private excitement = 0;
  private samples = new Map<Sample, AudioBuffer>();
  private bedSource: AudioBufferSourceNode | null = null;
  private lastRise = -100;
  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else if (this.enabled) void this.ctx.resume();
  };
  private onGesture = () => this.start();

  constructor(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = volume;
    window.addEventListener("pointerdown", this.onGesture);
    window.addEventListener("keydown", this.onGesture);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Creates (or resumes) the context: must run from a user gesture the first time. */
  start(): void {
    if (!this.enabled) return;
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    // Two seconds of white noise, reused by every noisy sound.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startBed();
    void this.loadSamples();
  }

  private async loadSamples(): Promise<void> {
    await Promise.all(SAMPLES.map(async (name) => {
      try {
        const res = await fetch(gameArtUrl(`audio/${name}.mp3`));
        if (!res.ok || !this.ctx) return;
        this.samples.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // keeps the synthesised sound
      }
    }));
    // The recorded crowd replaces the synthesised murmur.
    const bed = this.samples.get("crowd-bed");
    if (bed && this.ctx && this.bed) {
      this.bedSource?.stop();
      const src = this.ctx.createBufferSource();
      src.buffer = bed;
      src.loop = true;
      src.connect(this.bed);
      src.start();
      this.bedSource = src;
    }
  }

  /** Plays a recorded sound; false when it is not loaded. */
  private sample(name: Sample, gain: number, rate = 1, offset = 0): boolean {
    const buf = this.samples.get(name);
    if (!buf || !this.ctx || !this.master) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(this.ctx.currentTime, offset);
    return true;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) void this.ctx?.suspend();
    else if (this.ctx) void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Crowd level 0..1 (the ball near a goal), eased. */
  setExcitement(x: number): void {
    const before = this.excitement;
    this.excitement = x;
    if (!this.bed || !this.ctx) return;
    const recorded = this.bedSource !== null;
    this.bed.gain.setTargetAtTime(recorded ? 0.25 + 0.35 * x : 0.07 + 0.2 * x, this.ctx.currentTime, 0.6);
    // The ball comes close to a goal: the stands rise (not more than once every 8 s).
    if (recorded && this.enabled && before < 0.6 && x >= 0.6 && this.ctx.currentTime - this.lastRise > 8) {
      this.lastRise = this.ctx.currentTime;
      this.sample("crowd-rise", 0.35);
    }
  }

  dispose(): void {
    window.removeEventListener("pointerdown", this.onGesture);
    window.removeEventListener("keydown", this.onGesture);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.bedSource = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  play(cue: SoundCue, strength = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== "running" || !cueAllowed(this.last, cue, ctx.currentTime)) return;
    switch (cue) {
      case "kick": if (!this.sample("kick", 0.7 * strength, 0.95 + Math.random() * 0.1)) this.thump(0.55 * strength, 130); break;
      case "pass": if (!this.sample("kick", 0.28, 1.15 + Math.random() * 0.1)) this.thump(0.22, 160); break;
      case "save": this.thump(0.4, 90); this.swell(0.25, 500, 0.9); break;
      case "whistleShort": if (!this.sample("whistle-short", 0.5)) this.whistle([0.22]); break;
      case "whistleLong": this.whistle([0.65]); break;
      case "card": this.whistle([0.2, 0.55]); break;
      case "whistleEnd": this.whistle([0.3, 0.3, 0.9]); break;
      case "net": if (!this.sample("net", 0.6)) this.burst(0.35, 1800, 0.3); break;
      case "nearMiss": if (!this.sample("near-miss", 0.55)) this.swell(0.45 + 0.3 * this.excitement, 420, 1.4); break;
      case "goal":
        if (this.sample("goal-roar", 0.9)) this.sample("net", 0.6);
        else this.roar();
        break;
    }
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noise) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  /** The murmur of the stands: band-passed noise with a slow wave on top. */
  private startBed(): void {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    if (!src || !this.master) return;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 650;
    band.Q.value = 0.6;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 2200;
    const wave = ctx.createGain();
    wave.gain.value = 0.85;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain).connect(wave.gain);
    this.bed = ctx.createGain();
    this.bed.gain.value = 0.07;
    src.connect(band).connect(low).connect(wave).connect(this.bed).connect(this.master);
    src.start();
    lfo.start();
  }

  /** The strike of the ball: a falling low sine and a short click. */
  private thump(gain: number, freq: number): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.13);
    this.burst(gain * 0.25, 2500, 0.03);
  }

  /** A short band of noise (net, click). */
  private burst(gain: number, highpass: number, seconds: number): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = this.noiseSource();
    if (!src) return;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = highpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(hp).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }

  /** The crowd rising and falling ("ooh"). */
  private swell(gain: number, freq: number, seconds: number): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = this.noiseSource();
    if (!src) return;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(freq, t);
    band.frequency.linearRampToValueAtTime(freq * 0.7, t + seconds);
    band.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + seconds * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(band).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + seconds + 0.05);
  }

  /** A goal: the stands explode and stay loud for a few seconds, with voices under it. */
  private roar(): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = this.noiseSource();
    if (!src) return;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 850;
    band.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.35);
    g.gain.setTargetAtTime(0.35, t + 1.2, 1.2);
    g.gain.setTargetAtTime(0.0001, t + 4, 0.8);
    src.connect(band).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + 7);
    // Voices: a few detuned low saws, filtered, under the noise.
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 900;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.exponentialRampToValueAtTime(0.12, t + 0.4);
    vg.gain.setTargetAtTime(0.0001, t + 3, 0.7);
    low.connect(vg).connect(this.master!);
    for (const f of [190, 221, 247, 262]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 0.9, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.5);
      o.detune.value = (Math.random() - 0.5) * 30;
      o.connect(low);
      o.start(t);
      o.stop(t + 6);
    }
    this.burst(0.3, 1800, 0.3);
  }

  /** A pea whistle: two close tones trilled fast, one blast per entry (seconds). */
  private whistle(blasts: number[]): void {
    const ctx = this.ctx!;
    let t = ctx.currentTime;
    for (const len of blasts) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + len - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      g.connect(this.master!);
      const trill = ctx.createOscillator();
      trill.frequency.value = 32;
      const depth = ctx.createGain();
      depth.gain.value = 140;
      trill.connect(depth);
      for (const f of [2850, 3120]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        depth.connect(o.frequency);
        o.connect(g);
        o.start(t);
        o.stop(t + len + 0.02);
      }
      trill.start(t);
      trill.stop(t + len + 0.02);
      t += len + 0.12;
    }
  }
}
