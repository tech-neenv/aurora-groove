// looper-processor — real-time voice/audio looper (mic only; instruments are
// event-based on the main thread so they play instantly and record dead-tight).
//
// The worklet's only job: play committed audio layers on the loop grid, and
// capture the mic into a new layer over an EXPLICIT sample window that starts on
// your downbeat and auto-commits after exactly one loop. No arm/stop round-trip.
//
//   playback: pos = (currentFrame - epoch) mod len ; out = Σ layers[pos]
//   record:   for frame in [recStart, recStart+len): layer[(pos - offset)] = in
//   commit:   at window end, push the buffer, post the new layer count
//
// Latency is compensated by shifting each recorded sample back `offset` frames.

class LooperProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.len = Math.round(sampleRate * 2);
    this.epoch = currentFrame;
    this.offset = 0;
    this.monitor = 0;
    this.layers = [];
    this.gains = [];          // per-voice-layer gain (mute/solo/volume), parallel to layers
    this.playing = 1;         // transport gate — 0 mutes voice playback
    this.recBuf = null;
    this.recStart = -1;
    this.recEnd = -1;
    this.postAcc = 0;
    this.port.onmessage = (e) => this.msg(e.data);
  }

  msg(m) {
    switch (m.type) {
      case 'config': {
        const len = Math.max(128, Math.round(m.len));
        if (len !== this.len) { this.len = len; this.layers = []; this.recBuf = null; this.recStart = -1; }
        if (m.offset != null) this.offset = Math.round(m.offset);
        if (m.epoch != null) this.epoch = Math.round(m.epoch);
        this.port.postMessage({ type: 'layers', n: this.layers.length });
        break;
      }
      case 'record':                    // { startFrame } — capture one loop from startFrame
        this.recBuf = new Float32Array(this.len);
        this.recStart = Math.round(m.startFrame);
        this.recEnd = this.recStart + this.len;
        break;
      case 'cancelRecord': this.recBuf = null; this.recStart = -1; break;
      case 'undo':   this.layers.pop(); this.gains.pop(); this.port.postMessage({ type: 'layers', n: this.layers.length }); break;
      case 'clear':  this.layers = []; this.gains = []; this.recBuf = null; this.recStart = -1; this.port.postMessage({ type: 'layers', n: 0 }); break;
      case 'offset': this.offset = Math.round(m.offset); break;
      case 'monitor':this.monitor = +m.gain || 0; break;
      case 'transport': this.playing = m.playing ? 1 : 0; if (m.epoch != null) this.epoch = Math.round(m.epoch); break;
      case 'setGains': this.gains = (m.gains || []).slice(); break;
      case 'export': // hand back copies of every voice buffer so the session can be saved
        this.port.postMessage({ type: 'exported', buffers: this.layers.map((a) => a.slice()) });
        break;
      case 'load': {  // restore saved voice buffers, fitted to the current loop length
        const len = this.len;
        this.layers = (m.buffers || []).map((a) => {
          const f = Float32Array.from(a);
          if (f.length === len) return f;
          const o = new Float32Array(len); o.set(f.subarray(0, Math.min(f.length, len))); return o;
        });
        this.recBuf = null; this.recStart = -1;
        this.gains = this.layers.map(() => 1);
        this.port.postMessage({ type: 'layers', n: this.layers.length });
        break;
      }
    }
  }

  // downward noise gate/expander — keeps sung notes, silences the quiet hiss
  // between them. Runs on the finished buffer at commit, so it adds NO latency.
  gate(b) {
    const n = b.length, W = 512, frames = Math.ceil(n / W);
    if (frames < 3) return;
    const rms = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let s = 0, c = 0; const st = f * W, en = Math.min(n, st + W);
      for (let i = st; i < en; i++) { s += b[i] * b[i]; c++; }
      rms[f] = Math.sqrt(s / Math.max(1, c));
    }
    const sorted = Array.from(rms).sort((x, y) => x - y);
    const floor = sorted[Math.floor(frames * 0.1)] || 0;   // noise floor = 10th percentile (the quiet bed)
    const thr = floor * 2.0 + 0.004;                        // signal must clear the floor
    const gain = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      const r = rms[f];
      // soft knee, and never fully kill (leave a faint -20dB bed so it breathes, not choppy)
      let g = r >= thr * 2.5 ? 1 : r <= thr ? 0.1 : 0.1 + 0.9 * (r - thr) / (thr * 1.5);
      gain[f] = g < 0.1 ? 0.1 : g > 1 ? 1 : g;
    }
    // fast attack (don't clip note onsets), slow release (don't chop tails)
    for (let f = 1; f < frames; f++) { const a = gain[f] > gain[f - 1] ? 0.6 : 0.06; gain[f] = gain[f - 1] + (gain[f] - gain[f - 1]) * a; }
    for (let i = 0; i < n; i++) {
      const fp = i / W, f0 = Math.floor(fp), f1 = Math.min(frames - 1, f0 + 1), t = fp - f0;
      b[i] *= gain[f0] * (1 - t) + gain[f1] * t;
    }
  }
  // peak envelope (0..1) for the UI waveform — sharp where there's a note, thin where quiet
  envelope(b, K) {
    const n = b.length, out = new Array(K); let max = 1e-6;
    for (let k = 0; k < K; k++) {
      const st = Math.floor(k * n / K), en = Math.floor((k + 1) * n / K); let m = 0;
      for (let i = st; i < en; i++) { const v = b[i] < 0 ? -b[i] : b[i]; if (v > m) m = v; }
      out[k] = m; if (m > max) max = m;
    }
    const norm = Math.max(max, 0.12);   // a near-silent loop stays thin, doesn't blow up
    for (let k = 0; k < K; k++) out[k] = out[k] / norm;
    return out;
  }

  process(inputs, outputs) {
    const inCh = inputs[0] && inputs[0][0];
    const out = outputs[0][0];
    if (!out) return true;
    const len = this.len, N = out.length, layers = this.layers, nL = layers.length;
    const rec = this.recBuf && inCh;
    const play = this.playing, gains = this.gains;
    const startPos = (((currentFrame - this.epoch) % len) + len) % len;

    for (let i = 0; i < N; i++) {
      const frame = currentFrame + i;
      const pos = (startPos + i) % len;
      let s = 0;
      if (play) for (let l = 0; l < nL; l++) { const g = gains[l] == null ? 1 : gains[l]; s += layers[l][pos] * g; }
      if (rec && frame >= this.recStart && frame < this.recEnd) {
        let w = (pos - this.offset) % len; if (w < 0) w += len;
        this.recBuf[w] = inCh[i];
      }
      if (play && this.monitor > 0 && inCh) s += inCh[i] * this.monitor;
      out[i] = s;
    }

    // commit the layer once the window closes
    if (this.recBuf && currentFrame + N >= this.recEnd) {
      const b = this.recBuf;
      this.gate(b);                              // strip room hiss between phrases (zero added latency — offline here)
      const F = Math.min(96, len >> 2);          // declick: short fade at both seam ends
      for (let i = 0; i < F; i++) { const g = i / F; b[i] *= g; b[len - 1 - i] *= g; }
      this.layers.push(b); this.gains.push(1);
      this.recBuf = null; this.recStart = -1;
      this.port.postMessage({ type: 'layers', n: this.layers.length, committed: true, env: this.envelope(b, 128) });
    }

    // loop-boundary + throttled playhead/level for the UI
    if (startPos + N >= len) this.port.postMessage({ type: 'wrap' });
    this.postAcc += N;
    if (this.postAcc >= 1024) {
      this.postAcc = 0;
      let lvl = 0;
      if (inCh) { for (let i = 0; i < N; i++) lvl += inCh[i] * inCh[i]; lvl = Math.sqrt(lvl / N); }
      this.port.postMessage({ type: 'pos', pos: startPos / len, level: lvl, layers: nL });
    }
    return true;
  }
}

registerProcessor('looper-processor', LooperProcessor);
