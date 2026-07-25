import { useEffect, useRef, useState } from 'react';
import { scroll } from './scroll';
import { scrollSong, STEM_LABELS } from './scrollSong';

// Fixed layer-stack + sound gate. The song fades its five stems in as you scroll
// (drums → bass → chords → topline → FX); this HUD is the readout: each column
// lights + jumps to the live level when its stem is audible. Smooth-scroll and
// the scroll→gain binding live in useCinema — this only reads state.
export default function ScrollSongHUD() {
  const [on, setOn] = useState(false);
  const [hint, setHint] = useState(true);
  const colRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let raf = 0, alive = true, wasRunning = false;
    const tick = () => {
      if (!alive) return;
      if (scrollSong.running !== wasRunning) { wasRunning = scrollSong.running; setOn(scrollSong.running); if (scrollSong.running) setHint(false); }
      const active = scrollSong.activeStems();
      const lvl = scroll.level;
      for (let i = 0; i < colRefs.current.length; i++) {
        const el = colRefs.current[i]; if (!el) continue;
        el.classList.toggle('on', active[i]);
        el.style.setProperty('--h', (active[i] ? Math.min(1, 0.28 + lvl * (0.6 + i * 0.08)) : 0.06).toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, []);

  const toggle = async () => {
    setHint(false);
    if (scrollSong.running) { scrollSong.stop(); setOn(false); }
    else { await scrollSong.start(); setOn(true); }
  };

  return (
    <div className={'agr-hud' + (on ? ' live' : '')}>
      <button className={'agr-gate' + (on ? ' on' : '')} onClick={toggle} aria-label={on ? 'mute the scroll track' : 'play the scroll track'}>
        {on ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9v6h4l5 5V4L8 9H4z" /><path d="M16 8l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
        )}
      </button>
      <div className="agr-stack" aria-hidden="true">
        {STEM_LABELS.map((label, i) => (
          <div key={label} ref={(el) => { colRefs.current[i] = el; }} className="agr-col">
            <i className="agr-bar" />
            <span className="agr-lab">{label}</span>
          </div>
        ))}
      </div>
      <span className={'agr-tip' + (hint && !on ? ' show' : '')}>scroll builds the track — tap to hear it</span>
    </div>
  );
}
