import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { zeroAudio, type LayerIndex } from './zeroAudio';
import './merge.css';

// /try2 — THE MERGE. The studio is a MIDI controller in the centre; eight
// instruments fly straight into its pads in a fixed order as you scroll. Each
// one that docks lights its pad and adds its layer to the track. Fully
// deterministic — no physics, no randomness. DOM/CSS driven (no WebGL), so it's
// crisp and works everywhere.

const INSTRUMENTS = [
  { name: 'Drums', color: '#3fe0a6' },
  { name: 'Bass', color: '#35c0c8' },
  { name: 'Keys', color: '#49a6ea' },
  { name: 'Hats', color: '#5f8cf0' },
  { name: 'Arp', color: '#7b78f4' },
  { name: 'Lead', color: '#9b8cff' },
  { name: 'Pad', color: '#b478ea' },
  { name: 'FX', color: '#ff6fae' },
];
const N = INSTRUMENTS.length;
const SEG = 0.85 / N;           // merges span 0→0.85 of scroll; tail = finale
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function Bars() { return <span className="mg-bars"><i /><i /><i /><i /></span>; }

export default function Merge() {
  const nav = useNavigate();
  const tokenRefs = useRef<Array<HTMLDivElement | null>>([]);
  const padRefs = useRef<Array<HTMLDivElement | null>>([]);
  const meterRefs = useRef<Array<HTMLDivElement | null>>([]);
  const merged = useRef<boolean[]>(Array(N).fill(false));
  const [count, setCount] = useState(0);
  const [now, setNow] = useState(-1);     // instrument currently flying in
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    zeroAudio.reset();
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    let raf = 0, alive = true, lastNow = -2, lastCount = 0, lastDone = false;

    const progress = () => { const m = document.documentElement.scrollHeight - window.innerHeight; return m > 0 ? clamp(window.scrollY / m) : 0; };

    const frame = () => {
      if (!alive) return;
      const p = progress();
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2, R = 0.62 * Math.max(window.innerWidth, window.innerHeight);
      let flying = -1;

      for (let i = 0; i < N; i++) {
        const local = clamp((p - i * SEG) / SEG);
        const e = smooth(local);
        const pad = padRefs.current[i]; const tok = tokenRefs.current[i];
        if (pad && tok) {
          const r = pad.getBoundingClientRect();
          const px = r.left + r.width / 2, py = r.top + r.height / 2;
          const ang = -Math.PI / 2 + i * (Math.PI * 2 / N);
          const sx = cx + Math.cos(ang) * R, sy = cy + Math.sin(ang) * R;
          const x = reduce ? px : lerp(sx, px, e), y = reduce ? py : lerp(sy, py, e);
          tok.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${lerp(0.62, 1, e)})`;
          tok.style.opacity = String(local <= 0 ? 0 : local > 0.86 ? Math.max(0, 1 - (local - 0.86) / 0.14) : Math.min(1, local / 0.16));
        }
        const filled = local >= 0.9;
        pad?.classList.toggle('filled', filled);
        meterRefs.current[i]?.classList.toggle('on', filled);
        if (local > 0.9 && !merged.current[i]) { merged.current[i] = true; zeroAudio.setLayer(i as LayerIndex, true); }
        if (local < 0.6 && merged.current[i]) { merged.current[i] = false; zeroAudio.setLayer(i as LayerIndex, false); }
        if (local > 0.02 && local < 0.9 && flying < 0) flying = i;
      }

      document.documentElement.style.setProperty('--mg-p', p.toFixed(4));
      const c = merged.current.filter(Boolean).length;
      if (c !== lastCount) { lastCount = c; setCount(c); }
      if (flying !== lastNow) { lastNow = flying; setNow(flying); }
      const d = p > 0.92 && c === N;
      if (d !== lastDone) { lastDone = d; setDone(d); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const kick = () => { void zeroAudio.start(); setStarted(true); off(); };
    const off = () => ['wheel', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, kick));
    ['wheel', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, kick, { passive: true }));

    return () => { alive = false; cancelAnimationFrame(raf); off(); zeroAudio.stop(); document.documentElement.style.removeProperty('--mg-p'); };
  }, []);

  return (
    <div className="mg">
      <div className="mg-scroll" aria-hidden="true" />

      {/* flying instrument tokens */}
      {INSTRUMENTS.map((ins, i) => (
        <div key={ins.name} ref={(el) => { tokenRefs.current[i] = el; }} className="mg-token" style={{ ['--c' as string]: ins.color }}>
          <Bars /><b>{ins.name}</b>
        </div>
      ))}

      {/* the studio = controller */}
      <div className="mg-stage">
        <div className="mg-device">
          <div className="mg-devbar"><span className="dot" /><span className="dot" /><span className="dot" /><span className="mg-devtitle">AURORA GROOVE · CONTROLLER</span><span className="mg-devcount">{count}/8</span></div>
          <div className="mg-pads">
            {INSTRUMENTS.map((ins, i) => (
              <div key={ins.name} ref={(el) => { padRefs.current[i] = el; }} className="mg-pad" style={{ ['--c' as string]: ins.color }}>
                <span className="mg-padidx">{String(i + 1).padStart(2, '0')}</span>
                <span className="mg-padname"><Bars />{ins.name}</span>
              </div>
            ))}
          </div>
          <div className="mg-meter">
            {INSTRUMENTS.map((ins, i) => <div key={ins.name} ref={(el) => { meterRefs.current[i] = el; }} className="mg-mbar" style={{ ['--c' as string]: ins.color, ['--i' as string]: i }} />)}
          </div>
        </div>
        <div className={'mg-caption' + (now >= 0 ? ' show' : '')}>{now >= 0 ? `merging · ${INSTRUMENTS[now].name}` : ''}</div>
      </div>

      {/* HUD */}
      {!started && <div className="mg-boot"><b>THE MERGE</b><span>scroll — every instrument locks into the controller</span></div>}
      <div className="mg-progress" aria-hidden="true" />

      {/* finale */}
      <div className={'mg-final' + (done ? ' show' : '')}>
        <span className="mg-fkick">eight layers · one track · built by scrolling</span>
        <h1>your track is live.</h1>
        <button className="mg-cta" onClick={() => nav('/studio')}>Open Studio →</button>
        <button className="mg-back" onClick={() => nav('/')}>back to home</button>
      </div>
    </div>
  );
}
