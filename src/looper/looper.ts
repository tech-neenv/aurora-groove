// The Riyaaz loop station — controller.
//
// Musical magic anyone can make: sing into the mic, or play the built-in
// instruments (drums · bass · keys) — all locked to a key + scale so nothing is
// ever out of tune. Stack bar-locked layers, undo, clear.
//
// Latency design (the whole point):
//   · the loop starts on YOUR downbeat — a 1-bar count-in (1·2·3·4), then it
//     captures exactly one loop and AUTO-COMMITS. No stop-timing lag.
//   · instruments are EVENT-based on the main thread: a tap sounds instantly,
//     and its recorded copy is snapped to the grid — zero lag, perfectly tight.
//   · the voice/mic is raw audio (worklet) so your feel is never quantized.
//   · one shared AudioContext (engine.ensure()) — one sample clock, no drift.

import { engine } from '../audio/engine';
import { kick, snare, hat, ride, rim, tom, shaker, bassNote, voiceNote, guitarBuffer, driveCurve } from '../audio/instruments';

export type RecState = 'idle' | 'counting' | 'recording';
export interface Ev { instId: string; index: number; beat: number; vel: number }
export interface Chan { in: GainNode; shaper: WaveShaperNode; vol: GainNode; post: GainNode; send: GainNode }
export interface FxSnap { volume: number; reverb: number; drive: number; sustain: number }
export interface Layer { kind: 'inst' | 'voice'; events?: Ev[]; color: string; chan?: Chan; sus?: number; fx?: FxSnap; env?: number[];
  mute?: boolean; solo?: boolean; gain?: number }   // gain 0..1 (undefined = full)

// peak envelope (0..1) of a mono buffer — sharp where a note is, thin where quiet
function envelopeOf(f: Float32Array, K = 128): number[] {
  const n = f.length, out: number[] = new Array(K); let max = 1e-6;
  for (let k = 0; k < K; k++) {
    const st = Math.floor(k * n / K), en = Math.floor((k + 1) * n / K); let m = 0;
    for (let i = st; i < en; i++) { const v = Math.abs(f[i]); if (v > m) m = v; }
    out[k] = m; if (m > max) max = m;
  }
  const norm = Math.max(max, 0.12);
  for (let k = 0; k < K; k++) out[k] = out[k] / norm;
  return out;
}

// AudioBuffer → 16-bit PCM WAV blob
function encodeWav(buf: AudioBuffer): Blob {
  const nCh = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + len * nCh * 2), view = new DataView(ab);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + len * nCh * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, nCh, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * nCh * 2, true); view.setUint16(32, nCh * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, len * nCh * 2, true);
  const chans: Float32Array[] = []; for (let c = 0; c < nCh; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nCh; c++) { let v = chans[c][i]; v = v < -1 ? -1 : v > 1 ? 1 : v; view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}
export type SavedLayer =
  | { kind: 'inst'; events: Ev[]; fx: FxSnap }
  | { kind: 'voice'; pcm: string; fx: FxSnap };   // pcm = base64 int16 mono @ loop length
export interface Session { bpm: number; bars: number; keyRoot: number; scaleId: string; quantize: boolean; layers: SavedLayer[] }

// compact voice audio for localStorage: Float32 → Int16 → base64 (≈¼ the JSON size)
function f32ToB64(a: Float32Array): string {
  const n = a.length, i16 = new Int16Array(n);
  for (let i = 0; i < n; i++) { let v = a[i]; v = v < -1 ? -1 : v > 1 ? 1 : v; i16[i] = Math.round(v < 0 ? v * 0x8000 : v * 0x7fff); }
  const bytes = new Uint8Array(i16.buffer); let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
  return btoa(s);
}
function b64ToF32(b64: string): Float32Array {
  const s = atob(b64), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer), n = i16.length, f = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = i16[i]; f[i] = v < 0 ? v / 0x8000 : v / 0x7fff; }
  return f;
}
export interface InstDef {
  id: string; label: string; color: string;
  kind: 'drum' | 'mono' | 'pluck' | 'pad' | 'chord' | 'synth';
  pieces?: string[];                 // drum kit pieces
  base?: number; count?: number; variant?: 'soft' | 'lead';  // acoustic range
  wave?: OscillatorType;             // electronic synth voices
}

export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALES: Record<string, { name: string; steps: number[] }> = {
  pentMajor: { name: 'major pentatonic', steps: [0, 2, 4, 7, 9] },
  pentMinor: { name: 'minor pentatonic', steps: [0, 3, 5, 7, 10] },
  major: { name: 'major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
};
const OFFSET_KEY = 'riyaaz.looper.offsetMs';
const LEAD = 0.16;          // scheduler lookahead (s)

// The instruments — one played at a time (tabbed). Melodic ones span two-plus
// octaves of the current scale, so there's real range, not a few notes.
// ANODIZE KEYBED — each instrument owns one electric-ceramic hue (only ever one
// on the deck at a time). Coral is reserved for the mic; cyan is the house accent.
// The 11 most-used groovebox / MIDI-controller instrument categories — one played
// at a time (tabbed), spanning rhythm · low end · keys · acoustic · synth. Mic = 12th.
export const INSTRUMENTS: InstDef[] = [
  { id: 'drums',   label: 'drums',   color: '#F2C14E', kind: 'drum',  pieces: ['kick', 'snare', 'hat', 'open', 'ride', 'tomL', 'tomH', 'rim', 'shk'] },
  { id: 'bass',    label: 'bass',    color: '#4C6FE0', kind: 'mono',  base: 33, count: 12 },
  { id: '808',     label: '808',     color: '#B15CFF', kind: 'synth', base: 28, count: 12, wave: 'sine' },      // sub / boom (hip-hop)
  { id: 'piano',   label: 'piano',   color: '#EDE7D6', kind: 'pluck', variant: 'soft', base: 60, count: 16 },   // grand
  { id: 'epiano',  label: 'e.piano', color: '#E0954B', kind: 'synth', base: 57, count: 16, wave: 'triangle' },  // rhodes / soul
  { id: 'guitar',  label: 'guitar',  color: '#5AE6A0', kind: 'pluck', variant: 'lead', base: 52, count: 16 },
  { id: 'strings', label: 'strings', color: '#7FB2E8', kind: 'pad',   base: 52, count: 14 },                    // ensemble
  { id: 'brass',   label: 'brass',   color: '#FF8A3D', kind: 'synth', base: 52, count: 14, wave: 'sawtooth' },  // horns
  { id: 'lead',    label: 'lead',    color: '#17D1C3', kind: 'synth', base: 69, count: 16, wave: 'sawtooth' },
  { id: 'pad',     label: 'pad',     color: '#9B8CFF', kind: 'pad',   base: 57, count: 12 },
  { id: 'bells',   label: 'bells',   color: '#C77DFF', kind: 'synth', base: 72, count: 16, wave: 'sine' },      // mallet / glock
];
export const MIC_COLOR = '#FF7A5C';   // the one warm hue — voice only
// keyboard layout for the ACTIVE instrument's pads (home row, then top row)
export const PAD_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const INST_MAP: Record<string, InstDef> = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));
export function instPadCount(inst: InstDef): number { return inst.kind === 'drum' ? (inst.pieces?.length ?? 0) : (inst.count ?? 0); }
export function padLabel(inst: InstDef, index: number, keyRoot: number, scaleId: string): string {
  if (inst.kind === 'drum') return inst.pieces?.[index] ?? '';
  const steps = SCALES[scaleId]?.steps ?? SCALES.pentMajor.steps;
  return KEYS[(keyRoot + steps[index % steps.length] + 1200) % 12];
}

// The two note rows. asdf = the HOME octave (always primary); qwerty = the SAME
// notes one octave UP (finger position transfers). Drums live on asdf only.
export const ROW_HOME = 'asdfghjkl'.split('');
export const ROW_TOP = 'qwertyuiop'.split('');
export function keyPad(inst: InstDef, char: string, keyRoot: number, scaleId: string): { index: number; label: string } | null {
  if (inst.kind === 'drum') {
    const pieces = inst.pieces ?? [];
    const p = ROW_HOME.indexOf(char);
    return p >= 0 && p < pieces.length ? { index: p, label: pieces[p] } : null;
  }
  const steps = SCALES[scaleId]?.steps ?? SCALES.pentMajor.steps;
  const n = steps.length, perRow = n + 1;   // one octave incl. its top root
  const label = (deg: number) => KEYS[(keyRoot + steps[((deg % n) + n) % n] + 1200) % 12];
  const ph = ROW_HOME.indexOf(char);
  if (ph >= 0 && ph < perRow) return { index: ph, label: label(ph) };
  const pt = ROW_TOP.indexOf(char);
  if (pt >= 0 && pt < perRow) { const deg = pt + n; return { index: deg, label: label(deg) }; }
  return null;
}

class Looper {
  ctx!: AudioContext;
  private node: AudioWorkletNode | null = null;
  ready = false;

  private micBus!: GainNode;
  private voiceMakeup!: GainNode;   // recorded voice reads quiet vs synths — makeup on playback
  private exportResolve: ((b: Float32Array[]) => void) | null = null;
  private metro!: GainNode;
  private stream: MediaStream | null = null;
  // output + FX graph
  private master!: GainNode;
  private playGain!: GainNode;                 // transport mute (pause/stop) — 0 or 1
  private limiter!: DynamicsCompressorNode;   // brick-wall so stacked layers never clip → no "brr"
  private revConv!: ConvolverNode;
  private revWet!: GainNode;
  // per-instrument (+ 'voice') LIVE channels (reflect the current knobs = the input
  // preview). Committed layers get their own baked channel so the recorded sound is
  // frozen and later knob changes don't touch it.
  private chans: Record<string, Chan> = {};

  // musical state
  bpm = 84; bpb = 4; bars = 2;
  keyRoot = 0;
  scaleId = 'pentMajor';
  quantize = true;  // "assist" — snap recorded notes to the grid
  metroOn = true;
  micOn = false;
  monitorMic = false;
  offsetFrames = 0;
  // FX state
  masterVolume = 7;  // 0..10 (global output, on top of everything)
  micEC = true;      // echo-cancel ON by default — kills the speaker-feedback "brr"
  // transport — the free clock always runs; these only gate what you HEAR + the playhead
  paused = false;
  stopped = false;
  private frozenPos = 0;
  // per-instrument fx (id → knobs); 'voice' covers the mic layers
  fx: Record<string, { volume: number; reverb: number; drive: number; sustain: number }> = {};

  // free clock (metronome reference)
  private running = false;
  private schedBeat = 0;
  private nextBeatTime = 0;
  private schedTimer: number | null = null;

  // loop (epoch defined on first record)
  loopSet = false;
  private epochBeat = 0;
  private epochTime = 0;

  // record window
  recState: RecState = 'idle';
  countIn = 0;                 // 0 = none, else 1..bpb
  private countStartBeat = 0;
  private recStartBeat = 0;
  private recEndBeat = 0;
  private recEvents: Ev[] = [];

  // layers (unified order for undo). voice audio lives in the worklet.
  layers: Layer[] = [];
  private voiceCount = 0;
  level = 0;

  onChange: (() => void) | null = null;
  onCapture: ((ev: Ev) => void) | null = null;   // fires when an instrument beat lands in the loop while recording

  async init(): Promise<void> {
    if (this.ready) return;
    this.ctx = engine.ensure();
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch { /* gesture pending */ } }
    await this.ctx.audioWorklet.addModule('/looper-processor.js');
    const node = new AudioWorkletNode(this.ctx, 'looper-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.onmessage = (e) => this.onMsg(e.data);
    this.node = node;

    const ctx = this.ctx;
    // master (global volume) → brick-wall limiter → speakers (stacked layers never clip)
    this.master = ctx.createGain();
    this.playGain = ctx.createGain(); this.playGain.gain.value = 1;   // transport mute lives here
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.master.connect(this.playGain).connect(this.limiter).connect(ctx.destination);
    // reverb (generated impulse) — a shared wet return; per-channel send amount
    this.revConv = ctx.createConvolver(); this.revConv.buffer = this.makeImpulse(2.4);
    this.revWet = ctx.createGain(); this.revWet.gain.value = 1; this.revConv.connect(this.revWet).connect(this.master);
    // mic → worklet (recorded). Makeup gain so a normal voice loops back loud enough.
    this.micBus = ctx.createGain(); this.micBus.gain.value = 2.6; this.micBus.connect(node);
    // per-instrument (+ voice) channels
    for (const id of [...INSTRUMENTS.map((i) => i.id), 'voice']) {
      const isLush = id === 'pad' || id === 'strings' || id === 'bells' || id === 'voice';
      this.fx[id] = { volume: id === 'voice' ? 10 : 6, reverb: isLush ? 4 : id === 'drums' ? 0 : 2, drive: 0, sustain: id === '808' ? 6 : isLush ? 5 : 3 };
      this.chans[id] = this.createChannel(this.fx[id]);
    }
    // mic layers play through the voice channel — with a big fixed makeup, since a
    // sung note sits far below a synth's peak. The master limiter keeps it in check.
    this.voiceMakeup = ctx.createGain(); this.voiceMakeup.gain.value = 4.5;
    node.connect(this.voiceMakeup).connect(this.chans.voice.in);
    // metronome (dry, straight to master)
    this.metro = ctx.createGain(); this.metro.gain.value = 0.8; this.metro.connect(this.master);
    this.setMasterVolume(this.masterVolume);

    const savedMs = Number(localStorage.getItem(OFFSET_KEY));
    if (Number.isFinite(savedMs) && savedMs) this.offsetFrames = Math.round((savedMs / 1000) * this.ctx.sampleRate);

    this.ready = true;
    this.startClock();
  }

  // ---- clock ----------------------------------------------------------------
  private spb() { return 60 / this.bpm; }
  loopBeats() { return this.bars * this.bpb; }
  loopSec() { return this.loopBeats() * this.spb(); }
  private loopFrames() { return Math.max(128, Math.round(this.loopSec() * this.ctx.sampleRate)); }

  private startClock() {
    this.nextBeatTime = this.ctx.currentTime + 0.12;
    this.schedBeat = 0;
    this.running = true;
    this.schedule();
  }

  private schedule = () => {
    if (!this.running || !this.ctx) return;
    const spb = this.spb();
    while (this.nextBeatTime < this.ctx.currentTime + LEAD) {
      const beat = this.schedBeat;
      const t = this.nextBeatTime;
      const isBar = ((beat % this.bpb) + this.bpb) % this.bpb === 0;

      // count-in transition: begin recording exactly on recStartBeat
      if (this.recState === 'counting' && beat === this.recStartBeat) this.beginRecord(t);
      // window close: auto-commit the instrument events on recEndBeat
      if (this.recState === 'recording' && beat === this.recEndBeat) this.commitRecord();

      // metronome — only while counting-in or when a loop already exists (no idle ticking).
      // transport pause/stop mutes at the master (playGain), so we keep scheduling here.
      if (this.recState === 'counting' || (this.loopSet && this.metroOn)) this.clickAt(t, isBar);

      // count-in numbers (1..bpb), aligned to audio time
      if (this.recState === 'counting' && beat >= this.countStartBeat && beat < this.recStartBeat) {
        const c = beat - this.countStartBeat + 1;
        window.setTimeout(() => { this.countIn = c; this.emit(); }, Math.max(0, (t - this.ctx.currentTime) * 1000));
      }
      if (this.recState === 'recording' && beat === this.recStartBeat)
        window.setTimeout(() => { this.countIn = 0; this.emit(); }, Math.max(0, (t - this.ctx.currentTime) * 1000));

      // play instrument-event layers: schedule a whole loop at each loop boundary
      if (this.loopSet && ((beat - this.epochBeat) % this.loopBeats() + this.loopBeats()) % this.loopBeats() === 0) {
        for (const L of this.layers) {
          if (L.kind !== 'inst' || !L.events) continue;
          for (const ev of L.events) this.playEvent(ev, t + ev.beat * spb, L);
        }
      }

      this.schedBeat++;
      this.nextBeatTime += spb;
    }
    this.schedTimer = window.setTimeout(this.schedule, 25);
  };

  private clickAt(when: number, accent: boolean) {
    // a clean sine tick (no harsh square-wave transient), soft attack so it reads
    // as "tick", never a thud
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = accent ? 2000 : 1400;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(accent ? 0.32 : 0.2, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g).connect(this.metro); o.start(when); o.stop(when + 0.07);
  }

  // ---- record flow ----------------------------------------------------------
  private nextBarBeatAtLeast(minBeat: number) {
    let b = Math.ceil(minBeat);
    while (((b % this.bpb) + this.bpb) % this.bpb !== 0) b++;
    return b;
  }
  private lastRecordAt = 0;
  record() {
    // debounce: a Space keypress can fire this alongside the browser re-activating
    // a focused control — collapse near-simultaneous calls so key ≡ click exactly.
    const now = performance.now();
    if (now - this.lastRecordAt < 180) return;
    this.lastRecordAt = now;
    this.wake();
    if (this.paused || this.stopped) { this.paused = false; this.stopped = false; this.setPlay(1); this.postTransport(1); }  // recording implies playing
    if (this.recState === 'counting') { this.recState = 'idle'; this.countIn = 0; this.emit(); return; } // cancel
    if (this.recState === 'recording') return;                                                            // let it auto-commit
    const lead = this.schedBeat + 1;
    if (!this.loopSet) {
      this.countStartBeat = this.nextBarBeatAtLeast(lead);
    } else {
      const lb = this.loopBeats();
      let rs = this.epochBeat + Math.ceil((lead + this.bpb - this.epochBeat) / lb) * lb; // next loop boundary w/ a bar of lead
      this.countStartBeat = rs - this.bpb;
      if (this.countStartBeat < lead) { rs += lb; this.countStartBeat = rs - this.bpb; }
    }
    this.recStartBeat = this.countStartBeat + this.bpb;
    this.recEndBeat = this.recStartBeat + this.loopBeats();
    this.recState = 'counting';
    this.emit();
  }
  private beginRecord(t: number) {
    if (!this.loopSet) {
      this.loopSet = true;
      this.epochBeat = this.recStartBeat;
      this.epochTime = t;
      const epochFrame = Math.round(t * this.ctx.sampleRate);
      this.node?.port.postMessage({ type: 'config', len: this.loopFrames(), offset: this.offsetFrames, epoch: epochFrame });
    }
    this.recEvents = [];
    this.recState = 'recording';
    if (this.micOn) this.node?.port.postMessage({ type: 'record', startFrame: Math.round(t * this.ctx.sampleRate) });
    this.emit();
  }
  private commitRecord() {
    if (this.recEvents.length) {
      // freeze the current input config into a dedicated channel for this track
      const snap = { ...this.fx[this.recEvents[0].instId] };
      this.layers.push({ kind: 'inst', events: this.recEvents, color: 'var(--candle)', chan: this.createChannel(snap), sus: 0.35 + snap.sustain * 0.30, fx: snap });
      this.applyLayerMix();   // a fresh layer respects any active solo/mute
    }
    this.recEvents = [];
    this.recState = 'idle';
    this.emit();
  }

  undo() {
    const last = this.layers.pop();
    if (!last) return;
    if (last.kind === 'voice') this.node?.port.postMessage({ type: 'undo' });
    if (last.chan) this.disposeChan(last.chan);
    this.applyLayerMix();   // dropping a soloed layer un-mutes the rest
    this.emit();
  }
  clear() {
    for (const L of this.layers) if (L.chan) this.disposeChan(L.chan);
    this.layers = [];
    this.node?.port.postMessage({ type: 'clear' });
    if (this.recState !== 'idle') { this.recState = 'idle'; this.countIn = 0; }
    this.paused = false; this.stopped = false; this.setPlay(1); this.postTransport(1);   // a fresh loop plays
    this.emit();
  }

  // ---- live instrument taps (instant sound + grid-snapped record) -----------
  private wake() { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }
  private scaleMidi(base: number, degree: number): number {
    const steps = SCALES[this.scaleId]?.steps ?? SCALES.pentMajor.steps;
    const n = steps.length; const oct = Math.floor(degree / n);
    return base + this.keyRoot + steps[((degree % n) + n) % n] + 12 * oct;
  }
  // committed layers play through their OWN baked channel (frozen input config);
  // live taps play through the shared live channel (current knobs = input preview).
  private playEvent(ev: Ev, when: number, layer?: Layer) {
    if (layer?.chan) this.playIndex(ev.instId, ev.index, when, ev.vel, layer.chan.in, layer.sus);
    else this.playIndex(ev.instId, ev.index, when, ev.vel);
  }
  private playIndex(instId: string, index: number, when: number, vel: number, out?: AudioNode, sus?: number, ctx: BaseAudioContext = this.ctx) {
    const inst = INST_MAP[instId]; if (!inst) return;
    const o = out ?? (this.chans[instId]?.in ?? this.master);
    const s = sus ?? this.susMul(instId);
    if (inst.kind === 'drum') this.drumPiece(inst.pieces?.[index] ?? 'kick', when, vel, o, ctx);
    else if (inst.kind === 'mono') bassNote(ctx, when, this.scaleMidi(inst.base ?? 36, index), vel, this.spb() * 0.9 * s, o);
    else if (inst.kind === 'pluck') this.pluck(this.scaleMidi(inst.base ?? 60, index), when, vel, inst.variant ?? 'soft', o, ctx);
    else if (inst.kind === 'pad') voiceNote(ctx, when, this.scaleMidi(inst.base ?? 57, index), vel * 0.9, this.spb() * 1.7 * s, o);
    else if (inst.kind === 'synth') this.synthVoice(this.scaleMidi(inst.base ?? 57, index), when, vel, inst.wave ?? 'sawtooth', o, s, ctx);
    else if (inst.kind === 'chord') for (const d of [index, index + 2, index + 4]) this.pluck(this.scaleMidi(inst.base ?? 45, d), when, vel * 0.75, 'soft', o, ctx);
  }
  // a simple subtractive synth voice (two detuned oscillators → filter → env)
  private synthVoice(midi: number, when: number, vel: number, wave: OscillatorType, out: AudioNode, sus: number, ctx: BaseAudioContext = this.ctx) {
    const soft = wave === 'sine' || wave === 'triangle';   // calm voices — gentle filter, long tail
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = this.spb() * (soft ? 1.4 : 0.9) * sus;
    const o1 = ctx.createOscillator(); o1.type = wave; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = wave; o2.frequency.value = freq * 1.006;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = soft ? 1 : 7;
    const open = soft ? 5000 : 3400, close = soft ? 1400 : 500;
    f.frequency.setValueAtTime(open, when);
    f.frequency.exponentialRampToValueAtTime(close, when + dur * 0.85);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o1.connect(f); o2.connect(f); f.connect(g).connect(out);
    o1.start(when); o1.stop(when + dur + 0.05); o2.start(when); o2.stop(when + dur + 0.05);
  }
  // ---- FX (per-instrument channel + master) ---------------------------------
  private makeImpulse(dur: number, ctx: BaseAudioContext = this.ctx): AudioBuffer {
    const sr = ctx.sampleRate, len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return buf;
  }
  // 0..10 knobs mapped to a WIDE, obviously-audible range
  private susMul(id: string) { return 0.35 + (this.fx[id]?.sustain ?? 4) * 0.30; }   // 0→0.35s … 10→3.35s
  private volGain(v: number) { return v <= 0 ? 0 : Math.pow(v / 10, 1.5) * 1.7; }      // 0→silent, 5→0.6, 10→1.7
  private applyChanFx(c: Chan, f: { volume: number; reverb: number; drive: number; sustain: number }, ramp = true) {
    const t = this.ctx.currentTime; const vg = this.volGain(f.volume), sg = (f.reverb / 10) * 0.95;   // 10 = drenched
    if (ramp) { c.vol.gain.setTargetAtTime(vg, t, 0.02); c.send.gain.setTargetAtTime(sg, t, 0.02); }
    else { c.vol.gain.setValueAtTime(vg, t); c.send.gain.setValueAtTime(sg, t); }
    c.shaper.curve = (f.drive === 0 ? null : driveCurve(0.06 + f.drive * 0.11)) as WaveShaperNode['curve'];  // 1 = light … 10 = crushed
  }
  private applyChan(id: string) { const c = this.chans[id], f = this.fx[id]; if (c && f) this.applyChanFx(c, f); }
  private createChannel(f: { volume: number; reverb: number; drive: number; sustain: number }): Chan {
    const ctx = this.ctx;
    const inN = ctx.createGain(), shaper = ctx.createWaveShaper(), vol = ctx.createGain(), post = ctx.createGain(), send = ctx.createGain();
    // in → drive → fx-volume → layer-post → master ; reverb send taps post (so layer mute/vol kills its reverb too)
    inN.connect(shaper).connect(vol).connect(post).connect(this.master);
    send.gain.value = 0; post.connect(send).connect(this.revConv);
    const c: Chan = { in: inN, shaper, vol, post, send };
    this.applyChanFx(c, f, false);
    return c;
  }
  private disposeChan(c: Chan) { try { c.in.disconnect(); c.shaper.disconnect(); c.vol.disconnect(); c.post.disconnect(); c.send.disconnect(); } catch { /* already gone */ } }
  setMasterVolume(v: number) { this.masterVolume = Math.max(0, Math.min(10, Math.round(v))); const g = this.masterVolume <= 0 ? 0 : Math.pow(this.masterVolume / 10, 1.4) * 1.35; this.master?.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02); this.emit(); }
  setInstVolume(id: string, v: number) { if (this.fx[id]) { this.fx[id].volume = Math.max(0, Math.min(10, Math.round(v))); this.applyChan(id); this.emit(); } }
  setInstReverb(id: string, a: number) { if (this.fx[id]) { this.fx[id].reverb = Math.max(0, Math.min(10, Math.round(a))); this.applyChan(id); this.emit(); } }
  setInstDrive(id: string, a: number) { if (this.fx[id]) { this.fx[id].drive = Math.max(0, Math.min(10, Math.round(a))); this.applyChan(id); this.emit(); } }
  setInstSustain(id: string, a: number) { if (this.fx[id]) { this.fx[id].sustain = Math.max(0, Math.min(10, Math.round(a))); this.emit(); } }

  // ---- transport (play / pause / stop / restart) ----------------------------
  private postTransport(playing: 0 | 1) { this.node?.port.postMessage({ type: 'transport', playing }); }
  private setPlay(g: number) { this.playGain?.gain.setTargetAtTime(g, this.ctx.currentTime, 0.015); }
  pause() { if (!this.loopSet || this.paused || this.stopped) return; this.frozenPos = this.posNowLive(); this.paused = true; this.setPlay(0); this.postTransport(0); this.emit(); }
  resume() { if (!this.paused) return; this.paused = false; this.setPlay(1); this.postTransport(1); this.emit(); }
  stop() { if (!this.loopSet) return; this.stopped = true; this.paused = false; this.frozenPos = 0; this.setPlay(0); this.postTransport(0); this.emit(); }
  restart() {                       // jump the loop to bar 1 and play
    if (!this.loopSet) return;
    const spb = this.spb();
    this.epochBeat = Math.ceil((this.schedBeat + 1) / this.bpb) * this.bpb;
    this.epochTime = this.nextBeatTime + (this.epochBeat - this.schedBeat) * spb;
    this.stopped = false; this.paused = false; this.setPlay(1);
    this.node?.port.postMessage({ type: 'config', len: this.loopFrames(), offset: this.offsetFrames, epoch: Math.round(this.epochTime * this.ctx.sampleRate) });
    this.postTransport(1); this.emit();
  }
  playPause() { if (this.stopped) this.restart(); else if (this.paused) this.resume(); else this.pause(); }

  // ---- per-layer mixer (mute / solo / volume) — non-destructive -------------
  layerName(i: number): string {
    const L = this.layers[i]; if (!L) return '';
    if (L.kind === 'voice') return 'voice';
    return INST_MAP[L.events?.[0]?.instId ?? '']?.label ?? 'layer';
  }
  private applyLayerMix() {
    const anySolo = this.layers.some((L) => L.solo);
    const voiceGains: number[] = [];
    for (const L of this.layers) {
      const on = anySolo ? !!L.solo : !L.mute;
      const g = on ? (L.gain ?? 1) : 0;
      if (L.kind === 'inst' && L.chan) L.chan.post.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
      else if (L.kind === 'voice') voiceGains.push(g);
    }
    this.node?.port.postMessage({ type: 'setGains', gains: voiceGains });   // voice buffers, in order
  }
  setLayerMute(i: number, on: boolean) { if (this.layers[i]) { this.layers[i].mute = on; this.applyLayerMix(); this.emit(); } }
  setLayerSolo(i: number, on: boolean) { if (this.layers[i]) { this.layers[i].solo = on; this.applyLayerMix(); this.emit(); } }
  setLayerVolume(i: number, v: number) { if (this.layers[i]) { this.layers[i].gain = Math.max(0, Math.min(1, v / 10)); this.applyLayerMix(); this.emit(); } }
  layerVol(i: number): number { const g = this.layers[i]?.gain; return g == null ? 10 : Math.round(g * 10); }

  // ---- sessions (save / load / play-all) ------------------------------------
  // pull every committed voice buffer out of the worklet (async round-trip)
  private exportVoice(): Promise<Float32Array[]> {
    return new Promise((res) => {
      if (!this.node) { res([]); return; }
      this.exportResolve = res;
      this.node.port.postMessage({ type: 'export' });
      window.setTimeout(() => { if (this.exportResolve) { this.exportResolve = null; res([]); } }, 500);
    });
  }
  // full session incl. voice audio — instrument layers keep note-events, voice
  // layers carry compact base64 PCM. Order preserved so undo/visuals stay right.
  async snapshotSession(): Promise<Session> {
    const voiceBufs = await this.exportVoice();
    let vi = 0;
    const layers: SavedLayer[] = [];
    for (const L of this.layers) {
      if (L.kind === 'inst' && L.events && L.fx) layers.push({ kind: 'inst', events: L.events.map((e) => ({ ...e })), fx: { ...L.fx } });
      else if (L.kind === 'voice') { const buf = voiceBufs[vi++]; if (buf) layers.push({ kind: 'voice', pcm: f32ToB64(buf), fx: { ...this.fx.voice } }); }
    }
    return { bpm: this.bpm, bars: this.bars, keyRoot: this.keyRoot, scaleId: this.scaleId, quantize: this.quantize, layers };
  }
  private fitLen(a: Float32Array, len: number): Float32Array {
    if (a.length === len) return a;
    const out = new Float32Array(len); out.set(a.subarray(0, Math.min(a.length, len))); return out;
  }
  loadSession(s: Session) {
    this.wake();
    this.clear();
    this.bpm = s.bpm; this.bars = Math.max(1, s.bars); this.keyRoot = s.keyRoot; this.scaleId = s.scaleId; this.quantize = s.quantize;
    const spb = 60 / this.bpm;
    this.epochBeat = Math.ceil((this.schedBeat + 1) / this.bpb) * this.bpb;   // establish a loop without recording
    this.epochTime = this.nextBeatTime + (this.epochBeat - this.schedBeat) * spb;
    this.loopSet = true;
    const len = this.loopFrames();
    this.node?.port.postMessage({ type: 'config', len, offset: this.offsetFrames, epoch: Math.round(this.epochTime * this.ctx.sampleRate) });
    const voiceBufs: Float32Array[] = [];
    for (const l of s.layers) {
      const kind = (l as SavedLayer).kind ?? 'inst';   // legacy saves have no kind → instrument
      if (kind === 'voice') {
        const buf = this.fitLen(b64ToF32((l as { pcm: string }).pcm), len);
        voiceBufs.push(buf);
        this.layers.push({ kind: 'voice', color: 'var(--sage)', env: envelopeOf(buf) });
      } else {
        const il = l as { events: Ev[]; fx: FxSnap };
        this.layers.push({ kind: 'inst', events: il.events, fx: il.fx, chan: this.createChannel(il.fx), sus: 0.35 + il.fx.sustain * 0.30, color: 'var(--candle)' });
      }
    }
    if (voiceBufs.length) this.node?.port.postMessage({ type: 'load', buffers: voiceBufs });
    this.voiceCount = voiceBufs.length;
    this.emit();
  }

  // ---- export: bounce the whole groove to a WAV (offline, N loops) -----------
  async exportWav(loops = 4): Promise<Blob> {
    const sr = this.ctx.sampleRate;
    const loopBeats = this.loopBeats(), spb = this.spb(), loopSec = this.loopSec();
    const off = new OfflineAudioContext(2, this.loopFrames() * loops + Math.ceil(sr * 0.4), sr);
    // master → limiter → out ; shared reverb return
    const master = off.createGain();
    master.gain.value = this.masterVolume <= 0 ? 0 : Math.pow(this.masterVolume / 10, 1.4) * 1.35;
    const lim = off.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    master.connect(lim).connect(off.destination);
    const rev = off.createConvolver(); rev.buffer = this.makeImpulse(2.4, off);
    rev.connect(master);
    const anySolo = this.layers.some((L) => L.solo);
    const voiceBufs = await this.exportVoice();
    let vi = 0;
    for (const L of this.layers) {
      const on = anySolo ? !!L.solo : !L.mute;
      const lg = on ? (L.gain ?? 1) : 0;
      if (L.kind === 'inst' && L.events && L.fx) {
        if (lg === 0) continue;
        const f = L.fx;
        const inN = off.createGain(), shaper = off.createWaveShaper(), vol = off.createGain(), post = off.createGain(), send = off.createGain();
        inN.connect(shaper).connect(vol).connect(post).connect(master); post.connect(send).connect(rev);
        vol.gain.value = this.volGain(f.volume); send.gain.value = (f.reverb / 10) * 0.95; post.gain.value = lg;
        shaper.curve = (f.drive === 0 ? null : driveCurve(0.06 + f.drive * 0.11)) as WaveShaperNode['curve'];
        const sus = L.sus ?? (0.35 + f.sustain * 0.30);
        for (let k = 0; k < loops; k++) for (const ev of L.events) this.playIndex(ev.instId, ev.index, (k * loopBeats + ev.beat) * spb, ev.vel, inN, sus, off);
      } else if (L.kind === 'voice') {
        const buf = voiceBufs[vi++]; if (!buf || lg === 0) continue;
        const ab = off.createBuffer(1, buf.length, sr); ab.getChannelData(0).set(buf);
        const vf = this.fx.voice;
        const mk = off.createGain(); mk.gain.value = 4.5 * lg * this.volGain(vf.volume);
        const send = off.createGain(); send.gain.value = (vf.reverb / 10) * 0.95;
        mk.connect(master); mk.connect(send).connect(rev);
        for (let k = 0; k < loops; k++) { const s = off.createBufferSource(); s.buffer = ab; s.connect(mk); s.start(k * loopSec); }
      }
    }
    const rendered = await off.startRendering();
    return encodeWav(rendered);
  }

  // voice audio <-> WAV — for cloud storage (upload a WAV file, not base64 in a DB row)
  voicePcmToWav(pcmB64: string): Blob {
    const f = b64ToF32(pcmB64);
    const buf = this.ctx.createBuffer(1, Math.max(1, f.length), this.ctx.sampleRate);
    buf.getChannelData(0).set(f);
    return encodeWav(buf);
  }
  async wavToPcm(ab: ArrayBuffer): Promise<string> {
    const buf = await this.ctx.decodeAudioData(ab.slice(0));
    return f32ToB64(buf.getChannelData(0));
  }

  private drumPiece(name: string, when: number, vel: number, out: AudioNode, ctx: BaseAudioContext = this.ctx) {
    switch (name) {
      case 'kick': kick(ctx, when, vel, out); break;
      case 'snare': snare(ctx, when, vel, out); break;
      case 'hat': hat(ctx, when, vel * 0.8, out); break;
      case 'open': hat(ctx, when, vel * 0.7, out, true); break;
      case 'ride': ride(ctx, when, vel * 0.7, out); break;
      case 'tomL': tom(ctx, when, vel, out, false); break;
      case 'tomH': tom(ctx, when, vel, out, true); break;
      case 'rim': rim(ctx, when, vel, out); break;
      default: shaker(ctx, when, vel * 0.8, out);
    }
  }
  private pluck(midi: number, when: number, vel: number, variant: 'soft' | 'lead', out: AudioNode, ctx: BaseAudioContext = this.ctx) {
    const buf = guitarBuffer(ctx, midi, variant);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.75 * vel;
    s.connect(g).connect(out); s.start(when);
  }
  private capture(instId: string, index: number, vel: number) {
    if (this.recState !== 'recording') return;
    const lb = this.loopBeats();
    let beat = ((this.ctx.currentTime - this.epochTime) / this.spb()) % lb;
    if (beat < 0) beat += lb;
    if (this.quantize) beat = Math.round(beat * 4) / 4;       // snap to the 16th grid
    if (beat >= lb) beat -= lb;
    this.recEvents.push({ instId, index, beat, vel });
  }
  // play a pad of the given instrument: instant sound + grid-snapped record
  trigger(instId: string, index: number, vel = 0.9) {
    this.wake();
    this.playIndex(instId, index, this.ctx.currentTime + 0.004, vel);
    this.capture(instId, index, vel);
  }

  // ---- config ---------------------------------------------------------------
  private resetLoop() {
    this.loopSet = false; this.layers = []; this.voiceCount = 0;
    this.recState = 'idle'; this.countIn = 0; this.recEvents = [];
    this.node?.port.postMessage({ type: 'clear' });
    this.node?.port.postMessage({ type: 'config', len: this.loopFrames(), offset: this.offsetFrames });
    this.emit();
  }
  // start a blank Stage — clears layers AND resets the grid to defaults (unlocks it)
  newSession() {
    for (const L of this.layers) if (L.chan) this.disposeChan(L.chan);
    this.layers = []; this.voiceCount = 0;
    this.bpm = 84; this.bars = 2; this.keyRoot = 0; this.scaleId = 'pentMajor'; this.quantize = true;
    this.loopSet = false; this.recState = 'idle'; this.countIn = 0; this.recEvents = [];
    this.paused = false; this.stopped = false; this.setPlay(1);
    this.node?.port.postMessage({ type: 'clear' });
    this.node?.port.postMessage({ type: 'config', len: this.loopFrames(), offset: this.offsetFrames });
    this.emit();
  }
  setTempo(bpm: number) { this.bpm = Math.round(Math.max(50, Math.min(180, bpm))); this.resetLoop(); }
  setBars(bars: number) { this.bars = Math.max(1, Math.min(8, Math.round(bars))); this.resetLoop(); }
  setKey(root: number) { this.keyRoot = ((root % 12) + 12) % 12; this.emit(); }
  setScale(id: string) { if (SCALES[id]) { this.scaleId = id; this.emit(); } }
  setQuantize(on: boolean) { this.quantize = on; this.emit(); }
  toggleMetro() { this.metroOn = !this.metroOn; this.emit(); }
  setMonitorMic(on: boolean) { this.monitorMic = on; this.node?.port.postMessage({ type: 'monitor', gain: on ? 1 : 0 }); this.emit(); }

  async enableMic(): Promise<boolean> {
    if (this.micOn) return true;
    return this.openMic();
  }
  // for mic-as-instrument-0: leaving the mic tab releases the microphone
  disableMic() {
    if (!this.micOn) return;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.micOn = false; this.emit();
  }
  private async openMic(): Promise<boolean> {
    try {
      // echoCancellation/noiseSuppression ON when the player is on speakers (kills
      // the loop-feedback "brrr"); OFF for headphones = cleanest voice.
      const ec = this.micEC;
      // noiseSuppression always ON — the browser's is near-zero latency and cleans hiss/hum.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: ec, noiseSuppression: true, autoGainControl: false } });
      const src = this.ctx.createMediaStreamSource(stream);
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 100;  // kill rumble/DC/plosive
      const comp = this.ctx.createDynamicsCompressor();                                            // tame clipping
      comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
      src.connect(hp).connect(comp).connect(this.micBus);
      this.stream = stream; this.micOn = true; this.emit(); return true;
    } catch { return false; }
  }
  // toggle speaker-bleed rejection (re-opens the mic with echo cancellation)
  setMicBleedReject(on: boolean) {
    this.micEC = on;
    if (this.micOn) { this.stream?.getTracks().forEach((t) => t.stop()); this.micOn = false; void this.openMic(); }
    this.emit();
  }

  // ---- latency compensation -------------------------------------------------
  setOffsetMs(ms: number) {
    this.offsetFrames = Math.round((ms / 1000) * this.ctx.sampleRate);
    localStorage.setItem(OFFSET_KEY, String(ms));
    this.node?.port.postMessage({ type: 'offset', offset: this.offsetFrames });
    this.emit();
  }
  get offsetMs(): number { return this.ctx ? Math.round((this.offsetFrames / this.ctx.sampleRate) * 1000) : 0; }
  async calibrate(): Promise<number | null> {
    if (!this.micOn || !this.stream) return null;
    const ctx = this.ctx;
    const an = ctx.createAnalyser(); an.fftSize = 512;
    const src = ctx.createMediaStreamSource(this.stream); src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const rms = () => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
    const deltas: number[] = [];
    for (let n = 0; n < 5; n++) {
      const fire = ctx.currentTime + 0.12; this.clickAt(fire, true);
      const t0 = performance.now() + (fire - ctx.currentTime) * 1000;
      const base = rms(); let hitAt = -1; const deadline = performance.now() + 400;
      await new Promise<void>((res) => { const poll = () => { const now = performance.now(); if (now >= t0 && rms() > base * 4 + 0.01 && hitAt < 0) hitAt = now; if (hitAt > 0 || now > deadline) return res(); requestAnimationFrame(poll); }; requestAnimationFrame(poll); });
      if (hitAt > 0) deltas.push(hitAt - t0);
      await new Promise((r) => setTimeout(r, 220));
    }
    an.disconnect(); src.disconnect();
    if (!deltas.length) return null;
    deltas.sort((a, b) => a - b);
    const med = Math.round(deltas[deltas.length >> 1]);
    this.setOffsetMs(med);
    return med;
  }

  // ---- reads for the UI -----------------------------------------------------
  get posNow(): number {
    if (this.stopped) return 0;
    if (this.paused) return this.frozenPos;
    return this.posNowLive();
  }
  private posNowLive(): number {
    if (!this.loopSet || !this.ctx) return 0;
    let p = ((this.ctx.currentTime - this.epochTime) / this.loopSec()) % 1;
    return p < 0 ? p + 1 : p;
  }
  get transportState(): 'playing' | 'paused' | 'stopped' { return this.stopped ? 'stopped' : this.paused ? 'paused' : 'playing'; }

  private onMsg(d: { type: string; n?: number; committed?: boolean; level?: number; buffers?: Float32Array[]; env?: number[] }) {
    if (d.type === 'pos') { this.level = d.level ?? 0; }
    else if (d.type === 'exported') { const r = this.exportResolve; this.exportResolve = null; r?.(d.buffers ?? []); }
    else if (d.type === 'layers') {
      const n = d.n ?? 0;
      if (n > this.voiceCount && d.committed) { this.layers.push({ kind: 'voice', color: 'var(--sage)', env: d.env }); this.applyLayerMix(); }
      this.voiceCount = n;
      this.emit();
    }
  }
  private emit() { this.onChange?.(); }
}

export const looper = new Looper();
