// Synthesis. Guitar = Karplus–Strong physical model rendered to cached buffers;
// drums + bass = classic subtractive recipes. Believable pluck, not toy beeps (§7.2).

import { midiToFreq } from '../theory/pitch';

export type GuitarVariant = 'open' | 'muted' | 'soft' | 'harm' | 'lead';

const ksCache = new Map<string, AudioBuffer>();

export function clearGuitarCache() { ksCache.clear(); }

// Render a Karplus–Strong pluck into a buffer. Cached per (pitch, variant, seed).
// Three seeds per pitch round-robin so repeated notes never sound stamped.
const SEEDS = 3;
let rr = 0;
export function guitarBuffer(ctx: BaseAudioContext, midi: number, variant: GuitarVariant, seed?: number): AudioBuffer {
  const sd = seed ?? (rr = (rr + 1) % SEEDS);
  const key = `${midi}|${variant}|${sd}`;
  const hit = ksCache.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const freq = midiToFreq(midi);
  const seconds = variant === 'muted' ? 0.6 : variant === 'soft' ? 2.2
    : variant === 'harm' ? 3.2 : variant === 'lead' ? 3.6 : 3.0;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  if (variant === 'harm') {
    // Harmonics ring pure: fundamental + soft octave partial, slow decay.
    const decay = 1.1;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t / decay);
      data[i] = (Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.18)
        * env * 0.5 * Math.min(1, i / (sr * 0.004));
    }
    ksCache.set(key, buf);
    return buf;
  }
  void sd; // seed only varies the random excitation below

  const N = Math.max(2, Math.round(sr / freq));
  const line = new Float32Array(N + 1);

  // Excitation: filtered noise burst. Softer/darker for legato, tight for mute.
  const bright = variant === 'soft' ? 0.35 : variant === 'muted' ? 0.5 : variant === 'lead' ? 0.9 : 0.72;
  let lp = 0;
  for (let i = 0; i <= N; i++) {
    const white = Math.random() * 2 - 1;
    lp = lp + bright * (white - lp);
    line[i] = lp;
  }
  // Pick-position comb: subtract a delayed copy for body.
  const pickPos = Math.floor(N * 0.12) + 1;
  for (let i = N; i >= pickPos; i--) line[i] -= 0.5 * line[i - pickPos];

  const damp = variant === 'muted' ? 0.86 : variant === 'soft' ? 0.995 : variant === 'lead' ? 0.9975 : 0.996;
  const blend = variant === 'muted' ? 0.42 : 0.5;
  let idx = 0;
  let prevOut = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[idx];
    const nxt = line[(idx + 1) % (N + 1)];
    const avg = (cur * (1 - blend) + nxt * blend + prevOut * blend * 0.06) / (1 + blend * 0.06);
    const v = avg * damp;
    line[idx] = v;
    prevOut = v;
    data[i] = cur;
    idx = (idx + 1) % (N + 1);
  }
  // Attack shaping + gentle overall normalization.
  const atk = Math.floor(sr * 0.0015);
  for (let i = 0; i < atk; i++) data[i] *= i / atk;
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) { const g = 0.85 / peak; for (let i = 0; i < len; i++) data[i] *= g; }
  ksCache.set(key, buf);
  return buf;
}

// Warm the cache off the hot path (during idle) so playback never renders.
export function prewarmGuitar(ctx: BaseAudioContext, midis: number[], variants: GuitarVariant[] = ['open']) {
  const jobs: [number, GuitarVariant, number][] = [];
  for (const m of new Set(midis)) for (const v of variants) for (let s = 0; s < SEEDS; s++) {
    if (!ksCache.has(`${m}|${v}|${s}`)) jobs.push([m, v, s]);
  }
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 8) {
      guitarBuffer(ctx, jobs[i][0], jobs[i][1], jobs[i][2]);
      i++;
    }
    if (i < jobs.length) requestIdleCallback ? requestIdleCallback(step) : setTimeout(step, 30);
  };
  step();
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

// --- drum voices --------------------------------------------------------------

export function kick(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(148, when);
  o.frequency.exponentialRampToValueAtTime(44, when + 0.1);
  g.gain.setValueAtTime(vel, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
  o.connect(g).connect(out);
  o.start(when); o.stop(when + 0.32);
  // beater click
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(vel * 0.25, when);
  cg.gain.exponentialRampToValueAtTime(0.001, when + 0.015);
  s.connect(hp).connect(cg).connect(out);
  s.start(when); s.stop(when + 0.02);
}

export function snare(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode, brush = false) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = brush ? 2400 : 1900; bp.Q.value = brush ? 0.5 : 0.85;
  const g = ctx.createGain();
  const dur = brush ? 0.32 : 0.17;
  g.gain.setValueAtTime(vel * (brush ? 0.35 : 0.55), when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  s.connect(bp).connect(g).connect(out);
  s.start(when); s.stop(when + dur + 0.02);
  if (!brush) {
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(196, when);
    o.frequency.exponentialRampToValueAtTime(148, when + 0.06);
    og.gain.setValueAtTime(vel * 0.32, when);
    og.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
    o.connect(og).connect(out);
    o.start(when); o.stop(when + 0.1);
  }
}

export function hat(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode, open = false) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7600;
  const g = ctx.createGain();
  const dur = open ? 0.28 : 0.05;
  g.gain.setValueAtTime(vel * 0.32, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  s.connect(hp).connect(g).connect(out);
  s.start(when); s.stop(when + dur + 0.02);
}

export function ride(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.22, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.55);
  s.connect(bp).connect(g).connect(out);
  s.start(when); s.stop(when + 0.6);
  const o = ctx.createOscillator(); const og = ctx.createGain();
  o.type = 'square'; o.frequency.value = 3140;
  og.gain.setValueAtTime(vel * 0.05, when);
  og.gain.exponentialRampToValueAtTime(0.001, when + 0.4);
  o.connect(og).connect(out);
  o.start(when); o.stop(when + 0.42);
}

export function rim(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = 830;
  g.gain.setValueAtTime(vel * 0.4, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
  o.connect(g).connect(out);
  o.start(when); o.stop(when + 0.05);
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * 0.18, when);
  ng.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
  s.connect(bp).connect(ng).connect(out);
  s.start(when); s.stop(when + 0.04);
}

export function shaker(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6300; bp.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vel * 0.2, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
  s.connect(bp).connect(g).connect(out);
  s.start(when); s.stop(when + 0.1);
}

export function tom(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode, high = true) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(high ? 170 : 120, when);
  o.frequency.exponentialRampToValueAtTime(high ? 110 : 74, when + 0.16);
  g.gain.setValueAtTime(vel * 0.8, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
  o.connect(g).connect(out);
  o.start(when); o.stop(when + 0.32);
}

export function click(ctx: BaseAudioContext, when: number, vel: number, out: AudioNode, accent = false) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = accent ? 1660 : 1245;
  g.gain.setValueAtTime(vel * (accent ? 0.5 : 0.32), when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  o.connect(g).connect(out);
  o.start(when); o.stop(when + 0.06);
}

// --- bass ---------------------------------------------------------------------

export function bassNote(ctx: BaseAudioContext, when: number, midi: number, vel: number, lenSec: number, out: AudioNode) {
  const freq = midiToFreq(midi);
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = freq;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
  lp.frequency.setValueAtTime(900, when);
  lp.frequency.exponentialRampToValueAtTime(260, when + Math.min(0.5, lenSec));
  const g = ctx.createGain();
  const subG = ctx.createGain(); subG.gain.value = 0.55;
  const end = when + Math.max(0.15, lenSec);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vel * 0.62, when + 0.014);
  g.gain.setValueAtTime(vel * 0.62, Math.max(when + 0.014, end - 0.09));
  g.gain.exponentialRampToValueAtTime(0.001, end);
  o.connect(lp);
  sub.connect(subG).connect(lp);
  lp.connect(g).connect(out);
  o.start(when); o.stop(end + 0.02);
  sub.start(when); sub.stop(end + 0.02);
}

// --- UI sounds: whisper-level, instrument-like (§5.6) -------------------------

export function uiTick(ctx: BaseAudioContext, out: AudioNode) {
  const t = ctx.currentTime + 0.001;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 2093;
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.1);
}

export function uiThunk(ctx: BaseAudioContext, out: AudioNode) {
  const t = ctx.currentTime + 0.001;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.18);
}

export function uiPop(ctx: BaseAudioContext, out: AudioNode) {
  const t = ctx.currentTime + 0.001;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(660, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.03);
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.08);
}

// --- voice: a formant "aah" so a sung melody reads as a voice, not a beep -----
// Three bandpass formants over a glottal-ish saw pair. Soft attack, gentle vibrato.
const VOWELS: Record<string, [number, number, number]> = {
  ah: [730, 1090, 2440], oh: [570, 840, 2410], ee: [270, 2290, 3010], oo: [300, 870, 2240],
};

export function voiceNote(
  ctx: BaseAudioContext, when: number, midi: number, vel: number, lenSec: number,
  out: AudioNode, vowel: keyof typeof VOWELS = 'ah',
) {
  const freq = midiToFreq(midi);
  const dur = Math.max(0.18, lenSec);
  const end = when + dur;

  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq;
  o2.detune.value = 6; // two voices, faint chorus
  // human vibrato, delayed onset so short notes stay steady
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.2;
  const lfoG = ctx.createGain(); lfoG.gain.setValueAtTime(0, when);
  lfoG.gain.linearRampToValueAtTime(0, when + Math.min(0.25, dur * 0.4));
  lfoG.gain.linearRampToValueAtTime(midi > 0 ? 7 : 0, end); // up to ~7 cents
  lfo.connect(lfoG); lfoG.connect(o1.detune); lfoG.connect(o2.detune);

  const src = ctx.createGain(); src.gain.value = 0.5;
  o1.connect(src); o2.connect(src);

  const [f1, f2, f3] = VOWELS[vowel];
  const sum = ctx.createGain();
  for (const [f, q, g] of [[f1, 9, 1], [f2, 11, 0.65], [f3, 12, 0.35]] as const) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const fg = ctx.createGain(); fg.gain.value = g;
    src.connect(bp).connect(fg).connect(sum);
  }

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(vel * 0.5, when + 0.05);           // breathy attack
  amp.gain.setValueAtTime(vel * 0.5, Math.max(when + 0.05, end - 0.12));
  amp.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);               // soft release
  sum.connect(amp).connect(out);

  o1.start(when); o2.start(when); lfo.start(when);
  o1.stop(end + 0.05); o2.stop(end + 0.05); lfo.stop(end + 0.05);
}

// A soft-clip curve for the lead channel — a little grit, never fuzz.
export function driveCurve(amount = 0.4): Float32Array {
  const n = 1024;
  const c = new Float32Array(n);
  const k = amount * 12;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return c;
}
