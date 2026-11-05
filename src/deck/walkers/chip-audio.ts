/**
 * Handheld-style chip audio for the walkers game, synthesised with the Web
 * Audio API: pulse waves at 12.5, 25 and 50% duty (built as periodic waves),
 * a triangle bass and a noise channel from a 15-bit shift register. No sample
 * files. The music is scheduled a little ahead of the audio clock from a
 * timer, so a busy main thread cannot make it stutter.
 *
 * The context is only created by `start()`, which callers make from a user
 * gesture. `stop()` stops every node, clears the timer and closes the
 * context; call it on exit, on unmount and when the tab hides.
 */
import {
  SFX,
  STEP_SECONDS,
  hertz,
  songStep,
  type Duty,
  type NoteEvent,
  type SfxName,
} from "./chip-tune";

/** The parts of `AudioContext` the engine uses, so tests can pass a fake. */
export interface ChipContext {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly sampleRate: number;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBufferSource(): AudioBufferSourceNode;
  createBuffer(channels: number, length: number, rate: number): AudioBuffer;
  createPeriodicWave(real: Float32Array, imag: Float32Array): PeriodicWave;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** The master level: deliberately quiet. */
export const MASTER_VOLUME = 0.07;
/** How far ahead of the audio clock music is scheduled, in seconds. */
export const LOOKAHEAD = 0.12;
/** How often the scheduler wakes, in milliseconds. */
export const WAKE_MS = 25;
const CHANNEL_LEVEL = { lead: 0.5, harmony: 0.32, bass: 0.7, noise: 0.28 };
const SFX_LEVEL = 0.55;

/** Fourier terms of a pulse wave with the given duty cycle. */
export function pulseTerms(duty: number, harmonics = 32) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++)
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return { real, imag };
}

/** One second of 15-bit LFSR noise, the classic handheld noise channel. */
export function lfsrNoise(length: number): Float32Array {
  const out = new Float32Array(length);
  let reg = 0x7fff;
  for (let i = 0; i < length; i++) {
    const bit = (reg ^ (reg >> 1)) & 1;
    reg = (reg >> 1) | (bit << 14);
    out[i] = reg & 1 ? 0.8 : -0.8;
  }
  return out;
}

type Timers = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
};

export class ChipAudio {
  private ctx?: ChipContext;
  private master?: GainNode;
  private waves = new Map<number, PeriodicWave>();
  private noise?: AudioBuffer;
  private live = new Set<AudioScheduledSourceNode>();
  private timer: unknown;
  private nextStep = 0;
  private nextTime = 0;
  /** True while the music loop is scheduled. */
  playing = false;

  constructor(
    private make: () => ChipContext | undefined = defaultContext,
    private timers: Timers = {
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (id) =>
        globalThis.clearInterval(id as ReturnType<typeof setInterval>),
    },
  ) {}

  /** Nodes currently scheduled or sounding: for tests and for `stop()`. */
  get sounding() {
    return this.live.size;
  }
  get started() {
    return !!this.ctx;
  }

  /** Create (or wake) the context. Call from a user gesture. */
  start(): boolean {
    if (!this.ctx) {
      const ctx = this.make();
      if (!ctx) return false;
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(ctx.destination);
    }
    void this.ctx.resume().catch(() => {});
    return true;
  }

  /** Start the music loop from its first bar. */
  music() {
    if (!this.start() || !this.ctx) return;
    this.stopMusic();
    this.playing = true;
    this.nextStep = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.schedule();
    this.timer = this.timers.setInterval(() => this.schedule(), WAKE_MS);
  }

  /** Stop the loop; effects already playing finish. */
  stopMusic() {
    this.playing = false;
    if (this.timer !== undefined) this.timers.clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Schedule every step that starts before the clock plus the lookahead. */
  schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    // After a stall (a hidden tab, a long frame) skip ahead, never burst.
    if (this.nextTime < ctx.currentTime - LOOKAHEAD) {
      const behind = Math.ceil(
        (ctx.currentTime - this.nextTime) / STEP_SECONDS,
      );
      this.nextStep += behind;
      this.nextTime += behind * STEP_SECONDS;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const n of songStep(this.nextStep)) this.note(n, this.nextTime);
      this.nextStep += 1;
      this.nextTime += STEP_SECONDS;
    }
  }

  /** Play a sound effect now. */
  sfx(name: SfxName) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    for (const part of SFX[name])
      for (const n of part.notes) {
        const at = t + n.at,
          level = (n.level ?? 1) * SFX_LEVEL;
        if (part.voice === "noise") this.hiss(at, n.note, n.length, level);
        else
          this.tone(
            at,
            hertz(n.note),
            n.length,
            level,
            part.voice === "pulse" ? (part.duty ?? 0.5) : undefined,
          );
      }
  }

  /** Stop every node, the loop and the context. Safe to call twice. */
  stop() {
    this.stopMusic();
    for (const node of this.live) {
      try {
        node.stop();
      } catch {
        /* Already stopped. */
      }
      node.disconnect();
    }
    this.live.clear();
    const ctx = this.ctx;
    this.ctx = undefined;
    this.master = undefined;
    this.waves.clear();
    this.noise = undefined;
    if (ctx) void ctx.close().catch(() => {});
  }

  private note(n: NoteEvent, at: number) {
    const length = n.steps * STEP_SECONDS * 0.92;
    const level = n.level * CHANNEL_LEVEL[n.channel];
    if (n.channel === "noise") return this.hiss(at, n.note, length, level);
    const duty: Duty | undefined =
      n.channel === "lead" ? 0.25 : n.channel === "harmony" ? 0.125 : undefined;
    this.tone(at, hertz(n.note), length, level, duty);
  }

  private envelope(at: number, length: number, level: number) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    // A stepped decay, like a handheld's volume envelope, then silence.
    gain.gain.setValueAtTime(level * 0.7, at + length * 0.5);
    gain.gain.linearRampToValueAtTime(0, at + length);
    gain.connect(this.master!);
    return gain;
  }

  private track(node: AudioScheduledSourceNode, gain: GainNode) {
    this.live.add(node);
    node.onended = () => {
      this.live.delete(node);
      node.disconnect();
      gain.disconnect();
    };
  }

  private tone(
    at: number,
    frequency: number,
    length: number,
    level: number,
    duty?: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    if (duty === undefined) osc.type = "triangle";
    else osc.setPeriodicWave(this.pulse(duty));
    osc.frequency.setValueAtTime(frequency, at);
    const gain = this.envelope(at, length, level);
    osc.connect(gain);
    this.track(osc, gain);
    osc.start(at);
    osc.stop(at + length + 0.01);
  }

  private hiss(at: number, rate: number, length: number, level: number) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer();
    source.playbackRate.setValueAtTime(rate, at);
    const gain = this.envelope(at, length, level);
    source.connect(gain);
    this.track(source, gain);
    source.start(at);
    source.stop(at + length + 0.01);
  }

  private pulse(duty: number) {
    let wave = this.waves.get(duty);
    if (!wave) {
      const { real, imag } = pulseTerms(duty);
      wave = this.ctx!.createPeriodicWave(real, imag);
      this.waves.set(duty, wave);
    }
    return wave;
  }

  private noiseBuffer() {
    if (!this.noise) {
      const ctx = this.ctx!;
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      buffer.getChannelData(0).set(lfsrNoise(ctx.sampleRate));
      this.noise = buffer;
    }
    return this.noise;
  }
}

function defaultContext(): ChipContext | undefined {
  const Ctor =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  return Ctor ? (new Ctor() as unknown as ChipContext) : undefined;
}

const MUTE_KEY = "genobi.walkers.muted";

/** The remembered mute setting; unmuted by default, at a low volume. */
export function rememberedMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function rememberMute(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* Private windows forget it. */
  }
}
