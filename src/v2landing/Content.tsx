import { useEffect, useRef, type ReactNode } from 'react';
import type { NavigateFunction } from 'react-router-dom';

// ── /v2landing — scrollable content below the cinematic video intro ──────────
// Normal document flow (solid bg) that scrolls up over the fixed aurora canvas.
// Reveal-on-scroll + tilt/spotlight cards + magnetic CTAs, all wired by class.

function Reveal({ children, className = '', d = 0 }: { children: ReactNode; className?: string; d?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) { el.classList.add('in'); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (el.classList.add('in'), io.unobserve(el))), { threshold: 0.18 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={'c-rev ' + className} style={{ ['--rd' as string]: `${d}ms` }}>{children}</div>;
}

function MiniStudio() {
  return (
    <div className="c-stu">
      <div className="c-stubar"><i /><i /><i /><span>Aurora Groove — Studio</span><em>● REC</em></div>
      <div className="c-stutl">{Array.from({ length: 32 }).map((_, i) => <i key={i} className={i % 5 === 0 ? 'on' : ''} />)}</div>
      <div className="c-sturows">
        {['Drums', 'Bass', 'Chords', 'Lead', 'Voice'].map((n, i) => (
          <div key={n} className="c-sturow"><span>{n}</span><em>M</em><em>S</em><i style={{ width: `${35 + i * 12}%` }} /></div>
        ))}
      </div>
      <div className="c-stukeys">{['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E', 'G', 'A'].map((n, i) => <span key={i} className={i === 4 ? 'lit' : ''}>{n}</span>)}</div>
    </div>
  );
}

const INSTR = ['drums', 'bass', '808', 'grand piano', 'e.piano', 'guitar', 'strings', 'brass', 'lead synth', 'pad', 'bells', 'your voice'];
const STEPS: [string, string, string][] = [
  ['01', 'Pick a sound', 'Twelve instruments and your own voice through the mic. Tap one and go.'],
  ['02', 'Play in key', "The keys are locked to your scale. There's no wrong note to hit."],
  ['03', 'Stack & share', 'Lay a loop, stack another, add vocals. Export a WAV or share the groove.'],
];
const BENTO: [string, string, string][] = [
  ['wide', 'A full band in one tab', 'Drums, bass, 808, pianos, guitar, strings, brass and three synths — no install, no plugins.'],
  ['', 'Sing it in', 'Loop your voice on the beat, gated and in time.'],
  ['', 'Key-locked', 'Pick a key once. Everything stays in tune, forever.'],
  ['', 'Layer mixer', 'Mute, solo and balance every layer live.'],
  ['', 'Cloud grooves', 'Sign in and your tracks follow you everywhere.'],
  ['wide', 'Export a WAV', 'Bounce the whole loop to a clean file in one tap — drop it into any DAW.'],
];
const QUOTES: [string, string][] = [
  ['“I made a whole loop in my lunch break. I can’t play anything.”', 'Maya · singer'],
  ['“The in-key thing is wild — it just sounds good no matter what I press.”', 'Dev · hobbyist'],
  ['“Recorded vocals over a beat in the browser. No setup. Unreal.”', 'Priya · songwriter'],
];

export default function Content({ nav }: { nav: NavigateFunction }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // tilt + spotlight on [data-tilt], magnetic on [data-mag] — scoped to content
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches || window.matchMedia('(pointer:coarse)').matches) return;
    const cleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
      const m = 6;
      const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height; el.style.transform = `perspective(900px) rotateY(${(px - .5) * m * 2}deg) rotateX(${-(py - .5) * m * 2}deg)`; el.style.setProperty('--mx', `${px * 100}%`); el.style.setProperty('--my', `${py * 100}%`); };
      const leave = () => { el.style.transform = ''; };
      el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
      cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
    });
    root.querySelectorAll<HTMLElement>('[data-mag]').forEach((el) => {
      const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * .3}px, ${(e.clientY - (r.top + r.height / 2)) * .3}px)`; };
      const leave = () => { el.style.transform = ''; };
      el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
      cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
    });
    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <div ref={rootRef} className="v2-content">
      {/* instrument marquee */}
      <div className="c-marquee" aria-hidden="true">
        <div className="c-mtrack">{[...INSTR, ...INSTR].map((n, i) => <span key={i}>{n}<i /></span>)}</div>
      </div>

      {/* how it works */}
      <section className="c-sec">
        <Reveal className="c-head"><span className="c-kick">how it works</span><h2 className="c-h2">Three moves, and you're <span className="c-grad">making music.</span></h2></Reveal>
        <div className="c-steps">
          {STEPS.map(([n, t, d], i) => (
            <Reveal key={n} d={i * 90} className="c-stepwrap"><div className="c-step has-tilt" data-tilt><span className="c-stepn">{n}</span><b>{t}</b><p>{d}</p></div></Reveal>
          ))}
        </div>
      </section>

      {/* studio devices */}
      <section className="c-sec">
        <Reveal className="c-head"><span className="c-kick">the studio</span><h2 className="c-h2">One screen. <span className="c-grad">A whole band.</span></h2></Reveal>
        <Reveal className="c-devices" d={80}>
          <div className="c-laptop has-tilt" data-tilt>
            <div className="c-lapscreen"><MiniStudio /></div>
            <div className="c-lapbase" />
          </div>
          <div className="c-tablet has-tilt" data-tilt>
            <div className="c-tabscreen"><MiniStudio /></div>
          </div>
        </Reveal>
      </section>

      {/* feature bento */}
      <section className="c-sec">
        <Reveal className="c-head"><span className="c-kick">everything in one tab</span><h2 className="c-h2">A whole little studio, <span className="c-grad">no download.</span></h2></Reveal>
        <div className="c-bento">
          {BENTO.map(([span, t, d], i) => (
            <Reveal key={t} d={(i % 3) * 80} className={'c-bwrap ' + span}><div className="c-bcard has-tilt" data-tilt><b>{t}</b><p>{d}</p></div></Reveal>
          ))}
        </div>
      </section>

      {/* statement */}
      <section className="c-sec c-state">
        <Reveal><h2 className="c-big">There are<br /><span className="c-grad">no wrong notes.</span></h2><p className="c-statesub">Choose a key once. From then on, every note fits — whatever you play sounds intentional.</p></Reveal>
      </section>

      {/* proof */}
      <section className="c-sec">
        <Reveal className="c-head"><span className="c-kick">loved by first-timers</span></Reveal>
        <div className="c-quotes">
          {QUOTES.map(([q, who], i) => (
            <Reveal key={i} d={i * 90} className="c-qwrap"><figure className="c-quote has-tilt" data-tilt><blockquote>{q}</blockquote><figcaption>{who}</figcaption></figure></Reveal>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="c-sec c-final">
        <Reveal>
          <h2 className="c-big">Your first track is<br /><span className="c-grad">one keypress away.</span></h2>
          <button className="c-cta" data-mag onClick={() => nav('/studio')}>Open the Studio →</button>
          <span className="c-free">free · no install · works in your browser</span>
        </Reveal>
      </section>

      <footer className="c-foot">
        <div className="c-fbrand"><b>Aurora</b> Groove</div>
        <span>made for anyone who wants to make a sound · 2026</span>
      </footer>
    </div>
  );
}
