// Scroll-driven layered song — the landing centrepiece.
//
// ONE looped progressive-house arrangement (Avicii-style: four-on-floor, offbeat
// bass, supersaw chords on vi–IV–I–V, euphoric marimba topline, noise risers),
// synthesised live in the browser and split into FIVE stems. As you scroll the
// page, stems fade in one after another — first just drums, then bass, chords,
// topline, and finally the FX/energy layer at full drop.
//
// Fully self-contained: its OWN AudioContext, never touches the studio engine.
// A lookahead scheduler (Chris-Wilson pattern) keeps every stem sample-locked to
// one clock so nothing ever drifts. `setScroll(p)` ramps each stem's gain; the
// exposed AnalyserNode drives the on-screen visualiser.

const TEMPO = 126;                       // BPM — classic uplifting-house tempo
const SPB = 60 / TEMPO;                  // seconds per beat
const STEP = SPB / 4;                    // one 16th note
const STEPS_PER_BAR = 16;
const BARS = 4;                          // progression length (one chord / bar)
const TOTAL_STEPS = STEPS_PER_BAR * BARS;
const LOOKAHEAD = 0.1;                   // schedule this far ahead (s)
const TICK = 25;                         // scheduler wake interval (ms)

export const STEM_LABELS = ['DRUMS', 'BASS', 'CHORDS', 'TOPLINE', 'FX'] as const;
export type StemCount = typeof STEM_LABELS.length;

// scroll → per-stem target gain. Each stem occupies a window of scroll progress;
// inside its window the gain smoothsteps 0→1, so layers stack as you descend.
const STEM_WINDOWS: Array<[number, number, number]> = [
  //  in     out    peak-gain
  [0.00, 0.10, 0.95], // DRUMS   — audible almost immediately
  [0.12, 0.26, 0.80], // BASS
  [0.28, 0.44, 0.70], // CHORDS
  [0.46, 0.62, 0.65], // TOPLINE
  [0.64, 0.82, 0.55], // FX / energy
];

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// vi – IV – I – V in A major — the euphoric "four chords". One chord per bar.
// Each entry: [bass root midi, chord tone midis].
const PROG: Array<{ root: number; tones: number[] }> = [
  { root: 42, tones: [66, 69, 73] }, // F#m  (F# A C#)
  { root: 38, tones: [62, 66, 69] }, // D    (D F# A)
  { root: 33, tones: [69, 73, 76] }, // A    (A C# E)
  { root: 40, tones: [64, 68, 71] }, // E    (E G# B)
];

// step patterns (16 per bar) --------------------------------------------------
const KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const CLAP = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const HAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]; // offbeat 8ths
const OPENHAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
const BASS = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]; // offbeat pluck
// topline: euphoric 16th arp, indexes into the bar's chord tones (+octave lift)
const TOP_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
const TOP_DEGREE = [0, 2, 1, 2, 0, 1, 2, 1]; // which chord tone
const TOP_OCT = [12, 12, 12, 12, 24, 12, 12, 12]; // semitone lift (peak at step 8)

class ScrollSong {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  analyser: AnalyserNode | null = null;
  private stems: GainNode[] = [];
  private noise!: AudioBuffer;

  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  running = false;
  private targets = [0, 0, 0, 0, 0];

  // build the audio graph on first use (after a user gesture)
  private init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 24; this.comp.ratio.value = 3;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(this.comp).connect(this.analyser).connect(ctx.destination);

    this.stems = STEM_LABELS.map(() => { const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.master); return g; });

    // one second of white noise, reused for hats / claps / risers
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
  }

  async start() {
    this.init();
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.applyTargets(); // push current scroll gains
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    // duck everything out
    if (this.ctx) for (const s of this.stems) s.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
  }

  toggle(): Promise<void> | void { return this.running ? this.stop() : this.start(); }

  // page scroll 0..1 → stem gain targets
  setScroll(p: number) {
    for (let i = 0; i < STEM_WINDOWS.length; i++) {
      const [a, b, peak] = STEM_WINDOWS[i];
      this.targets[i] = smoothstep(a, b, p) * peak;
    }
    if (this.running) this.applyTargets();
  }

  private applyTargets() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.stems.length; i++) {
      this.stems[i].gain.setTargetAtTime(Math.max(0.0001, this.targets[i]), t, 0.22);
    }
  }

  // which stems are currently audible (for the HUD) — cheap, no audio read
  activeStems(): boolean[] { return this.targets.map((g) => g > 0.03); }

  private loop = () => {
    if (!this.running || !this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
    this.timer = window.setTimeout(this.loop, TICK);
  };

  private schedule(globalStep: number, time: number) {
    const bar = Math.floor(globalStep / STEPS_PER_BAR) % BARS;
    const s = globalStep % STEPS_PER_BAR;
    const chord = PROG[bar];

    // DRUMS -----------------------------------------------------------------
    if (KICK[s]) this.kick(time);
    if (CLAP[s]) this.clap(time);
    if (HAT[s]) this.hat(time, 0.03, 6000);
    if (OPENHAT[s]) this.hat(time, 0.12, 4000);
    // BASS ------------------------------------------------------------------
    if (BASS[s]) this.bass(time, chord.root);
    // CHORDS — one supersaw hit per bar, sustained across the bar -----------
    if (s === 0) this.chord(time, chord.tones);
    // TOPLINE — euphoric arp -----------------------------------------------
    const ti = TOP_STEPS.indexOf(s);
    if (ti >= 0) {
      const note = chord.tones[TOP_DEGREE[ti] % chord.tones.length] + TOP_OCT[ti];
      this.pluck(time, note);
    }
    // FX — noise riser once per 4-bar loop, sweeping into the downbeat ------
    if (globalStep === TOTAL_STEPS - STEPS_PER_BAR) this.riser(time, SPB * 4);
    if (globalStep % STEPS_PER_BAR === 8) this.shaker(time);
  }

  // ---- voices (each connects to its stem gain) --------------------------------
  private env(g: GainNode, t: number, peak: number, atk: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    this.env(g, t, 1.0, 0.004, 0.24);
    o.connect(g).connect(this.stems[0]); o.start(t); o.stop(t + 0.3);
  }
  private clap(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.7;
    const g = ctx.createGain(); this.env(g, t, 0.5, 0.003, 0.16);
    src.connect(bp).connect(g).connect(this.stems[0]); src.start(t); src.stop(t + 0.2);
  }
  private hat(t: number, dec: number, hz: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hz;
    const g = ctx.createGain(); this.env(g, t, 0.28, 0.002, dec);
    src.connect(hp).connect(g).connect(this.stems[0]); src.start(t); src.stop(t + dec + 0.05);
  }
  private shaker(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain(); this.env(g, t, 0.16, 0.01, 0.09);
    src.connect(hp).connect(g).connect(this.stems[4]); src.start(t); src.stop(t + 0.2);
  }
  private bass(t: number, midi: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 6;
    const g = ctx.createGain(); this.env(g, t, 0.8, 0.006, 0.22);
    o.connect(lp).connect(g).connect(this.stems[1]); o.start(t); o.stop(t + 0.3);
  }
  private chord(t: number, tones: number[]) {
    const ctx = this.ctx!; const dur = SPB * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    g.gain.setValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    lp.connect(g).connect(this.stems[2]);
    // supersaw: each chord tone as 3 detuned saws, one octave up for shimmer
    for (const m of tones) {
      for (const det of [-8, 0, 8]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(m + 12); o.detune.value = det;
        const vg = ctx.createGain(); vg.gain.value = 0.12;
        o.connect(vg).connect(lp); o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }
  private pluck(t: number, midi: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = mtof(midi); o2.detune.value = 6;
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const g = ctx.createGain(); this.env(g, t, 0.4, 0.004, 0.28);
    o.connect(mix); o2.connect(mix); mix.connect(lp).connect(g).connect(this.stems[3]);
    o.start(t); o2.start(t); o.stop(t + 0.34); o2.stop(t + 0.34);
  }
  private riser(t: number, dur: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(8000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.stems[4]); src.start(t); src.stop(t + dur + 0.05);
  }
}

export const scrollSong = new ScrollSong();
