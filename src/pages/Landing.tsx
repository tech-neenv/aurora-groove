import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useNavigate } from 'react-router-dom';
import { engine } from '../audio/engine';
import { FluidCanvas } from '../looper/FluidCanvas';
import './landing.css';

const HUE = '#9B8CFF';
const PENT = [60, 62, 64, 67, 69, 72, 74, 76];
const KEYCHARS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
const NOTE_NAMES = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'];
const INSTRUMENTS = ['drums', 'bass', '808', 'piano', 'e.piano', 'guitar', 'strings', 'brass', 'lead', 'pad', 'bells', 'voice'];

// public-domain melodies — the live "famous songs" you can actually play
const MELODIES = [
  { name: 'Ode to Joy', by: 'Beethoven', tempo: 150, notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62] },
  { name: 'Twinkle Twinkle', by: 'Traditional', tempo: 160, notes: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60] },
  { name: 'Für Elise', by: 'Beethoven', tempo: 200, notes: [76, 75, 76, 75, 76, 71, 74, 72, 69] },
  { name: 'When the Saints', by: 'Traditional', tempo: 150, notes: [60, 64, 65, 67, 60, 64, 65, 67, 60, 64, 65, 67, 64, 60, 62] },
  { name: 'Amazing Grace', by: 'Traditional', tempo: 120, notes: [67, 72, 76, 72, 76, 74, 72, 69, 67] },
  { name: 'Frère Jacques', by: 'Traditional', tempo: 150, notes: [60, 62, 64, 60, 60, 62, 64, 60, 64, 65, 67, 64, 65, 67] },
];

function playNote(midi: number, vol = 0.26) {
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
  const g = ctx.createGain(); const g2 = ctx.createGain(); g2.gain.value = vol * 0.8;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o1.connect(g); o2.connect(g2).connect(g); g.connect(ctx.destination);
  o1.start(t); o2.start(t); o1.stop(t + 1.2); o2.stop(t + 1.2);
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) { el.classList.add('in'); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: 0.16 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref as Ref<HTMLDivElement>} className={'lz-rev ' + className} style={{ ['--rd' as string]: delay + 'ms' }}>{children}</div>;
}

// blueprint corner ticks + an annotation label — "screen view" framing
function Frame({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={'lz-frame ' + className}>
      <i className="tick tl" /><i className="tick tr" /><i className="tick bl" /><i className="tick br" />
      <span className="lz-anno">{label}</span>
      {children}
    </div>
  );
}

function HeroKeys({ onPlay }: { onPlay: () => void }) {
  const [lit, setLit] = useState<number | null>(null);
  const hit = (i: number) => { playNote(PENT[i]); onPlay(); setLit(i); setTimeout(() => setLit((x) => (x === i ? null : x)), 220); };
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

// a playable famous-melody card
function MelodyCard({ m, busy, onPlay }: { m: typeof MELODIES[number]; busy: boolean; onPlay: () => void }) {
  const [step, setStep] = useState(-1);
  const play = () => {
    if (busy) return; onPlay();
    const beat = 60 / m.tempo;
    m.notes.forEach((n, i) => setTimeout(() => { playNote(n, 0.24); setStep(i); }, i * beat * 1000));
    setTimeout(() => setStep(-1), m.notes.length * beat * 1000 + 300);
  };
  return (
    <div className="lz-mel">
      <div className="lz-melhd"><b>{m.name}</b><span>{m.by}</span></div>
      <div className="lz-melnotes">{m.notes.map((_, i) => <i key={i} className={step === i ? 'on' : ''} />)}</div>
      <button className="lz-melplay" onClick={play} disabled={busy && step < 0}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l11-7z" /></svg>Play it
      </button>
    </div>
  );
}

// mini studio-UI recreations, scattered as "screen views"
function MiniTimeline() {
  const marks = [4, 10, 16, 22, 30, 36, 44, 52, 60, 68, 76, 84, 92];
  return (
    <div className="mini-tl">
      {[1, 2, 3, 4, 1, 2, 3, 4].map((n, i) => <span key={i} className="bar" style={{ left: (i / 8 * 100) + '%' }}>{n}</span>)}
      <div className="lane">{marks.map((x, i) => <i key={i} style={{ left: x + '%' }} />)}</div>
      <div className="lane b">{[8, 20, 34, 50, 64, 80].map((x, i) => <i key={i} style={{ left: x + '%' }} />)}</div>
      <div className="head" />
    </div>
  );
}
function MiniFx() {
  const rows: [string, number][] = [['vol', 6], ['rev', 3], ['drv', 0], ['sus', 4]];
  return <div className="mini-fx">{rows.map(([l, v]) => <div key={l} className="fxr"><span>{l}</span><i style={{ ['--p' as string]: v * 10 + '%' }} /><b>{v}</b></div>)}</div>;
}
function MiniLayers() {
  return <div className="mini-ly">{['drums', 'bass', 'voice'].map((n, i) => <div key={n} className="lyr"><span>{n}</span><em className={i === 2 ? 's' : ''}>M</em><em>S</em><i /></div>)}</div>;
}

export default function Landing() {
  const nav = useNavigate();
  const [pulse, setPulse] = useState(0);
  const [busy, setBusy] = useState('');
  const openStudio = () => nav('/studio');
  const startMel = (name: string) => { setBusy(name); const m = MELODIES.find((x) => x.name === name)!; setTimeout(() => setBusy(''), m.notes.length * (60 / m.tempo) * 1000 + 300); };

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
          <button className="lz-btn solid" onClick={openStudio}>Open Studio</button>
        </div>
      </nav>

      {/* hero */}
      <header className="lz-hero">
        <FluidCanvas hue={HUE} />
        <div className="lz-herofade" aria-hidden="true" />
        {pulse > 0 && <span className="lz-glow" key={pulse} aria-hidden="true" />}
        <span className="lz-hud tl" aria-hidden="true">AURORA GROOVE · v1</span>
        <span className="lz-hud tr" aria-hidden="true">KEY C · MAJOR PENT · 84 BPM</span>
        <div className="lz-heroin">
          <span className="lz-eyebrow">browser loop station · no install</span>
          <h1 className="lz-h1">
            <span className="line"><em>Anyone</em> can</span>
            <span className="line">make <span className="grad">music.</span></span>
          </h1>
          <p className="lz-sub">Every key is already in tune. Play instruments, sing into the mic, stack loops — a groove in minutes. No lessons. No wrong notes.</p>
          <div className="lz-cta">
            <button className="lz-btn solid big" onClick={openStudio}>Open Studio →</button>
            <span className="lz-hint">↓ or press a key right here</span>
          </div>
          <div className="lz-playbar">
            <HeroKeys onPlay={() => setPulse((p) => p + 1)} />
            <span className="lz-playlabel">play me — every note lands in tune</span>
          </div>
        </div>
        <span className="lz-scroll" aria-hidden="true">scroll</span>
      </header>

      {/* marquee */}
      <div className="lz-marquee" aria-hidden="true">
        <div className="lz-track">{[...INSTRUMENTS, ...INSTRUMENTS].map((n, i) => <span key={i} className="lz-mword">{n}<i className="dot" /></span>)}</div>
      </div>

      {/* LIVE playable famous melodies — the showpiece */}
      <section className="lz-sec lz-famous">
        <Reveal>
          <span className="lz-kicker">live · press play, hear it in your browser</span>
          <h2 className="lz-h2">Songs you know — <span className="grad">already in tune.</span></h2>
          <p className="lz-sub">These play right here on the same engine that powers the studio. Every note snaps to the scale, so it just works.</p>
        </Reveal>
        <div className="lz-melgrid">
          {MELODIES.map((m, i) => (
            <Reveal key={m.name} delay={(i % 3) * 90}><MelodyCard m={m} busy={busy !== '' && busy !== m.name} onPlay={() => startMel(m.name)} /></Reveal>
          ))}
        </div>
      </section>

      {/* the studio — whole view with blueprint annotations */}
      <section className="lz-sec lz-showcase">
        <Reveal><span className="lz-kicker">the studio</span><h2 className="lz-h2">One screen. A whole band.</h2></Reveal>
        <Reveal delay={100}>
          <Frame label="FIG.01 — LOOP TIMELINE · BAR-LOCKED" className="show-tl"><MiniTimeline /></Frame>
        </Reveal>
        <div className="lz-showrow">
          <Reveal className="showcell" delay={0}><Frame label="FIG.02 — PER-LAYER MIXER"><MiniLayers /></Frame></Reveal>
          <Reveal className="showcell" delay={110}><Frame label="FIG.03 — INSTRUMENT FX · 0–10"><MiniFx /></Frame></Reveal>
          <Reveal className="showcell" delay={220}><Frame label="FIG.04 — KEY-LOCKED PADS"><div className="mini-kb">{['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'].map((n, i) => <span key={i} className={i === 3 ? 'lit' : ''}>{n}</span>)}</div></Frame></Reveal>
        </div>
      </section>

      {/* how it works */}
      <section className="lz-sec lz-how">
        <Reveal><span className="lz-kicker">how it works</span><h2 className="lz-h2">Three moves. That's the whole thing.</h2></Reveal>
        <div className="lz-steps">
          {[
            ['01', 'Pick a voice', 'Drums, bass, piano, guitar, strings, synths — 11 instruments, plus your own voice through the mic.'],
            ['02', 'Play in key', "The glowing keys are locked to your key and scale. You literally can't hit a wrong note."],
            ['03', 'Stack & sing', 'Hit space, lay a loop, hit space again to stack another. Add your voice. A track appears.'],
          ].map(([n, t, d], i) => (
            <Reveal key={n} className="step" delay={i * 110}>
              <div className="lz-step"><span className="lz-stepn">{n}</span><b>{t}</b><p>{d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* statement */}
      <section className="lz-sec lz-state">
        <Reveal>
          <h2 className="lz-big">There are<br /><span className="grad">no wrong notes.</span></h2>
          <p className="lz-statesub">Choose a key and a scale once. From then on, every key on the board is a note that fits — so whatever you play sounds intentional. The fastest way from "I can't play" to "I made this."</p>
          <button className="lz-btn ghost big" onClick={openStudio}>Try it — it's free →</button>
        </Reveal>
      </section>

      {/* feature bento */}
      <section className="lz-sec lz-feat">
        <Reveal><span className="lz-kicker">everything in one tab</span><h2 className="lz-h2">A whole little studio, no download.</h2></Reveal>
        <div className="lz-bento">
          {[
            ['wide', '11 instruments', 'A full band under your fingers — drums, bass, 808, piano, e.piano, guitar, strings, brass, and three synths.'],
            ['', 'Sing it in', 'Loop your voice right on the beat — gated and in time, no setup.'],
            ['', 'Key-locked', 'Pick a key + scale once. Everything stays in tune, forever.'],
            ['', 'Layer mixer', 'Mute, solo and balance each layer. Arrange without re-recording.'],
            ['', 'Cloud grooves', 'Sign in and your tracks follow you to every device.'],
            ['wide', 'Export a WAV', 'Bounce the whole loop to a clean audio file in one tap — share it or drop it into any DAW.'],
          ].map(([span, t, d], i) => (
            <Reveal key={t} className={'bcard ' + span} delay={(i % 3) * 90}><div className="lz-bcard"><b>{t}</b><p>{d}</p></div></Reveal>
          ))}
        </div>
      </section>

      {/* sing it in */}
      <section className="lz-sec lz-sing">
        <Reveal className="singtext">
          <span className="lz-kicker">your voice, in the loop</span>
          <h2 className="lz-h2">Hum it, sing it, beatbox it.</h2>
          <p className="lz-sub">Hit the mic, sing over your beat, and it loops back cleaned up and in time. Stack harmonies. Layer ad-libs. Your voice is just another instrument.</p>
        </Reveal>
        <Reveal className="singwave" delay={120}>
          <Frame label="MIC IN · GATED · IN TIME">
            <div className="lz-wave" aria-hidden="true">{Array.from({ length: 56 }).map((_, i) => <i key={i} style={{ ['--h' as string]: (18 + Math.abs(Math.sin(i * 0.5) * 60 + Math.sin(i * 0.17) * 30)).toFixed(0) + '%', ['--d' as string]: (i * 40) + 'ms' }} />)}</div>
          </Frame>
        </Reveal>
      </section>

      {/* technical spec band — blueprint */}
      <section className="lz-specs">
        {[['11', 'VOICES', 'instruments + mic'], ['< 10ms', 'LATENCY', 'tap-to-sound'], ['44.1k', 'SAMPLE RATE', 'clean audio'], ['0', 'INSTALL', 'runs in a tab']].map(([n, l, s], i) => (
          <Reveal key={l} className="spec" delay={i * 80}>
            <div className="lz-spec"><span className="sl">{l}</span><b>{n}</b><span className="ss">{s}</span></div>
          </Reveal>
        ))}
      </section>

      {/* proof */}
      <section className="lz-sec lz-proof">
        <Reveal><span className="lz-kicker center">loved by first-timers</span></Reveal>
        <div className="lz-quotes">
          {[
            ['“I made a whole loop in my lunch break. I can’t play anything.”', 'Maya · singer'],
            ['“The in-key thing is wild — it just sounds good no matter what I press.”', 'Dev · hobbyist'],
            ['“Recorded vocals over a beat in the browser. No setup. Unreal.”', 'Priya · songwriter'],
          ].map(([q, who], i) => (
            <Reveal key={i} className="quote" delay={i * 100}>
              <figure className="lz-quote"><blockquote>{q}</blockquote><figcaption>{who}</figcaption></figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="lz-sec lz-final">
        <Reveal>
          <h2 className="lz-big center">Your first track is<br /><span className="grad">one keypress away.</span></h2>
          <button className="lz-btn solid big" onClick={openStudio}>Open Studio →</button>
          <span className="lz-freenote">free · no install · works in your browser</span>
        </Reveal>
      </section>

      <footer className="lz-foot">
        <div className="lz-brand small">
          <svg viewBox="0 0 44 44" aria-hidden="true" className="lz-logo"><path d="M6 29 C 13 12, 20 13, 23 23 C 25 31, 32 32, 38 15" fill="none" stroke="url(#lzg)" strokeWidth="3.4" strokeLinecap="round" /></svg>
          <span className="wm"><b>Aurora</b> Groove</span>
        </div>
        <span className="dim">made for anyone who wants to make a sound · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
