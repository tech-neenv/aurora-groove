// ZERO-G STUDIO — the 8-layer track you build in flight.
//
// One looped progressive arrangement (Am–F–C–G, 124 BPM). Each of the 8 layers
// has TWO variants; your pick at each station turns that layer on in the flavour
// you chose. Everything is synthesised live and sample-locked to one clock, so
// the groove stays tight no matter which combination you assemble. Original
// composition — evokes the genre, copies no specific song. Self-contained
// AudioContext; never touches the studio engine.

const TEMPO = 124;
const SPB = 60 / TEMPO;
const STEP = SPB / 4;
const SPBAR = 16;
const BARS = 4;
const TOTAL = SPBAR * BARS;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export const LAYERS = ['PULSE', 'LOW', 'CHORDS', 'GROOVE', 'ARP', 'LEAD', 'TEXTURE', 'DROP'] as const;
export type LayerIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// the two choices offered at each station (label only — feeds the UI)
export const VARIANTS: [string, string][] = [
  ['four-on-floor', 'halftime'],
  ['deep sub', 'plucky'],
  ['warm pads', 'bright stabs'],
  ['tight hats', 'swung groove'],
  ['rising arp', 'falling arp'],
  ['euphoric lead', 'moody lead'],
  ['airy texture', 'dark texture'],
  ['riser + impact', 'filter sweep'],
];

const PROG = [
  { root: 33, tones: [69, 72, 76] }, // Am
  { root: 29, tones: [65, 69, 72] }, // F
  { root: 36, tones: [67, 72, 76] }, // C(add)
  { root: 31, tones: [67, 71, 74] }, // G
];

class ZeroAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  analyser: AnalyserNode | null = null;
  private stems: GainNode[] = [];
  private noise!: AudioBuffer;
  private on = [false, false, false, false, false, false, false, false];
  private variant = [0, 0, 0, 0, 0, 0, 0, 0];
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  running = false;

  private init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor(); this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 3;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);
    this.stems = LAYERS.map(() => { const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.master); return g; });
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n;
  }

  async start() {
    this.init(); const ctx = this.ctx!;
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.running) return;
    this.running = true; this.step = 0; this.nextTime = ctx.currentTime + 0.08; this.loop();
  }
  stop() {
    this.running = false;
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    if (this.ctx) for (const s of this.stems) s.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
  }

  // pick a layer's variant → turn it on (called on a user gesture, so audio is unlocked)
  pick(layer: LayerIndex, v: number) {
    void this.start();
    this.variant[layer] = v; this.on[layer] = true;
    if (this.ctx) this.stems[layer].gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.15);
  }
  isOn(layer: number) { return this.on[layer]; }

  private loop = () => {
    if (!this.running || !this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + 0.1) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += STEP; this.step = (this.step + 1) % TOTAL;
    }
    this.timer = window.setTimeout(this.loop, 25);
  };

  private schedule(gs: number, t: number) {
    const bar = Math.floor(gs / SPBAR) % BARS, s = gs % SPBAR;
    const ch = PROG[bar];
    if (this.on[0]) this.pulse(s, t);
    if (this.on[1]) this.low(s, t, ch.root);
    if (this.on[2]) this.chords(s, t, ch.tones);
    if (this.on[3]) this.groove(s, t);
    if (this.on[4]) this.arp(s, t, ch.tones);
    if (this.on[5]) this.lead(s, t, ch.tones);
    if (this.on[6] && s === 0) this.texture(t, ch.tones, ch.root);
    if (this.on[7]) this.drop(gs, s, t);
  }

  // ── voices ────────────────────────────────────────────────────────────────
  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private src() { const s = this.ctx!.createBufferSource(); s.buffer = this.noise; return s; }
  private kick(t: number) { const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11); this.env(g, t, 1, 0.004, 0.24); o.connect(g).connect(this.stems[0]); o.start(t); o.stop(t + 0.3); }
  private hatTo(t: number, dst: GainNode, dec: number, hz: number) { const ctx = this.ctx!, s = this.src(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hz; const g = ctx.createGain(); this.env(g, t, 0.24, 0.002, dec); s.connect(hp).connect(g).connect(dst); s.start(t); s.stop(t + dec + 0.05); }

  private pulse(s: number, t: number) {
    if (this.variant[0] === 0) { if (s % 4 === 0) this.kick(t); }
    else { if (s === 0 || s === 8) this.kick(t); }
    if (s === 4 || s === 12) { const ctx = this.ctx!, sn = this.src(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; const g = ctx.createGain(); this.env(g, t, 0.5, 0.003, 0.15); sn.connect(bp).connect(g).connect(this.stems[0]); sn.start(t); sn.stop(t + 0.2); }
  }
  private low(s: number, t: number, root: number) {
    const ctx = this.ctx!;
    if (this.variant[1] === 0) { // deep sub, one long note per bar
      if (s !== 0) return; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(root - 12); const g = ctx.createGain(); const dur = SPB * 4; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + 0.04); g.gain.setValueAtTime(0.8, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(this.stems[1]); o.start(t); o.stop(t + dur + 0.05);
    } else { // plucky offbeat
      if (!(s === 2 || s === 6 || s === 10 || s === 14)) return; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(root); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 6; const g = ctx.createGain(); this.env(g, t, 0.8, 0.006, 0.2); o.connect(lp).connect(g).connect(this.stems[1]); o.start(t); o.stop(t + 0.3);
    }
  }
  private chords(s: number, t: number, tones: number[]) {
    const ctx = this.ctx!;
    if (this.variant[2] === 0) { // warm pads, sustained per bar
      if (s !== 0) return; const dur = SPB * 4; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.34, t + 0.1); g.gain.setValueAtTime(0.34, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.connect(g).connect(this.stems[2]); for (const m of tones) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); const vg = ctx.createGain(); vg.gain.value = 0.2; o.connect(vg).connect(lp); o.start(t); o.stop(t + dur + 0.05); }
    } else { // bright stabs on the beat
      if (s % 4 !== 0) return; const g = ctx.createGain(); this.env(g, t, 0.4, 0.005, 0.22); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.connect(g).connect(this.stems[2]); for (const m of tones) for (const det of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.detune.value = det; const vg = ctx.createGain(); vg.gain.value = 0.12; o.connect(vg).connect(lp); o.start(t); o.stop(t + 0.3); }
    }
  }
  private groove(s: number, t: number) {
    if (this.variant[3] === 0) { if (s % 2 === 0) this.hatTo(t, this.stems[3], 0.03, 7000); if (s === 14) this.hatTo(t, this.stems[3], 0.12, 5000); }
    else { if (s === 2 || s === 6 || s === 10 || s === 14) this.hatTo(t, this.stems[3], 0.05, 6500); if (s % 4 === 3) this.hatTo(t, this.stems[3], 0.04, 9000); }
  }
  private pluckTo(t: number, midi: number, dst: GainNode) { const ctx = this.ctx!, o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi); o2.type = 'square'; o2.frequency.value = mtof(midi); o2.detune.value = 6; const mix = ctx.createGain(); mix.gain.value = 0.5; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; const g = ctx.createGain(); this.env(g, t, 0.34, 0.004, 0.24); o.connect(mix); o2.connect(mix); mix.connect(lp).connect(g).connect(dst); o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3); }
  private arp(s: number, t: number, tones: number[]) {
    if (s % 2 !== 0) return; const idx = s / 2; const order = this.variant[4] === 0 ? idx : (7 - idx);
    const note = tones[order % tones.length] + 12 + (Math.floor(order / tones.length) * 12);
    this.pluckTo(t, note, this.stems[4]);
  }
  private lead(s: number, t: number, tones: number[]) {
    const pat = this.variant[5] === 0 ? [0, 3, 6, 8, 11, 14] : [0, 4, 8, 10, 12];
    if (!pat.includes(s)) return; const ctx = this.ctx!;
    const oct = this.variant[5] === 0 ? 12 : 0; const deg = this.variant[5] === 0 ? (s % tones.length) : ((tones.length - 1 - (s % tones.length)));
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(tones[deg] + oct); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 2; const g = ctx.createGain(); this.env(g, t, 0.3, 0.01, 0.3); o.connect(lp).connect(g).connect(this.stems[5]); o.start(t); o.stop(t + 0.4);
  }
  private texture(t: number, tones: number[], root: number) {
    const ctx = this.ctx!, dur = SPB * 4; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.3); g.gain.setValueAtTime(0.16, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.variant[6] === 0 ? 5000 : 700; lp.connect(g).connect(this.stems[6]);
    const notes = this.variant[6] === 0 ? tones.map((m) => m + 24) : [root - 12, root];
    for (const m of notes) { const o = ctx.createOscillator(); o.type = this.variant[6] === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(m); const vg = ctx.createGain(); vg.gain.value = 0.14; o.connect(vg).connect(lp); o.start(t); o.stop(t + dur + 0.05); }
  }
  private drop(gs: number, s: number, t: number) {
    const ctx = this.ctx!;
    if (this.variant[7] === 0) { // riser + impact
      if (gs === TOTAL - SPBAR) { const sr = this.src(); sr.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(7000, t + SPB * 4); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + SPB * 3.6); g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 4); sr.connect(bp).connect(g).connect(this.stems[7]); sr.start(t); sr.stop(t + SPB * 4 + 0.05); }
      if (gs === 0) { const cr = this.src(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000; const g = ctx.createGain(); this.env(g, t, 0.4, 0.002, 0.5); cr.connect(hp).connect(g).connect(this.stems[7]); cr.start(t); cr.stop(t + 0.7); }
    } else { // continuous filter sweep shimmer
      if (s % 4 !== 0) return; const sr = this.src(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(1200 + Math.sin(gs) * 600, t); bp.frequency.exponentialRampToValueAtTime(6000, t + SPB); const g = ctx.createGain(); this.env(g, t, 0.14, 0.02, SPB); sr.connect(bp).connect(g).connect(this.stems[7]); sr.start(t); sr.stop(t + SPB + 0.1);
    }
  }
}

export const zeroAudio = new ZeroAudio();
