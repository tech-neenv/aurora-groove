import { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Environment } from '@react-three/drei';
import { HEX, PALETTE } from './config/palette';
import { CHAPTERS, CHAPTER_VH } from './config/chapters';
import { useGoodDriver, driver } from './driver';
import { scrollSong } from '../landing/scrollSong';
import Aurora from './components/Aurora';
import Terrain from './components/Terrain';
import WindParticles from './components/WindParticles';
import Boy from './components/Boy';
import Rig from './components/Rig';
import Post from './components/Post';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/500.css';
import './goodlanding.css';

// Night exposure ramp: Ch1 sits dark ("Silence"), the world brightens as the
// aurora wakes (Ch2+). Also nudges exposure with the live music level.
function ExposureRig() {
  const { gl } = useThree();
  useFrame(() => {
    const wake = THREE.MathUtils.smoothstep(driver.progress, 0.04, 0.2);
    const target = 0.62 + wake * 0.55 + driver.level * 0.12;
    gl.toneMappingExposure += (target - gl.toneMappingExposure) * 0.05;
  });
  return null;
}

// The 3D world. One light source is the aurora (brief); a faint ambient + a
// single tinted directional stand in for its spill until the shader lights the
// scene fully. Fog dissolves the horizon into --void.
function World() {
  return (
    <>
      <color attach="background" args={[HEX.void]} />
      <fog attach="fog" args={[HEX.void, 10, 70]} />
      <ambientLight intensity={0.1} color={HEX.aurora2} />
      <directionalLight position={[-4, 8, -10]} intensity={0.4} color={HEX.aurora1} castShadow />
      {/* REAL night HDRI (Poly Haven dikhololo_night, CC0): star-field sky +
          image-based lighting. Heavy fog still dissolves the horizon into void. */}
      <Suspense fallback={null}>
        <Environment files="/assets/hdri/night.hdr" background backgroundIntensity={0.45} />
        <Terrain />
        <Boy />
      </Suspense>
      <Aurora />
      <WindParticles />
      <Rig />
      <ExposureRig />
      <Post />
    </>
  );
}

// Per-chapter copy that fades in when its scroll section enters view.
function ChapterCopy({ lines, hud }: { lines: string[]; hud?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="agr-copy">
      {lines.map((l, i) => (
        <p key={i} style={{ ['--i' as string]: i }}>{l}</p>
      ))}
      {hud && <span className="agr-hud">{hud}</span>}
    </div>
  );
}

export default function GoodLanding() {
  useGoodDriver();
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-agr', 'goodlanding');
    return () => document.documentElement.removeAttribute('data-agr');
  }, []);

  const start = () => {
    setStarted(true);
    void scrollSong.start();
  };
  const toggleSound = () => {
    void scrollSong.toggle();
    setMuted((m) => !m);
  };

  return (
    <div className="agr-root" style={{ background: PALETTE.void }}>
      {/* fixed 3D backdrop */}
      <div className="agr-canvas">
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
          camera={{ position: [0, 1.6, 8], fov: 42 }}
        >
          <World />
        </Canvas>
      </div>

      {/* legibility scrim */}
      <div className="agr-scrim" aria-hidden />

      {/* scroll flow: one tall section per chapter drives progress + copy */}
      <main className="agr-flow">
        {CHAPTERS.map((c) => (
          <section key={c.id} className="agr-chapter" style={{ height: `${CHAPTER_VH}vh` }} data-ch={c.id}>
            <ChapterCopy lines={c.copy} hud={c.hud} />
          </section>
        ))}
      </main>

      {/* chapter index nav (right edge, Ivress-style) */}
      <nav className="agr-nav" aria-label="Chapters">
        {CHAPTERS.map((c) => (
          <a key={c.id} href={`#`} className="agr-nav-item">
            <span className="agr-nav-num">{String(c.id).padStart(2, '0')}</span>
            <span className="agr-nav-title">{c.title}</span>
          </a>
        ))}
      </nav>

      {/* sound toggle */}
      <button className="agr-sound" onClick={toggleSound} aria-label="Toggle sound">
        {muted ? 'SOUND OFF' : 'SOUND ON'}
      </button>

      {/* scroll hint */}
      {started && <div className="agr-hint">SCROLL TO CONTINUE ↓</div>}

      {/* start gate (satisfies autoplay policy) */}
      {!started && (
        <button className="agr-gate" onClick={start}>
          <span className="agr-gate-title">AURORA GROOVE</span>
          <span className="agr-gate-sub">THE NIGHT OF FOUND SOUND</span>
          <span className="agr-gate-cta">CLICK TO START</span>
        </button>
      )}
    </div>
  );
}
