// ── /v2landing — original ROCK instrumental, 10 layers, scroll-built ─────────
// An original driving rock groove in E minor (my own riff + progression — not
// any existing song). Ten stems fade in as you scroll: kick · snare · hats ·
// sub · bass · rhythm guitar (distorted power chords) · lead guitar · organ ·
// crash · fx-riser. Its own AudioContext + an analyser the visuals react to.

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const TEMPO = 126;
const SPB = 60 / TEMPO;
const S16 = SPB / 4;
const STEPS = 16, BARS = 4, TOTAL = STEPS * BARS;

// progression: Em – C – G – D (i – VI – III – VII)
const PROG = [
  { root: 40, power: [40, 47], organ: [52, 55, 59] }, // Em
  { root: 36, power: [36, 43], organ: [48, 52, 55] }, // C
  { root: 43, power: [43, 50], organ: [55, 59, 62] }, // G
  { root: 38, power: [38, 45], organ: [50, 54, 57] }, // D
];
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const EIGHTH = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]; // hats / chug / bass
// lead riff (E-minor pentatonic), 64 steps, -1 = rest
const LEAD = [
  64, -1, -1, 67, 69, -1, 71, -1, 76, -1, 71, -1, 69, -1, 67, -1,
  67, -1, -1, -1, 64, -1, 67, -1, 69, -1, -1, -1, 67, -1, -1, -1,
  71, -1, -1, -1, 74, -1, 71, -1, 67, -1, 69, -1, 71, -1, -1, -1,
  69, -1, -1, -1, 74, -1, 69, -1, 67, -1, -1, -1, 64, -1, 62, -1,
];

function smoothstep(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// build windows per stem: [in, full, peak]
const WIN: Array<[number, number, number]> = [
  [0.00, 0.06, 0.95], // KICK
  [0.06, 0.14, 0.8],  // SNARE
  [0.14, 0.22, 0.45], // HATS
  [0.22, 0.30, 0.9],  // SUB
  [0.30, 0.40, 0.8],  // BASS
  [0.40, 0.50, 0.7],  // RHYTHM
  [0.50, 0.62, 0.75], // LEAD
  [0.62, 0.72, 0.5],  // ORGAN
  [0.72, 0.82, 0.55], // CRASH
  [0.82, 0.92, 0.5],  // FX
];
const KICK_S = 0, SNARE_S = 1, HATS = 2, SUB = 3, BASS = 4, RHY = 5, LEAD_S = 6, ORG = 7, CRASH = 8, FX = 9;

function distCurve(k: number) { const n = 22050, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); } return c; }

class RockSong {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  analyser: AnalyserNode | null = null;
  private stems: GainNode[] = [];
  private noise!: AudioBuffer;
  private drive!: Float32Array<ArrayBuffer>;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private timer: number | null = null;
  private nextTime = 0; private step = 0; running = false;
  private targets = new Array(WIN.length).fill(0);

  private init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor(); this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);
    this.stems = WIN.map(() => { const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.master); return g; });
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n;
    this.drive = distCurve(60);
  }

  async start() { this.init(); const ctx = this.ctx!; if (ctx.state === 'suspended') await ctx.resume(); if (this.running) return; this.running = true; this.step = 0; this.nextTime = ctx.currentTime + 0.1; this.apply(); this.loop(); }
  stop() { this.running = false; if (this.timer != null) { clearTimeout(this.timer); this.timer = null; } if (this.ctx) for (const s of this.stems) s.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1); }
  setBuild(p: number) { for (let i = 0; i < WIN.length; i++) { const [a, b, peak] = WIN[i]; this.targets[i] = smoothstep(a, b, p) * peak; } if (this.running) this.apply(); }
  private apply() { if (!this.ctx) return; const t = this.ctx.currentTime; this.stems.forEach((s, i) => s.gain.setTargetAtTime(Math.max(0.0001, this.targets[i]), t, 0.28)); }
  energy(): number { const an = this.analyser; if (!an) return 0; if (!this.freq || this.freq.length !== an.frequencyBinCount) this.freq = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(this.freq); let s = 0; for (let i = 0; i < this.freq.length; i++) s += this.freq[i]; return Math.min(1, s / this.freq.length / 120); }

  private loop = () => { if (!this.running || !this.ctx) return; while (this.nextTime < this.ctx.currentTime + 0.1) { this.schedule(this.step, this.nextTime); this.nextTime += S16; this.step = (this.step + 1) % TOTAL; } this.timer = window.setTimeout(this.loop, 25); };

  private schedule(g: number, t: number) {
    const bar = Math.floor(g / STEPS) % BARS; const s = g % STEPS; const ch = PROG[bar];
    if (KICK[s]) this.kick(t);
    if (SNARE[s]) this.snare(t);
    if (EIGHTH[s]) this.hat(t);
    if (s === 0) this.sub(t, ch.root - 12, SPB * 4);
    if (EIGHTH[s]) this.bass(t, ch.root);
    if (EIGHTH[s]) this.power(t, ch.power);
    { const n = LEAD[g]; if (n > 0) this.lead(t, n); }
    if (s === 0) this.organ(t, ch.organ, SPB * 4);
    if (g === 0 || g === 32) this.crash(t);
    if (g === TOTAL - STEPS) this.riser(t, SPB * 4);
  }

  private env(gn: GainNode, t: number, peak: number, atk: number, dec: number) { gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(peak, t + atk); gn.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec); }
  private kick(t: number) { const ctx = this.ctx!; const o = ctx.createOscillator(); const gn = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09); this.env(gn, t, 1.0, 0.004, 0.2); o.connect(gn).connect(this.stems[KICK_S]); o.start(t); o.stop(t + 0.28); }
  private snare(t: number) { const ctx = this.ctx!; const src = ctx.createBufferSource(); src.buffer = this.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.6; const gn = ctx.createGain(); this.env(gn, t, 0.7, 0.003, 0.16); src.connect(bp).connect(gn).connect(this.stems[SNARE_S]); src.start(t); src.stop(t + 0.2);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 220; const g2 = ctx.createGain(); this.env(g2, t, 0.3, 0.003, 0.1); o.connect(g2).connect(this.stems[SNARE_S]); o.start(t); o.stop(t + 0.14); }
  private hat(t: number) { const ctx = this.ctx!; const src = ctx.createBufferSource(); src.buffer = this.noise; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000; const gn = ctx.createGain(); this.env(gn, t, 0.18, 0.002, 0.04); src.connect(hp).connect(gn).connect(this.stems[HATS]); src.start(t); src.stop(t + 0.08); }
  private crash(t: number) { const ctx = this.ctx!; const src = ctx.createBufferSource(); src.buffer = this.noise; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000; const gn = ctx.createGain(); this.env(gn, t, 0.4, 0.004, 1.2); src.connect(hp).connect(gn).connect(this.stems[CRASH]); src.start(t); src.stop(t + 1.4); }
  private sub(t: number, midi: number, dur: number) { const ctx = this.ctx!; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi); const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.9, t + 0.02); gn.gain.setValueAtTime(0.9, t + dur * 0.8); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(gn).connect(this.stems[SUB]); o.start(t); o.stop(t + dur + 0.05); }
  private bass(t: number, midi: number) { const ctx = this.ctx!; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3; const gn = ctx.createGain(); this.env(gn, t, 0.75, 0.006, SPB * 0.7); o.connect(lp).connect(gn).connect(this.stems[BASS]); o.start(t); o.stop(t + SPB); }
  private power(t: number, tones: number[]) { const ctx = this.ctx!; const ws = ctx.createWaveShaper(); ws.curve = this.drive; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; const gn = ctx.createGain(); this.env(gn, t, 0.5, 0.004, SPB * 0.5); ws.connect(lp).connect(gn).connect(this.stems[RHY]); for (const m of tones) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.detune.value = det; const vg = ctx.createGain(); vg.gain.value = 0.18; o.connect(vg).connect(ws); o.start(t); o.stop(t + SPB * 0.6); } }
  private lead(t: number, midi: number) { const ctx = this.ctx!; const ws = ctx.createWaveShaper(); ws.curve = this.drive; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; const gn = ctx.createGain(); this.env(gn, t, 0.5, 0.008, SPB * 0.8); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = mtof(midi); o2.detune.value = 5; const mix = ctx.createGain(); mix.gain.value = 0.5; o.connect(mix); o2.connect(mix); mix.connect(ws).connect(lp).connect(gn).connect(this.stems[LEAD_S]); o.start(t); o2.start(t); o.stop(t + SPB); o2.stop(t + SPB); }
  private organ(t: number, tones: number[], dur: number) { const ctx = this.ctx!; const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.3, t + 0.06); gn.gain.setValueAtTime(0.3, t + dur * 0.75); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); gn.connect(this.stems[ORG]); for (const m of tones) for (const mul of [1, 2]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m) * mul; const vg = ctx.createGain(); vg.gain.value = mul === 1 ? 0.16 : 0.08; o.connect(vg).connect(gn); o.start(t); o.stop(t + dur + 0.05); } }
  private riser(t: number, dur: number) { const ctx = this.ctx!; const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(8000, t + dur); const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.3, t + dur * 0.9); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); src.connect(bp).connect(gn).connect(this.stems[FX]); src.start(t); src.stop(t + dur + 0.05); }
}

export const rockSong = new RockSong();
