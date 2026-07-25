import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoopSerenity } from '../looper/LoopSerenity';

// /studio — the loop station. Open to everyone; saving prompts sign-in.
// The studio needs room (multi-track UI + live audio), so on small / touch
// screens we show a "come back on a bigger screen" notice instead of mounting it.
const SMALL = '(max-width:860px)';

function useSmallScreen(): boolean {
  const [small, setSmall] = useState(() => window.matchMedia(SMALL).matches);
  useEffect(() => {
    const mq = window.matchMedia(SMALL);
    const on = () => setSmall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return small;
}

function StudioTooSmall({ onBack }: { onBack: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center',
      background: 'radial-gradient(120% 80% at 50% -10%, rgba(155,140,255,.14), transparent 60%), linear-gradient(180deg,#0a0818,#05040c)',
      color: '#f7f5ff', fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", padding: '32px',
    }}>
      <div style={{ maxWidth: 420 }}>
        <svg viewBox="0 0 44 44" width="44" height="44" style={{ marginBottom: 22 }} aria-hidden="true">
          <defs><linearGradient id="sg" x1="4" y1="40" x2="40" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3fe0a6" /><stop offset=".5" stopColor="#49a6ea" /><stop offset="1" stopColor="#b48cff" /></linearGradient></defs>
          <path d="M6 29 C 13 12, 20 13, 23 23 C 25 31, 32 32, 38 15" fill="none" stroke="url(#sg)" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
        <h1 style={{ fontSize: '1.7rem', lineHeight: 1.15, margin: '0 0 14px', letterSpacing: '-.02em' }}>
          The Studio needs a bigger stage.
        </h1>
        <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'rgba(236,231,255,.8)', margin: '0 0 28px' }}>
          Making a track takes room — several tracks, a mixer and live audio. Open Aurora Groove on a
          <b> desktop or laptop</b> to enter the studio. The landing plays fine right here.
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
  const small = useSmallScreen();
  if (small) return <StudioTooSmall onBack={() => nav('/')} />;
  return <LoopSerenity onExit={() => nav('/')} />;
}
