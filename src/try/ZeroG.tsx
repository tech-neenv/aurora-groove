import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Lenis from 'lenis';
import { ZeroGStudio } from './zeroGScene';
import { zeroAudio, VARIANTS, LAYERS, type LayerIndex } from './zeroAudio';
import './zerog.css';

const HEADLINES = ['pick a pulse', 'now the low end', 'give it harmony', 'the groove', 'movement', 'a voice', 'atmosphere', 'the drop'];

function hasWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export default function ZeroG() {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const webgl = typeof window !== 'undefined' && hasWebGL();
  if (reduce || !webgl) return <ZeroGFallback />;
  return <ZeroGFlight />;
}

function ZeroGFlight() {
  const nav = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reticleRef = useRef<HTMLDivElement | null>(null);
  const [station, setStation] = useState(-1);          // active station (-1 = between)
  const [picked, setPicked] = useState<number[]>(Array(8).fill(-1));
  const [hover, setHover] = useState<number>(-1);       // hovered variant at active station
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);

  const pickedRef = useRef<number[]>(Array(8).fill(-1));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const studio = new ZeroGStudio(canvas);
    const lenis = new Lenis({ duration: 1.4, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.4 });

    let raf = 0, alive = true, e0 = 0;
    let ndcX = 0, ndcY = 0, lastActive = -2;

    // safe scroll progress — 0 until the tall page is actually measured, so the
    // first frames can't report a bogus value and auto-fill every layer.
    const prog = () => {
      const lim = (lenis as unknown as { limit: number }).limit;
      const p = lenis.progress;
      if (!lim || lim <= 0 || !Number.isFinite(p)) return 0;
      return Math.min(1, Math.max(0, p));
    };

    const commitPick = (s: number, v: number) => {
      if (pickedRef.current[s] >= 0) return;
      pickedRef.current[s] = v; setPicked([...pickedRef.current]);
      zeroAudio.pick(s as LayerIndex, v);
    };

    const frame = (t: number) => {
      if (!alive) return;
      if (!e0) e0 = t; const e = (t - e0) / 1000;
      lenis.raf(t);
      const p = prog();

      let level = 0; const an = zeroAudio.analyser;
      if (an) { const a = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(a); let s = 0; const N = Math.min(48, a.length); for (let i = 0; i < N; i++) s += a[i]; level = Math.min(1, s / N / 170); }

      studio.render(p, ndcX, ndcY, e, level);

      // auto-pick any station we've flown past without choosing
      for (let i = 0; i < 8; i++) if (pickedRef.current[i] < 0 && p > 0.06 + i * 0.108 + 0.05) { studio.forceDefault(i); commitPick(i, 0); }

      const active = studio.activeStation(p);
      if (active !== lastActive) { lastActive = active; setStation(active); }
      setHover(studio.hovered && studio.hovered.station === active ? studio.hovered.variant : -1);

      if (p > 0.9 && pickedRef.current.every((x) => x >= 0)) setDone(true);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const toNdc = (ev: PointerEvent) => { ndcX = (ev.clientX / window.innerWidth) * 2 - 1; ndcY = -((ev.clientY / window.innerHeight) * 2 - 1); if (reticleRef.current) { reticleRef.current.style.left = ev.clientX + 'px'; reticleRef.current.style.top = ev.clientY + 'px'; } };
    const onMove = (ev: PointerEvent) => { toNdc(ev); studio.pointerMove(ndcX, ndcY, prog()); };
    const onDown = (ev: PointerEvent) => {
      toNdc(ev);
      if (!zeroAudio.running) { void zeroAudio.start(); setStarted(true); }
      const pick = studio.pointerDown(ndcX, ndcY, prog());
      if (pick) commitPick(pick.station, pick.variant);
    };
    const onResize = () => studio.resize();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);

    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onDown); window.removeEventListener('resize', onResize); lenis.destroy(); zeroAudio.stop(); studio.dispose(); };
  }, []);

  const labels = station >= 0 ? VARIANTS[station] : null;

  return (
    <div className="zg">
      <canvas ref={canvasRef} className="zg-canvas" />
      <div className="zg-scroll" aria-hidden="true" />

      {/* drone HUD frame */}
      <div className="zg-hud" aria-hidden="true">
        <span className="zg-corner tl" /><span className="zg-corner tr" /><span className="zg-corner bl" /><span className="zg-corner br" />
        <span className="zg-rec">● DRONE CAM</span>
      </div>
      <div ref={reticleRef} className="zg-reticle" aria-hidden="true" />

      {/* start hint */}
      {!started && <div className="zg-boot"><b>ZERO-G STUDIO</b><span>scroll to fly · click an object to pick your sound</span></div>}

      {/* headline for the active station */}
      <div className={'zg-headline' + (station >= 0 ? ' show' : '')} aria-hidden="true">
        <span className="zg-hkick">{station >= 0 ? String(station + 1).padStart(2, '0') + ' / 08' : ''}</span>
        <h2>{station >= 0 ? HEADLINES[station] : ''}</h2>
      </div>

      {/* the two choices */}
      {labels && picked[station] < 0 && (
        <div className="zg-choices">
          <span className={'zg-choice l' + (hover === 0 ? ' hot' : '')}>{labels[0]}</span>
          <span className="zg-or">pick</span>
          <span className={'zg-choice r' + (hover === 1 ? ' hot' : '')}>{labels[1]}</span>
        </div>
      )}

      {/* layer progress dots */}
      <div className="zg-dots" aria-hidden="true">
        {LAYERS.map((l, i) => (
          <span key={l} className={'zg-dot' + (picked[i] >= 0 ? ' on' : '') + (i === station ? ' active' : '')}><i />{l}</span>
        ))}
      </div>

      {/* finale CTA */}
      <div className={'zg-final' + (done ? ' show' : '')}>
        <span className="zg-fkick">your track — assembled in flight</span>
        <h1>you made this.</h1>
        <button className="zg-cta" onClick={() => nav('/studio')}>Open Studio →</button>
        <button className="zg-back" onClick={() => nav('/')}>back to home</button>
      </div>
    </div>
  );
}

// reduced-motion / no-WebGL: same build, no flight — tap a variant per layer
function ZeroGFallback() {
  const nav = useNavigate();
  const [picked, setPicked] = useState<number[]>(Array(8).fill(-1));
  const choose = (layer: number, v: number) => { const n = [...picked]; n[layer] = v; setPicked(n); zeroAudio.pick(layer as LayerIndex, v); };
  const done = picked.every((x) => x >= 0);
  return (
    <div className="zg zg-fb">
      <header className="zg-fbhd"><b>ZERO-G STUDIO</b><span>tap a sound for each layer — hear your track build</span></header>
      <div className="zg-fbgrid">
        {LAYERS.map((l, i) => (
          <div className={'zg-fbrow' + (picked[i] >= 0 ? ' done' : '')} key={l}>
            <span className="zg-fbnum">{String(i + 1).padStart(2, '0')}</span>
            <span className="zg-fblabel">{HEADLINES[i]}</span>
            <div className="zg-fbopts">
              {VARIANTS[i].map((opt, v) => (
                <button key={opt} className={picked[i] === v ? 'on' : ''} onClick={() => choose(i, v)}>{opt}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={'zg-fbcta' + (done ? ' show' : '')}>
        <button className="zg-cta" onClick={() => nav('/studio')}>Open Studio →</button>
        <button className="zg-back" onClick={() => nav('/')}>back to home</button>
      </div>
    </div>
  );
}
