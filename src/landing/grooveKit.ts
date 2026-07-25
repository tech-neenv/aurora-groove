// Layered "grooves you know the vibe of" — the showpiece cards.
//
// Each groove is an ORIGINAL multi-layer arrangement in a popular pop/EDM style
// (synthwave, festival, tropical, future-bass, anthem, chill). Press play and
// the layers STACK IN one per bar — drums → bass → chords → arp → pad → lead →
// perc → fx — up to 8 deep, then the full mix plays out. Synthesised live on the
// studio's shared AudioContext. No copyrighted melodies — these evoke the genre,
// they don't reproduce any specific song.

import { engine } from '../audio/engine';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Chord { root: number; tones: number[] }
export interface Groove {
  name: string; style: string; tempo: number; four: boolean; layers: number; prog: Chord[];
}

// All 8 possible layers, in stack order. A groove uses the first `layers` of them.
export const LAYER_NAMES = ['drums', 'bass', 'chords', 'arp', 'pad', 'lead', 'perc', 'fx'] as const;

export const GROOVES: Groove[] = [
  { name: 'Midnight Drive', style: 'synthwave', tempo: 116, four: true, layers: 6,
    prog: [{ root: 33, tones: [69, 72, 76] }, { root: 29, tones: [65, 69, 72] }, { root: 36, tones: [64, 67, 72] }, { root: 31, tones: [67, 71, 74] }] },
  { name: 'Festival Sky', style: 'big-room', tempo: 128, four: true, layers: 8,
    prog: [{ root: 33, tones: [69, 72, 76] }, { root: 29, tones: [65, 69, 72] }, { root: 36, tones: [67, 72, 76] }, { root: 31, tones: [62, 67, 71] }] },
  { name: 'Golden Hour', style: 'tropical pop', tempo: 112, four: true, layers: 6,
    prog: [{ root: 36, tones: [67, 72, 76] }, { root: 31, tones: [67, 71, 74] }, { root: 33, tones: [69, 72, 76] }, { root: 29, tones: [65, 69, 72] }] },
  { name: 'Neon Heartbeat', style: 'future bass', tempo: 150, four: true, layers: 7,
    prog: [{ root: 34, tones: [70, 73, 77] }, { root: 39, tones: [66, 70, 73] }, { root: 32, tones: [68, 71, 75] }, { root: 37, tones: [64, 68, 71] }] },
  { name: 'City Lights', style: 'pop anthem', tempo: 120, four: false, layers: 6,
    prog: [{ root: 36, tones: [64, 67, 72] }, { root: 31, tones: [62, 67, 71] }, { root: 33, tones: [69, 72, 76] }, { root: 29, tones: [65, 69, 72] }] },
  { name: 'Afterglow', style: 'chill pop', tempo: 100, four: false, layers: 5,
    prog: [{ root: 29, tones: [65, 69, 72] }, { root: 36, tones: [64, 67, 72] }, { root: 33, tones: [69, 72, 76] }, { root: 31, tones: [67, 71, 74] }] },
];

// step patterns (16 per bar) ---------------------------------------------------
const FOUR = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const BACK = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]; // kick 1 & 3
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]; // 2 & 4
const HAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
const BASSP = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
const ARP = [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2];
const LEADP = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0];
const PERC = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface GrooveHandle { stop(): void }

// Plays `g`, stacking one layer in per bar, then letting the full mix ride.
// `onLayers` reports which layers are currently audible (for the card UI).
export function playGroove(g: Groove, cb: { onLayers?: (active: boolean[]) => void; onEnd?: () => void }): GrooveHandle {
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') void ctx.resume();

  const spb = 60 / g.tempo, step = spb / 4;
  const bars = g.layers + 3;                 // stack in, then play out
  const totalSteps = bars * 16;

  const master = ctx.createGain(); master.gain.value = 0.0001;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  const gains = LAYER_NAMES.map(() => { const gn = ctx.createGain(); gn.gain.value = 0.0001; gn.connect(master); return gn; });

  const t0 = ctx.currentTime + 0.06;
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.32, t0 + 0.1);

  const active = LAYER_NAMES.map(() => false);
  let sched = 0, stopped = false, timer: number | null = null;

  const env = (gn: GainNode, t: number, peak: number, atk: number, dec: number) => {
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(peak, t + atk); gn.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
  };
  const noise = () => { const b = ctx.createBuffer(1, 4096, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; return s; };

  const kick = (t: number, dst: GainNode) => { const o = ctx.createOscillator(); const gn = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11); env(gn, t, 1, 0.004, 0.22); o.connect(gn).connect(dst); o.start(t); o.stop(t + 0.3); };
  const snare = (t: number, dst: GainNode) => { const s = noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; const gn = ctx.createGain(); env(gn, t, 0.5, 0.003, 0.15); s.connect(bp).connect(gn).connect(dst); s.start(t); s.stop(t + 0.2); };
  const hat = (t: number, dst: GainNode) => { const s = noise(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; const gn = ctx.createGain(); env(gn, t, 0.22, 0.002, 0.03); s.connect(hp).connect(gn).connect(dst); s.start(t); s.stop(t + 0.08); };
  const perc = (t: number, dst: GainNode) => { const s = noise(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000; const gn = ctx.createGain(); env(gn, t, 0.16, 0.005, 0.06); s.connect(hp).connect(gn).connect(dst); s.start(t); s.stop(t + 0.12); };
  const bass = (t: number, midi: number, dst: GainNode) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 6; const gn = ctx.createGain(); env(gn, t, 0.85, 0.006, 0.2); o.connect(lp).connect(gn).connect(dst); o.start(t); o.stop(t + 0.3); };
  const supersaw = (t: number, tones: number[], dur: number, dst: GainNode) => { const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.4, t + 0.08); gn.gain.setValueAtTime(0.4, t + dur * 0.7); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(gn).connect(dst); for (const m of tones) for (const det of [-9, 0, 9]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.detune.value = det; const vg = ctx.createGain(); vg.gain.value = 0.1; o.connect(vg).connect(lp); o.start(t); o.stop(t + dur + 0.05); } };
  const pad = (t: number, tones: number[], dur: number, dst: GainNode) => { const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.3); gn.gain.setValueAtTime(0.22, t + dur * 0.7); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(gn).connect(dst); for (const m of tones) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); const vg = ctx.createGain(); vg.gain.value = 0.16; o.connect(vg).connect(lp); o.start(t); o.stop(t + dur + 0.05); } };
  const pluck = (t: number, midi: number, dst: GainNode) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi); const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = mtof(midi); o2.detune.value = 6; const mix = ctx.createGain(); mix.gain.value = 0.5; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; const gn = ctx.createGain(); env(gn, t, 0.34, 0.004, 0.24); o.connect(mix); o2.connect(mix); mix.connect(lp).connect(gn).connect(dst); o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3); };
  const lead = (t: number, midi: number, dst: GainNode) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 2; const gn = ctx.createGain(); env(gn, t, 0.3, 0.01, 0.3); o.connect(lp).connect(gn).connect(dst); o.start(t); o.stop(t + 0.4); };
  const riser = (t: number, dur: number, dst: GainNode) => { const s = noise(); s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur); const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.2, t + dur * 0.9); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(bp).connect(gn).connect(dst); s.start(t); s.stop(t + dur + 0.05); };

  const activate = (li: number, t: number) => { if (active[li]) return; active[li] = true; gains[li].gain.setTargetAtTime(0.9, t, 0.15); cb.onLayers?.(active.slice()); };

  const scheduleStep = (gs: number, t: number) => {
    const bar = Math.floor(gs / 16), s = gs % 16;
    const chord = g.prog[bar % g.prog.length];
    // stack a new layer in at the top of each bar
    if (s === 0 && bar < g.layers) activate(bar, t);

    if (active[0]) { // drums
      if ((g.four ? FOUR : BACK)[s]) kick(t, gains[0]);
      if (!g.four && SNARE[s]) snare(t, gains[0]);
      if (g.four && SNARE[s]) snare(t, gains[0]);
      if (HAT[s]) hat(t, gains[0]);
    }
    if (active[1] && BASSP[s]) bass(t, chord.root, gains[1]);
    if (active[2] && s === 0) supersaw(t, chord.tones, spb * 4, gains[2]);
    if (active[3]) { const d = ARP[s]; if (s % 2 === 0 || d) pluck(t, chord.tones[d % chord.tones.length] + 12, gains[3]); }
    if (active[4] && s === 0) pad(t, chord.tones.map((m) => m - 12), spb * 4, gains[4]);
    if (active[5] && LEADP[s]) lead(t, chord.tones[(s * 2) % chord.tones.length] + 12, gains[5]);
    if (active[6] && PERC[s]) perc(t, gains[6]);
    if (active[7] && gs === totalSteps - 16) riser(t, spb * 4, gains[7]);
  };

  const tick = () => {
    if (stopped) return;
    while (sched < totalSteps && (t0 + sched * step) < ctx.currentTime + 0.12) {
      scheduleStep(sched, t0 + sched * step); sched++;
    }
    if (sched >= totalSteps) { finish(); return; }
    timer = window.setTimeout(tick, 25);
  };
  const finish = () => {
    if (stopped) return; stopped = true;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0.0001, t, 0.2);
    setTimeout(() => { try { master.disconnect(); } catch { /* already gone */ } cb.onEnd?.(); }, 600);
  };
  tick();

  return {
    stop() {
      if (stopped) return; stopped = true;
      if (timer != null) clearTimeout(timer);
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0.0001, t, 0.12);
      setTimeout(() => { try { master.disconnect(); } catch { /* already gone */ } cb.onEnd?.(); }, 400);
    },
  };
}
