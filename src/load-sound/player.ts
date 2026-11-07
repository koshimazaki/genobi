/**
 * Plays a loading cue with the Web Audio API. The context is made on the
 * first cue and kept; browsers start it suspended until the page has had a
 * click or key, so a cue before any gesture is silent rather than an error.
 */
import {
  lfsrNoise,
  pulseTerms,
  type ChipContext,
} from "../deck/walkers/chip-audio";
import type { Blip } from "./cues";

/** Master level: audible over a quiet room, near the walkers game's music. */
export const LOAD_SOUND_VOLUME = 0.08;
const ATTACK = 0.005;

export class LoadSoundPlayer {
  private ctx?: ChipContext;
  private master?: GainNode;
  private waves = new Map<number, PeriodicWave>();
  private noise?: AudioBuffer;

  constructor(private make: () => ChipContext | undefined = defaultContext) {}

  /** Schedule a cue now; false when this browser has no Web Audio. */
  play(blips: readonly Blip[]): boolean {
    const ctx = this.context();
    if (!ctx) return false;
    void ctx.resume().catch(() => {});
    const t = ctx.currentTime + 0.01;
    for (const blip of blips) this.blip(ctx, t + blip.at, blip);
    return true;
  }

  close() {
    const ctx = this.ctx;
    this.ctx = undefined;
    this.master = undefined;
    this.waves.clear();
    this.noise = undefined;
    if (ctx) void ctx.close().catch(() => {});
  }

  private context() {
    if (!this.ctx) {
      const ctx = this.make();
      if (!ctx) return undefined;
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = LOAD_SOUND_VOLUME;
      this.master.connect(ctx.destination);
    }
    return this.ctx;
  }

  private blip(ctx: ChipContext, at: number, b: Blip) {
    const end = at + b.length;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(b.level, at + ATTACK);
    gain.gain.linearRampToValueAtTime(0, end);
    gain.connect(this.master!);
    let node: AudioScheduledSourceNode;
    if (b.voice === "noise") {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer(ctx);
      source.loop = true;
      source.playbackRate.setValueAtTime(b.from, at);
      if (b.to !== undefined)
        source.playbackRate.linearRampToValueAtTime(b.to, end);
      node = source;
    } else {
      const osc = ctx.createOscillator();
      if (b.voice === "pulse")
        osc.setPeriodicWave(this.pulse(ctx, b.duty ?? 0.5));
      else osc.type = b.voice;
      osc.frequency.setValueAtTime(b.from, at);
      if (b.to !== undefined) osc.frequency.linearRampToValueAtTime(b.to, end);
      node = osc;
    }
    node.connect(gain);
    node.onended = () => {
      node.disconnect();
      gain.disconnect();
    };
    node.start(at);
    node.stop(end + 0.01);
  }

  private pulse(ctx: ChipContext, duty: number) {
    let wave = this.waves.get(duty);
    if (!wave) {
      const { real, imag } = pulseTerms(duty);
      wave = ctx.createPeriodicWave(real, imag);
      this.waves.set(duty, wave);
    }
    return wave;
  }

  private noiseBuffer(ctx: ChipContext) {
    if (!this.noise) {
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
