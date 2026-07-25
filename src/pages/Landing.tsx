import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useNavigate } from 'react-router-dom';
import { engine } from '../audio/engine';
import { useAuth } from '../lib/auth';
import { FluidCanvas } from '../looper/FluidCanvas';
import './landing.css';

const HUE = '#9B8CFF';

// ── the playable hero: real Web Audio, in-key pentatonic. Sound on interaction. ──
const PENT = [60, 62, 64, 67, 69, 72, 74, 76]; // C major pentatonic, two octaves-ish
const KEYCHARS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
const NOTE_NAMES = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'];

function useHeroSynth() {
  const play = (midi: number) => {
    const ctx = engine.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = ctx.createGain(); const g2 = ctx.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o1.connect(g); o2.connect(g2).connect(g); g.connect(ctx.destination);
    o1.start(t); o2.start(t); o1.stop(t + 1.6); o2.stop(t + 1.6);
  };
  return play;
}

// reveal-on-view via IntersectionObserver (respects reduced motion)
function useReveal() {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) { el.classList.add('in'); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.25 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useReveal();
  return <div ref={ref as Ref<HTMLDivElement>} className={'lz-rev ' + className} style={{ ['--rd' as string]: delay + 'ms' }}>{children}</div>;
}

function HeroKeys({ onPlay }: { onPlay: (i: number) => void }) {
  const play = useHeroSynth();
  const [lit, setLit] = useState<number | null>(null);
  const hit = (i: number) => { play(PENT[i]); onPlay(i); setLit(i); setTimeout(() => setLit((x) => (x === i ? null : x)), 220); };
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.repeat) return; const i = KEYCHARS.indexOf(e.key.toLowerCase()); if (i >= 0) hit(i); };
    window.addEventListener('keydown', down); return () => window.removeEventListener('keydown', down);
  }, []);
  return (
    <div className="lz-keys" role="group" aria-label="playable keys">
      {PENT.map((_, i) => (
        <button key={i} className={'lz-key' + (lit === i ? ' lit' : '')} onPointerDown={(e) => { e.preventDefault(); hit(i); }} aria-label={'play ' + NOTE_NAMES[i]}>
          <span className="nm">{NOTE_NAMES[i]}</span><span className="kc">{KEYCHARS[i].toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const { user, signIn, enabled } = useAuth();
  const [pulse, setPulse] = useState(0);
  const openStudio = () => nav('/studio');

  const meta = (user?.user_metadata ?? {}) as Record<string, string>;
  const avatar = meta.avatar_url || meta.picture || '';

  return (
    <div className="lz" style={{ ['--hue' as string]: HUE }}>
      {/* nav */}
      <nav className="lz-nav">
        <div className="lz-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <svg viewBox="0 0 44 44" aria-hidden="true" className="lz-logo">
            <defs><linearGradient id="lzg" x1="4" y1="40" x2="40" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3fe0a6" /><stop offset=".5" stopColor="#49a6ea" /><stop offset="1" stopColor="#b48cff" /></linearGradient></defs>
            <path d="M6 29 C 13 12, 20 13, 23 23 C 25 31, 32 32, 38 15" fill="none" stroke="url(#lzg)" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M8 35 C 15 21, 22 22, 25 30 C 27 36, 33 36, 38 26" fill="none" stroke="url(#lzg)" strokeWidth="2.2" strokeLinecap="round" opacity=".55" />
          </svg>
          <span className="wm"><b>Aurora</b> Groove</span>
        </div>
        <div className="lz-navend">
          {enabled && user ? (
            <button className="lz-btn ghost" onClick={openStudio}>{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : null}My Grooves</button>
          ) : (
            <button className="lz-btn ghost" onClick={() => (enabled ? void signIn() : openStudio())}>Sign in</button>
          )}
          <button className="lz-btn solid" onClick={openStudio}>Open Studio</button>
        </div>
      </nav>

      {/* hero */}
      <header className="lz-hero">
        <FluidCanvas hue={HUE} />
        <div className="lz-herofade" aria-hidden="true" />
        {pulse > 0 && <span className="lz-glow" key={pulse} aria-hidden="true" />}
        <Reveal className="eyebrow"><span className="lz-eyebrow">browser loop station · no install</span></Reveal>
        <h1 className="lz-h1">
          <span className="line"><em>Anyone</em> can</span>
          <span className="line">make <span className="grad">music.</span></span>
        </h1>
        <Reveal className="sub" delay={120}>
          <p className="lz-sub">Every key is already in tune. Play instruments, sing into the mic, stack loops — and build a groove in minutes. No lessons. No wrong notes.</p>
        </Reveal>
        <Reveal className="cta" delay={220}>
          <div className="lz-cta">
            <button className="lz-btn solid big" onClick={openStudio}>Open Studio →</button>
            <span className="lz-hint">↓ or press a key right here</span>
          </div>
        </Reveal>
        <div className="lz-playbar">
          <HeroKeys onPlay={() => setPulse((p) => p + 1)} />
          <span className="lz-playlabel">play me — every note lands in tune</span>
        </div>
      </header>

      {/* how it works */}
      <section className="lz-how">
        <Reveal><h2 className="lz-h2">Three moves. That's the whole thing.</h2></Reveal>
        <div className="lz-steps">
          {[
            ['01', 'Pick a voice', 'Drums, bass, piano, guitar, strings, synths — 11 instruments, plus your own voice through the mic.'],
            ['02', 'Play in key', "The glowing keys are locked to your key and scale. You literally can't hit a wrong note."],
            ['03', 'Stack & sing', 'Hit space, lay a loop, hit space again to stack another. Add your voice. A track appears.'],
          ].map(([n, t, d], i) => (
            <Reveal key={n} className="step" delay={i * 120}>
              <div className="lz-step"><span className="lz-stepn">{n}</span><b>{t}</b><p>{d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* feature reel */}
      <section className="lz-feat">
        <Reveal><h2 className="lz-h2">Everything you need to finish an idea.</h2></Reveal>
        <div className="lz-grid">
          {[
            ['11 instruments', 'A whole band on your keyboard — rhythm, low end, keys, strings, brass, synths.'],
            ['Sing it in', 'Loop your voice right alongside the beat, cleaned up and in time.'],
            ['Key-locked', 'Choose a key + scale once. Everything you play stays in tune, forever.'],
            ['Layer mixer', 'Mute, solo and balance every layer — arrange without re-recording.'],
            ['Saved to the cloud', 'Sign in and your grooves follow you to every device.'],
            ['Export a WAV', 'Bounce the whole loop to a clean audio file in one tap.'],
          ].map(([t, d], i) => (
            <Reveal key={t} className="fcard" delay={(i % 3) * 100}>
              <div className="lz-fcard"><b>{t}</b><p>{d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* social proof (placeholder slot) */}
      <section className="lz-proof">
        <Reveal><span className="lz-eyebrow center">loved by first-timers</span></Reveal>
        <div className="lz-quotes">
          {[
            ['“I made a whole loop in my lunch break. I can’t play anything.”', 'Maya · singer'],
            ['“The in-key thing is wild — it just sounds good no matter what I press.”', 'Devs · hobbyist'],
            ['“Recorded vocals over a beat in the browser. No setup. Unreal.”', 'Priya · songwriter'],
          ].map(([q, who], i) => (
            <Reveal key={i} className="quote" delay={i * 110}>
              <figure className="lz-quote"><blockquote>{q}</blockquote><figcaption>{who}</figcaption></figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="lz-final">
        <Reveal>
          <h2 className="lz-h1 sm">Your first track is<br /><span className="grad">one keypress away.</span></h2>
          <button className="lz-btn solid big" onClick={openStudio}>Open Studio →</button>
        </Reveal>
      </section>

      <footer className="lz-foot">
        <span>Aurora Groove</span>
        <span className="dim">made for anyone who wants to make a sound · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
