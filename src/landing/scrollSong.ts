// Scroll-driven layered song — the landing centrepiece.
//
// ONE looped progressive-house anthem over the "four chords" (vi–IV–I–V),
// synthesised live in the browser and split into TEN stems. As you scroll the
// page, stems fade in one after another — kick, sub, hats, clap, bass, chords,
// arp, lead, bells, and finally the FX/energy layer at the full drop.
//
// Making ten layers FELT (not a wall of mush):
//   · each stem is STEREO-PANNED to its own spot (hats left, clap/bells right,
//     arp left, kick/sub/bass/lead centre) so they read as separate elements;
//   · each owns a distinct register + timbre (pure sub sine, saw bass, supersaw
//     pad, square arp, singing saw lead, high shimmer bells);
//   · scroll windows snap in over a short span, and the master bus is only
//     gently compressed, so a new layer's arrival actually changes the sound;
//   · lead + bells feed a dotted-8th delay send for space/shimmer.
//
// Fully self-contained: its OWN AudioContext, never touches the studio engine.
// A lookahead scheduler (Chris-Wilson pattern) keeps every stem sample-locked to
// one clock so nothing drifts. `setScroll(p)` ramps each stem's gain; the
// exposed AnalyserNode drives the on-screen visualiser.

const TEMPO = 126;                       // BPM — classic uplifting-house tempo
const SPB = 60 / TEMPO;                  // seconds per beat
const STEP = SPB / 4;                    // one 16th note
const STEPS_PER_BAR = 16;
const BARS = 4;                          // progression length (one chord / bar)
const TOTAL_STEPS = STEPS_PER_BAR * BARS;
const LOOKAHEAD = 0.1;                   // schedule this far ahead (s)
const TICK = 25;                         // scheduler wake interval (ms)

// Ten stems, ordered low→high energy so they stack as you descend the page.
export const STEM_LABELS = ['KICK', 'SUB', 'HATS', 'CLAP', 'BASS', 'CHORDS', 'ARP', 'LEAD', 'BELLS', 'FX'] as const;
export type StemCount = typeof STEM_LABELS.length;
// stable indices into the stem array (keeps voice routing readable)
const S = { KICK: 0, SUB: 1, HATS: 2, CLAP: 3, BASS: 4, CHORDS: 5, ARP: 6, LEAD: 7, BELLS: 8, FX: 9 } as const;
// stereo placement per stem (-1 hard-left … +1 hard-right) — the big "feel" win
const PAN = [0.0, 0.0, -0.4, 0.34, 0.0, -0.18, -0.5, 0.0, 0.52, 0.3];

// scroll → per-stem target gain. Each stem occupies a window of scroll progress;
// inside its (short) window the gain smoothsteps 0→1, so layers SNAP in and stack
// as you descend. Peaks are staggered so each layer clearly adds to the mix.
const STEM_WINDOWS: Array<[number, number, number]> = [
  //  in     out    peak-gain
  [0.00, 0.04, 1.00], // KICK   — audible almost immediately
  [0.05, 0.10, 0.85], // SUB
  [0.12, 0.16, 0.42], // HATS
  [0.21, 0.26, 0.62], // CLAP
  [0.30, 0.35, 0.78], // BASS
  [0.39, 0.45, 0.66], // CHORDS
  [0.49, 0.54, 0.50], // ARP
  [0.58, 0.64, 0.72], // LEAD   — the melody, kept prominent
  [0.69, 0.75, 0.44], // BELLS
  [0.80, 0.88, 0.60], // FX / energy
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
const SUB_STEPS = [0, 8];                                      // half-bar sub swells
// LEAD — a NEW original topline melody. 8th-note grid; -1 = rest (rests let it
// breathe like a vocal). Builds to a high A over the I chord (bar 3), then
// descends and resolves over the V (bar 4). All notes sit in A major.
const TOP_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
const MELODY: number[][] = [
  [90, -1, 88, 85, -1, 85, 88, -1], // bar1 F#m:  F# · E C# · C# E ·
  [86, -1, 88, 90, -1, 90, 88, -1], // bar2 D:    D · E F# · F# E ·
  [85, -1, 88, 93, -1, 90, 88, 85], // bar3 A:    C# · E A(hi) · F# E C#
  [88, -1, 85, 83, -1, 81, -1, -1], // bar4 E:    E · C# B · A · ·
];
// arp: driving 16ths that fill the gaps between the lead's 8ths (odd steps)
const ARP_STEPS = [1, 3, 5, 7, 9, 11, 13, 15];
const ARP_DEGREE = [0, 1, 2, 0, 1, 2, 0, 1]; // ascending chord-tone run
const BELL_STEPS = [0, 8]; // sparse high sparkle, twice a bar

class ScrollSong {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  private delayIn!: GainNode;
  analyser: AnalyserNode | null = null;
  private stems: GainNode[] = [];
  private noise!: AudioBuffer;

  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  running = false;
  private targets: number[] = STEM_LABELS.map(() => 0);

  // build the audio graph on first use (after a user gesture)
  private init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    // gentle glue compression only — leave headroom so layers stay dynamic/felt
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -8; this.comp.knee.value = 20; this.comp.ratio.value = 2.4;
    this.master = ctx.createGain(); this.master.gain.value = 0.78;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(this.comp).connect(this.analyser).connect(ctx.destination);

    // dotted-8th delay send — space + shimmer for lead & bells
    const delay = ctx.createDelay(1.0); delay.delayTime.value = SPB * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.master);
    this.delayIn = ctx.createGain(); this.delayIn.connect(delay);

    // each stem: gain → its own stereo panner → master
    this.stems = STEM_LABELS.map((_, i) => {
      const g = ctx.createGain(); g.gain.value = 0.0001;
      const p = ctx.createStereoPanner(); p.pan.value = PAN[i] ?? 0;
      g.connect(p).connect(this.master);
      return g;
    });

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

    // DRUMS — split across KICK / HATS / CLAP stems -------------------------
    if (KICK[s]) this.kick(time);
    if (CLAP[s]) this.clap(time);
    if (HAT[s]) this.hat(time, 0.03, 6000);
    if (OPENHAT[s]) this.hat(time, 0.12, 4000);
    // SUB — rounded sine + sub-octave swell under the bass ------------------
    if (SUB_STEPS.includes(s)) this.sub(time, chord.root, SPB * 2);
    // BASS — offbeat saw pluck ---------------------------------------------
    if (BASS[s]) this.bass(time, chord.root);
    // CHORDS — one supersaw hit per bar, sustained across the bar -----------
    if (s === 0) this.chord(time, chord.tones);
    // ARP — driving 16ths between the lead notes ---------------------------
    const ai = ARP_STEPS.indexOf(s);
    if (ai >= 0) this.arp(time, chord.tones[ARP_DEGREE[ai] % chord.tones.length] + 12);
    // LEAD — the new topline melody ----------------------------------------
    const mi = TOP_STEPS.indexOf(s);
    if (mi >= 0) { const note = MELODY[bar][mi]; if (note >= 0) this.lead(time, note); }
    // BELLS — sparse high sparkle ------------------------------------------
    if (BELL_STEPS.includes(s)) this.bells(time, chord.tones[2] + 24);
    // FX — noise riser once per 4-bar loop + shaker groove -----------------
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
    o.connect(g).connect(this.stems[S.KICK]); o.start(t); o.stop(t + 0.3);
  }
  private clap(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.7;
    const g = ctx.createGain(); this.env(g, t, 0.55, 0.003, 0.16);
    src.connect(bp).connect(g).connect(this.stems[S.CLAP]); src.start(t); src.stop(t + 0.2);
  }
  private hat(t: number, dec: number, hz: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hz;
    const g = ctx.createGain(); this.env(g, t, 0.3, 0.002, dec);
    src.connect(hp).connect(g).connect(this.stems[S.HATS]); src.start(t); src.stop(t + dec + 0.05);
  }
  private shaker(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain(); this.env(g, t, 0.16, 0.01, 0.09);
    src.connect(hp).connect(g).connect(this.stems[S.FX]); src.start(t); src.stop(t + 0.2);
  }
  private sub(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95, t + 0.02);
    g.gain.setValueAtTime(0.95, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.stems[S.SUB]);
    // sine at root + quieter sub-octave sine → low-end weight felt on any speaker
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi - 12);
    const o2g = ctx.createGain(); o2g.gain.value = 0.6;
    o1.connect(g); o2.connect(o2g).connect(g);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  private bass(t: number, midi: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 6;
    const g = ctx.createGain(); this.env(g, t, 0.8, 0.006, 0.22);
    o.connect(lp).connect(g).connect(this.stems[S.BASS]); o.start(t); o.stop(t + 0.3);
  }
  private chord(t: number, tones: number[]) {
    const ctx = this.ctx!; const dur = SPB * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    g.gain.setValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    lp.connect(g).connect(this.stems[S.CHORDS]);
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
  private arp(t: number, midi: number) {
    const ctx = this.ctx!;
    // short staccato square — clearly distinct from the singing lead
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; lp.Q.value = 3;
    const g = ctx.createGain(); this.env(g, t, 0.26, 0.002, 0.075);
    o.connect(lp).connect(g).connect(this.stems[S.ARP]); o.start(t); o.stop(t + 0.11);
  }
  private lead(t: number, midi: number) {
    const ctx = this.ctx!;
    // longer, brighter saw+tri so the melody sings; sends to the delay for space
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = mtof(midi); o2.detune.value = -6;
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4600;
    const g = ctx.createGain(); this.env(g, t, 0.5, 0.005, 0.42);
    o.connect(mix); o2.connect(mix); mix.connect(lp).connect(g);
    g.connect(this.stems[S.LEAD]); g.connect(this.delayIn);
    o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
  }
  private bells(t: number, midi: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi + 19); o2.detune.value = 3;
    const o2g = ctx.createGain(); o2g.gain.value = 0.4;
    const g = ctx.createGain(); this.env(g, t, 0.5, 0.005, 1.1); // long shimmer
    o.connect(g); o2.connect(o2g).connect(g);
    g.connect(this.stems[S.BELLS]); g.connect(this.delayIn);
    o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
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
    src.connect(bp).connect(g).connect(this.stems[S.FX]); src.start(t); src.stop(t + dur + 0.05);
  }
}

export const scrollSong = new ScrollSong();
