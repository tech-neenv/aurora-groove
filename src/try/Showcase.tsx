import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Lenis from 'lenis';
import { ShowcaseScene } from './showcaseScene';
import { zeroAudio, type LayerIndex } from './zeroAudio';
import './showcase.css';

// /try3 — THE SHOWCASE. Long editorial product reveal: a revolving iPad running
// the Studio; instruments fly in and merge with spark-blasts; a title per act
// comes and goes. Aurora Groove brand, ORYZO-style structure.

const ACTS = [
  { kick: 'AURORA GROOVE', head: 'MAKE\nCHAOS\nSING', body: 'Scroll. Every push detonates a layer. Watch the storm build a track out of nothing.' },
  { kick: '01 · PULSE', head: 'IGNITE\nTHE CORE', body: 'The first beat cracks the core open. The field starts to spin.' },
  { kick: '02 · WEIGHT', head: 'DROP\nTHE WEIGHT', body: 'Low end lands like gravity. Everything bends toward the centre.' },
  { kick: '03 · LIGHT', head: 'BEND\nTHE LIGHT', body: 'Harmony floods in and the whole storm changes colour.' },
  { kick: '04 · GRID', head: 'SHATTER\nTHE GRID', body: 'Shards break loose and tumble. The groove goes feral.' },
  { kick: '05 · SPIN', head: 'SPIN IT\nFASTER', body: 'Movement spirals up. The vortex tightens and screams.' },
  { kick: '06 · TEAR', head: 'TEAR\nIT OPEN', body: 'A voice rips through the noise — the hook that makes it yours.' },
  { kick: '07 · FLOOD', head: 'FLOOD\nTHE VOID', body: 'Atmosphere drowns the gaps. The whole void is alive now.' },
  { kick: '08 · DETONATE', head: 'BLOW IT\nALL UP', body: 'Everything you stacked detonates into one relentless track.' },
  { kick: 'AURORA GROOVE', head: 'YOU MADE\nTHE STORM', body: 'Eight layers of chaos, one track — built by scrolling. Now make your own.' },
];
const ACT_P = (i: number) => 0.08 + i * 0.095;   // chaos layer i detonates around here (i 0..7)

const clamp = (x: number) => Math.min(1, Math.max(0, x));
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

export default function Showcase() {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (reduce || !hasWebGL()) return <ShowcaseFallback />;
  return <ShowcaseFlight />;
}

function ShowcaseFlight() {
  const nav = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [act, setAct] = useState(0);
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const merged = useRef<boolean[]>(Array(8).fill(false));

  useEffect(() => {
    zeroAudio.reset();
    const scene = new ShowcaseScene(canvasRef.current!);
    const lenis = new Lenis({ duration: 1.3, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
    let raf = 0, alive = true, e0 = 0, last = 0, lastAct = -1, lastCount = 0, lastDone = false;
    let mx = 0, my = 0;

    const prog = () => { const lim = (lenis as unknown as { limit: number }).limit; const p = lenis.progress; if (!lim || lim <= 0 || !Number.isFinite(p)) return 0; return clamp(p); };

    const frame = (t: number) => {
      if (!alive) return;
      if (!e0) { e0 = t; last = t; }
      const e = (t - e0) / 1000, dt = Math.min(0.05, (t - last) / 1000); last = t;
      lenis.raf(t);
      const p = prog();

      let level = 0; const an = zeroAudio.analyser;
      if (an) { const a = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(a); let s = 0; const N = Math.min(48, a.length); for (let i = 0; i < N; i++) s += a[i]; level = Math.min(1, s / N / 165); }

      scene.render(p, mx, my, e, level, dt);
      document.documentElement.style.setProperty('--sc-p', p.toFixed(4));

      for (let i = 0; i < 8; i++) if (!merged.current[i] && p > ACT_P(i) + 0.02) { merged.current[i] = true; scene.triggerMerge(i); zeroAudio.setLayer(i as LayerIndex, true); }
      const c = scene.mergedCount();
      if (c !== lastCount) { lastCount = c; setCount(c); }

      const a = p < 0.06 ? 0 : p > 0.88 ? 9 : Math.min(8, 1 + Math.floor((p - 0.06) / 0.095));
      if (a !== lastAct) { lastAct = a; setAct(a); }
      const d = p > 0.9 && c === 8;
      if (d !== lastDone) { lastDone = d; setDone(d); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onMove = (ev: PointerEvent) => { mx = (ev.clientX / window.innerWidth) * 2 - 1; my = (ev.clientY / window.innerHeight) * 2 - 1; };
    const onResize = () => scene.resize();
    const kick = () => { void zeroAudio.start(); setStarted(true); off(); };
    const off = () => ['wheel', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, kick));
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    ['wheel', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, kick, { passive: true }));

    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); window.removeEventListener('resize', onResize); off(); lenis.destroy(); zeroAudio.stop(); scene.dispose(); };
  }, []);

  const A = ACTS[act];
  return (
    <div className="sc">
      <canvas ref={canvasRef} className="sc-canvas" />
      <div className="sc-scroll" aria-hidden="true" />
      <div className="sc-grain" aria-hidden="true" />
      <div className="sc-vig" aria-hidden="true" />

      {/* nav */}
      <nav className="sc-nav">
        <span className="sc-wm"><b>Aurora</b> Groove</span>
        <span className="sc-navr">SHOWCASE · /TRY3</span>
      </nav>
      <span className="sc-side" aria-hidden="true">AURORA GROOVE · 8-LAYER SLATE</span>

      {/* kinetic title per act — position jumps around for chaos */}
      <div className={'sc-title ' + ['center', 'left', 'right', 'left', 'right', 'center', 'right', 'left', 'right', 'center'][act]} key={act}>
        <span className="sc-kick">{A.kick}</span>
        <h2>{A.head.split('\n').map((l, i) => <span key={i} className="ln">{l}</span>)}</h2>
        <p>{A.body}</p>
      </div>

      {/* spec strip */}
      <div className="sc-specs" aria-hidden="true">
        <span>{count}/8 LAYERS</span><i />
        <span>44.1kHz</span><i />
        <span>&lt;10ms</span><i />
        <span>NO INSTALL</span>
      </div>

      {!started && <div className="sc-boot"><span>scroll to build</span></div>}
      <div className="sc-prog" aria-hidden="true"><i /></div>

      <div className={'sc-final' + (done ? ' show' : '')}>
        <button className="sc-cta" onClick={() => nav('/studio')}>OPEN STUDIO →</button>
        <button className="sc-back" onClick={() => nav('/')}>back to home</button>
      </div>
    </div>
  );
}

function ShowcaseFallback() {
  const nav = useNavigate();
  return (
    <div className="sc sc-fb">
      <nav className="sc-nav"><span className="sc-wm"><b>Aurora</b> Groove</span><span className="sc-navr">SHOWCASE</span></nav>
      <div className="sc-fbwrap">
        <span className="sc-kick">THE STUDIO IN YOUR HANDS</span>
        <h2>MADE FOR<br />ANYONE.</h2>
        <p>A whole studio on one glass slate — eight layers, every note in key, no install. Open it and make your first track in minutes.</p>
        <button className="sc-cta" onClick={() => nav('/studio')}>OPEN STUDIO →</button>
      </div>
    </div>
  );
}
