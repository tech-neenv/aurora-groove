import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Lenis from 'lenis';
import { rockSong } from './audio';
import Content from './Content';
import './v2.css';

// ── /v2landing ───────────────────────────────────────────────────────────────
// The aurora video (192 WebP frames) is scroll-scrubbed on a full-screen canvas.
// One scroll clock drives the frames AND builds the Bella Ciao layers. A
// "tap to begin" gate unlocks audio (mobile-safe) and releases the scroll.
// Along the way: brand logo, kinetic lines, a tablet showing the studio, stat
// chips, a first-timer quote, and the final CTA — each pinned to a scroll beat.

const FRAMES = 192;
const src = (i: number) => `/assets/v2/frames/${String(i + 1).padStart(4, '0')}.webp`;
const TITLE = 'Make your own music';

// scroll beats: [centerProgress, halfRange]
const BEATS: Array<[number, number]> = [
  [0.17, 0.10], // 0 — line: every key in tune
  [0.37, 0.11], // 1 — tablet / studio
  [0.55, 0.10], // 2 — no wrong notes + stats
  [0.73, 0.10], // 3 — first-timer quote
];

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cw: number, ch: number) {
  const ir = img.width / img.height, cr = cw / ch;
  let w: number, h: number;
  if (cr > ir) { w = cw; h = cw / ir; } else { h = ch; w = ch * ir; }
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
}

export default function V2Landing() {
  const nav = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const beatRefs = useRef<Array<HTMLDivElement | null>>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLDivElement | null>(null);
  const imgs = useRef<HTMLImageElement[]>([]);
  const begunRef = useRef(false);
  const [begun, setBegun] = useState(false);
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    let done = 0;
    const arr: HTMLImageElement[] = [];
    for (let i = 0; i < FRAMES; i++) {
      const im = new Image();
      im.onload = im.onerror = () => { done++; setLoaded(done); };
      im.src = src(i);
      arr[i] = im;
    }
    imgs.current = arr;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio, 2);
    let raf = 0, cinePx = window.innerHeight * 5;
    const resize = () => { canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cinePx = trackRef.current?.offsetHeight || window.innerHeight * 5; };
    resize();
    window.addEventListener('resize', resize);

    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const lenis = reduce ? null : new Lenis({ duration: 1.3, smoothWheel: true });

    const frame = (t: number) => {
      lenis?.raf(t);
      const p = begunRef.current ? Math.min(1, Math.max(0, window.scrollY / cinePx)) : 0;

      const fi = Math.min(FRAMES - 1, Math.round(p * (FRAMES - 1)));
      const im = imgs.current[fi];
      if (im && im.complete && im.naturalWidth) drawCover(ctx, im, window.innerWidth, window.innerHeight);

      if (begunRef.current) {
        rockSong.setBuild(p);
        if (glowRef.current) glowRef.current.style.opacity = (0.12 + rockSong.energy() * 0.5).toFixed(3);
        if (logoRef.current) logoRef.current.style.opacity = '1';
        BEATS.forEach(([c, r], i) => {
          const el = beatRefs.current[i]; if (!el) return;
          const o = Math.max(0, 1 - Math.abs(p - c) / r);
          el.style.opacity = o.toFixed(3);
          el.style.transform = `translate(-50%, calc(-50% + ${((p - c) * 90).toFixed(1)}px))`;
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); lenis?.destroy(); };
  }, []);

  useEffect(() => { document.body.style.overflow = begun ? '' : 'hidden'; return () => { document.body.style.overflow = ''; }; }, [begun]);

  const begin = () => { if (begunRef.current) return; begunRef.current = true; setBegun(true); void rockSong.start(); };
  useEffect(() => () => rockSong.stop(), []);

  const ready = loaded >= FRAMES;
  let gi = 0;
  const setBeat = (i: number) => (el: HTMLDivElement | null) => { beatRefs.current[i] = el; };

  return (
    <div className="v2">
      <canvas ref={canvasRef} className="v2-canvas" />
      <div ref={glowRef} className="v2-glow" aria-hidden="true" />
      <div className="v2-grain" aria-hidden="true" />
      <div className="v2-vignette" aria-hidden="true" />
      <div className="v2-track" ref={trackRef} />

      {/* scrollable content sections below the cinematic intro */}
      <Content nav={nav} />

      {/* brand logo — top-left, fades in once you begin */}
      <div ref={logoRef} className="v2-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <defs><linearGradient id="v2lg" x1="4" y1="40" x2="40" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3fe0a6" /><stop offset=".5" stopColor="#49a6ea" /><stop offset="1" stopColor="#b48cff" /></linearGradient></defs>
          <path d="M6 29 C 13 12, 20 13, 23 23 C 25 31, 32 32, 38 15" fill="none" stroke="url(#v2lg)" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M8 35 C 15 21, 22 22, 25 30 C 27 36, 33 36, 38 26" fill="none" stroke="url(#v2lg)" strokeWidth="2.2" strokeLinecap="round" opacity=".55" />
        </svg>
        <span><b>Aurora</b> Groove</span>
      </div>
      <button className="v2-navcta" onClick={() => nav('/studio')}>Open Studio</button>

      {/* beat 0 — kinetic line */}
      <div ref={setBeat(0)} className="v2-beat v2-bline" style={{ opacity: 0 }}>every key — already in tune</div>

      {/* beat 1 — tablet showing the studio */}
      <div ref={setBeat(1)} className="v2-beat v2-btablet" style={{ opacity: 0 }}>
        <div className="v2-tablet">
          <div className="v2-tabscreen">
            <div className="v2-tabbar"><i /><i /><i /><span>Aurora Groove — Studio</span><em>● REC</em></div>
            <div className="v2-tabtimeline">{Array.from({ length: 24 }).map((_, i) => <i key={i} className={i % 5 === 0 ? 'on' : ''} />)}</div>
            <div className="v2-tabrows">
              {['Drums', 'Bass', 'Chords', 'Voice'].map((n, i) => (
                <div key={n} className="v2-tabrow"><span>{n}</span><em>M</em><em>S</em><i style={{ width: `${40 + i * 14}%` }} /></div>
              ))}
            </div>
            <div className="v2-tabkeys">{['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'].map((n, i) => <span key={i} className={i === 3 ? 'lit' : ''}>{n}</span>)}</div>
          </div>
        </div>
        <span className="v2-cap">the whole studio — right in your browser</span>
      </div>

      {/* beat 2 — statement + stat chips */}
      <div ref={setBeat(2)} className="v2-beat v2-bstats" style={{ opacity: 0 }}>
        <h2 className="v2-bh">no wrong notes</h2>
        <div className="v2-chips">
          {[['11', 'instruments'], ['< 10ms', 'latency'], ['WAV', 'export'], ['0', 'install']].map(([a, b]) => (
            <div key={b} className="v2-chip"><b>{a}</b><span>{b}</span></div>
          ))}
        </div>
      </div>

      {/* beat 3 — first-timer quote */}
      <div ref={setBeat(3)} className="v2-beat v2-bquote" style={{ opacity: 0 }}>
        <blockquote>“I made a whole loop in my lunch break — and I can’t play a thing.”</blockquote>
        <cite>Maya · first-timer</cite>
      </div>

      {/* gate */}
      {!begun && (
        <div className="v2-gate">
          <h1 className="v2-title" aria-label={TITLE}>
            {TITLE.split(' ').map((word, wi) => (
              <span key={wi} className="v2-word">
                {word.split('').map((ch, ci) => { const d = gi++ * 55; return <span key={ci} className="v2-ch" style={{ ['--d' as string]: `${d}ms` }}>{ch}</span>; })}
              </span>
            ))}
          </h1>
          <button className={'v2-begin' + (ready ? ' ready' : '')} onClick={begin} disabled={!ready}>
            {ready ? 'Tap to begin' : `Loading ${Math.round((loaded / FRAMES) * 100)}%`}
          </button>
          <span className="v2-hint">headphones on · scroll to play</span>
        </div>
      )}
    </div>
  );
}
