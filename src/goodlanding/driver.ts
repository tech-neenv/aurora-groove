import { useEffect } from 'react';
import Lenis from 'lenis';
import { scrollSong } from '../landing/scrollSong';

// Single scroll+audio driver for /goodlanding. Mirrors useCinema: Lenis smooth
// scroll + one rAF that writes a plain mutable store the R3F scene reads inside
// useFrame — zero React re-renders per frame. Reuses the existing live-synth
// scrollSong engine (decision: reuse) and pulls FFT energy off its analyser.

export const driver = {
  progress: 0, // 0..1 global scroll
  velocity: 0, // normalized scroll velocity
  level: 0, // overall FFT amplitude 0..1 (drives aurora)
  bass: 0,
  treble: 0,
  mouse: { x: 0, y: 0 }, // parallax -1..1
  started: false,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function useGoodDriver() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    // autoRaf:false — WE drive lenis.raf from the single loop below. Leaving it
    // on spawns a second internal rAF; with StrictMode's double-mount that left a
    // stale instance updating while the exposed one didn't (progress desync).
    const lenis = reduce ? null : new Lenis({ duration: 1.15, smoothWheel: true, touchMultiplier: 1.6, autoRaf: false });
    // Dev-only: expose Lenis + driver so screenshots can drive any chapter
    // headlessly (window.__lenis.scrollTo(progress*maxScroll)).
    if (import.meta.env.DEV) {
      (window as unknown as { __lenis: unknown; __driver: unknown }).__lenis = lenis;
      (window as unknown as { __lenis: unknown; __driver: unknown }).__driver = driver;
    }

    let alive = true;
    let raf = 0;
    let freq: Uint8Array | null = null;

    const onMove = (e: PointerEvent) => {
      driver.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      driver.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    // Autoplay is gated: kick the song off on the first user gesture of any kind.
    const GEST = ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'keydown', 'wheel'];
    const kick = () => { driver.started = true; void scrollSong.start(); off(); };
    const off = () => GEST.forEach((ev) => window.removeEventListener(ev, kick));
    GEST.forEach((ev) => window.addEventListener(ev, kick, { passive: true }));
    void scrollSong.start(); // try immediately where autoplay is allowed

    const frame = (time: number) => {
      if (!alive) return;
      lenis?.raf(time);

      const doc = document.documentElement;
      // Progress from NATIVE scroll — Lenis v1.3 smooth-scrolls the real window,
      // so window.scrollY tracks it. This is instance-agnostic (StrictMode can
      // leave a stale Lenis around; reading scrollY avoids that trap entirely).
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      driver.velocity = lerp(driver.velocity, (p - driver.progress) * 60, 0.2);
      driver.progress = p;
      scrollSong.setScroll(p);

      const an = scrollSong.analyser;
      if (an) {
        if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
        const n = freq.length;
        let lo = 0, hi = 0, all = 0;
        const loEnd = Math.max(1, (n * 0.12) | 0);
        const hiStart = (n * 0.6) | 0;
        for (let i = 0; i < n; i++) {
          const v = freq[i] / 255;
          all += v;
          if (i < loEnd) lo += v;
          if (i >= hiStart) hi += v;
        }
        driver.level = lerp(driver.level, all / n, 0.25);
        driver.bass = lerp(driver.bass, lo / loEnd, 0.25);
        driver.treble = lerp(driver.treble, hi / Math.max(1, n - hiStart), 0.25);
      }

      doc.style.setProperty('--agr-progress', p.toFixed(4));
      doc.style.setProperty('--agr-level', driver.level.toFixed(4));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      off();
      lenis?.destroy();
    };
  }, []);
}
