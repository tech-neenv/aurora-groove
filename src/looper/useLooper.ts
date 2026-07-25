import { useEffect, useReducer, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { looper, KEYS, SCALES, INSTRUMENTS, MIC_COLOR, PAD_KEYS, instPadCount, keyPad, ROW_HOME, ROW_TOP } from './looper';

// Shared logic for every loop-station skin (v2/v3/v4). The audio engine is one
// singleton; the skins only differ in how they paint it.

export const SCALE_IDS = Object.keys(SCALES);
export const KROWS: { mod?: { label: string; w: number }; keys: string[]; tail?: { label: string; w: number }[]; sleep?: boolean }[] = [
  { keys: '1234567890'.split(''), sleep: true, tail: [{ label: '⌫', w: 1.6 }] },
  { mod: { label: '⇥', w: 1.5 }, keys: 'qwertyuiop'.split('') },
  { mod: { label: '⇪', w: 1.75 }, keys: 'asdfghjkl'.split(''), tail: [{ label: ';', w: 1 }, { label: "'", w: 1.6 }] },
  { mod: { label: '⇧', w: 2.25 }, keys: 'zxcvbnm'.split(''), tail: [{ label: ',', w: 1 }, { label: '.', w: 1 }, { label: '/', w: 1.6 }] },
];
export { INSTRUMENTS, MIC_COLOR, PAD_KEYS, KEYS, SCALES, instPadCount, keyPad, ROW_HOME, ROW_TOP };

export function useLooper() {
  const [ready, setReady] = useState(false);
  const [, force] = useReducer((x) => x + 1, 0);
  const [tab, setTab] = useState(1);          // 0 = mic, 1..9 instruments
  const [showKeys, setShowKeys] = useState(false);
  const [bpmDraft, setBpmDraft] = useState(84);
  const tabRef = useRef(1);
  const headRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<Record<string, HTMLElement | null>>({});

  const micActive = tab === 0;
  const inst = INSTRUMENTS[Math.max(0, tab - 1)];
  const hue = micActive ? MIC_COLOR : inst.color;
  const count = micActive ? 0 : instPadCount(inst);

  const selectTab = (t: number) => {
    const m = INSTRUMENTS.length + 1;              // 0 = mic, 1..N = instruments
    const n = ((t % m) + m) % m;
    tabRef.current = n; setTab(n);
    if (n === 0) void looper.enableMic().then(force); else looper.disableMic();
  };

  useEffect(() => {
    let raf = 0, alive = true;
    engine.stopIdle();
    looper.init().then(() => { if (alive) { setReady(true); setBpmDraft(looper.bpm); force(); } });
    if (import.meta.env.DEV) (window as unknown as { __looper: typeof looper }).__looper = looper;
    looper.onChange = () => force();
    const tick = () => {
      const pos = looper.posNow;
      if (headRef.current) { const w = headRef.current.parentElement?.clientWidth ?? 0; headRef.current.style.transform = `translateX(${pos * w}px)`; }
      if (waveRef.current) waveRef.current.style.transform = `scaleY(${0.12 + Math.min(1, looper.level * 7) * 0.88})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); looper.onChange = null; };
  }, []);

  const strike = (id: string) => { const el = capRef.current[id]; if (el) { el.classList.add('down'); setTimeout(() => el?.classList.remove('down'), 130); } };
  // the pad (index + note label) a physical key plays on the active instrument, or null if unlit
  const padFor = (char: string) => (micActive ? null : keyPad(inst, char, looper.keyRoot, looper.scaleId));
  const play = (char: string) => {
    const pad = padFor(char);
    if (!pad) return;
    looper.trigger(inst.id, pad.index); strike('k:' + char);
  };
  const commitBpm = () => looper.setTempo(bpmDraft);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (e.altKey) {
        const id = micActive ? 'voice' : inst.id;
        const f = looper.fx[id] ?? { volume: 3, reverb: 0, drive: 0, sustain: 1 };
        if (e.code === 'ArrowUp') looper.setMasterVolume(looper.masterVolume + 1);
        else if (e.code === 'ArrowDown') looper.setMasterVolume(looper.masterVolume - 1);
        else if (e.code === 'ArrowLeft') looper.setInstVolume(id, f.volume - 1);
        else if (e.code === 'ArrowRight') looper.setInstVolume(id, f.volume + 1);
        else if (e.code === 'KeyR') looper.setInstReverb(id, (f.reverb + 1) % 11);
        else if (e.code === 'KeyD') looper.setInstDrive(id, (f.drive + 1) % 11);
        else if (e.code === 'KeyS') looper.setInstSustain(id, (f.sustain + 1) % 11);
        e.preventDefault(); force(); return;
      }
      // Spacebar records. record() is debounced (180ms) so a focused button
      // re-firing on the same press collapses into one — no stutter.
      if (e.code === 'Space') { e.preventDefault(); looper.record(); return; }
      // transport: Enter = play/pause, '.' = stop
      if (e.code === 'Enter' || e.key === 'Enter') { e.preventDefault(); looper.playPause(); force(); return; }
      if (e.key === '.') { e.preventDefault(); looper.stop(); force(); return; }
      if (e.key === 'Tab') { e.preventDefault(); selectTab(tabRef.current + (e.shiftKey ? -1 : 1)); return; }
      if (e.key === 'Backspace') { e.preventDefault(); e.shiftKey ? looper.clear() : looper.undo(); return; }
      if (e.key === '?') { setShowKeys((s) => !s); return; }
      if (e.key === '`') { selectTab(0); return; }
      if (/^[1-9]$/.test(e.key)) { selectTab(+e.key); return; }
      if (e.key === '-') { selectTab(INSTRUMENTS.length - 1); return; }   // 10th instrument (pad)
      if (e.key === '=') { selectTab(INSTRUMENTS.length); return; }       // 11th instrument (bells)
      if (PAD_KEYS.includes(k)) { play(k); return; }
      // key/scale/bpm/bars define the grid every layer is locked to — freeze them
      // once a loop exists (or is recording) so a stray keypress can't wipe the take.
      const gridLocked = looper.layers.length > 0 || looper.recState !== 'idle';
      if (e.key === '[') { if (!gridLocked) looper.setBars(looper.bars - 1); return; }
      if (e.key === ']') { if (!gridLocked) looper.setBars(looper.bars + 1); return; }
      if (e.key === '\\') { looper.toggleMetro(); force(); return; }
      if (e.key === '/') { looper.setQuantize(!looper.quantize); force(); return; }
      if (e.key === "'") { if (!gridLocked) looper.setScale(SCALE_IDS[(SCALE_IDS.indexOf(looper.scaleId) + 1) % SCALE_IDS.length]); return; }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  const rec = looper.recState;
  const lb = looper.loopBeats();
  const recLabel = rec === 'counting' ? (looper.countIn || '·') : rec === 'recording' ? 'REC' : looper.layers.length > 0 ? '＋' : 'REC';
  const fxId = micActive ? 'voice' : inst.id;
  const fxA = looper.fx[fxId] ?? { volume: 3, reverb: 0, drive: 0, sustain: 1 };

  return {
    looper, ready, force, tab, micActive, inst, hue, count, selectTab, padFor,
    bpmDraft, setBpmDraft, commitBpm, showKeys, setShowKeys,
    headRef, waveRef, capRef, strike, play, rec, lb, recLabel, fxId, fxA,
  };
}
export type LooperHook = ReturnType<typeof useLooper>;
