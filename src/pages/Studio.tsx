import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoopSerenity } from '../looper/LoopSerenity';

// /studio — the loop station. Needs room (multi-track UI, mixer, live keys), so
// PHONES are blocked with a "use a bigger screen" notice; tablet / laptop /
// desktop are allowed. On those, the studio is uniformly scaled to fit the
// viewport (a zoomed-out stage) so every control stays reachable with no scroll.
const DESIGN_W = 940;
const DESIGN_H = 470;
// A phone's LARGER dimension is < ~900px (portrait or landscape). Tablets and up
// are >= 900px, so this cleanly separates phones from tablet/laptop/desktop.
const MIN_LARGER_DIM = 900;

function useIsPhone(): boolean {
  const calc = () => Math.max(window.innerWidth, window.innerHeight) < MIN_LARGER_DIM;
  const [phone, setPhone] = useState(calc);
  useEffect(() => {
    const on = () => setPhone(calc());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return phone;
}

function StudioTooSmall({ onBack }: { onBack: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center',
      background: 'radial-gradient(120% 80% at 50% -10%, rgba(155,140,255,.14), transparent 60%), linear-gradient(180deg,#0a0818,#05040c)',
      color: '#f7f5ff', fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", padding: '32px',
    }}>
      <div style={{ maxWidth: 440 }}>
        <svg viewBox="0 0 44 44" width="46" height="46" style={{ marginBottom: 22 }} aria-hidden="true">
          <defs><linearGradient id="sg" x1="4" y1="40" x2="40" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3fe0a6" /><stop offset=".5" stopColor="#49a6ea" /><stop offset="1" stopColor="#b48cff" /></linearGradient></defs>
          <path d="M6 29 C 13 12, 20 13, 23 23 C 25 31, 32 32, 38 15" fill="none" stroke="url(#sg)" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
        <h1 style={{ fontSize: '1.8rem', lineHeight: 1.15, margin: '0 0 14px', letterSpacing: '-.02em' }}>
          The Studio needs a bigger screen.
        </h1>
        <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'rgba(236,231,255,.82)', margin: '0 0 10px' }}>
          Making a track needs room — several tracks, a mixer and live keys. Open Aurora Groove on a
          <b> laptop, tablet or desktop</b> to enter the studio.
        </p>
        <p style={{ fontSize: '.9rem', lineHeight: 1.6, color: 'rgba(236,231,255,.55)', margin: '0 0 28px' }}>
          On a tablet, turn it landscape for the most room. The landing plays fine on your phone right here.
        </p>
        <button onClick={onBack} style={{
          font: 'inherit', fontWeight: 700, fontSize: '.95rem', color: '#fff', cursor: 'pointer',
          border: '1px solid #9b8cff', borderRadius: 12, padding: '12px 22px',
          background: 'linear-gradient(100deg, rgba(155,140,255,.42), rgba(155,140,255,.2))',
        }}>← Back to Aurora Groove</button>
      </div>
    </div>
  );
}

export default function Studio() {
  const nav = useNavigate();
  const phone = useIsPhone();

  useEffect(() => {
    if (phone) return; // studio isn't mounted on phones — nothing to fit
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    const prevOverscroll = root.style.overscrollBehavior;
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';

    // Fit-to-viewport (tablet / small laptop): scale the design stage down to fit.
    // Portrait tablet → present in landscape by rotating 90°; scale uses swapped
    // dimensions. Rotating to real landscape drops it (recomputed on resize).
    const fit = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const portrait = vh > vw;
      const availW = portrait ? vh : vw;
      const availH = portrait ? vw : vh;
      const s = Math.min(1, availW / DESIGN_W, availH / DESIGN_H);
      if (s < 1 || portrait) {
        root.classList.add('sr-fit');
        root.classList.toggle('sr-rot', portrait);
        root.style.setProperty('--sr-s', String(s));
      } else {
        root.classList.remove('sr-fit', 'sr-rot');
        root.style.removeProperty('--sr-s');
      }
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      root.style.overflow = prevOverflow;
      root.style.overscrollBehavior = prevOverscroll;
      root.classList.remove('sr-fit', 'sr-rot');
      root.style.removeProperty('--sr-s');
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [phone]);

  if (phone) return <StudioTooSmall onBack={() => nav('/')} />;
  return <LoopSerenity onExit={() => nav('/')} />;
}
