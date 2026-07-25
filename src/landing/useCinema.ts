import { useEffect } from 'react';
import Lenis from 'lenis';
import { scroll } from './scroll';
import { scrollSong } from './scrollSong';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// The single driver behind the cinematic landing. Owns Lenis "movie" smooth-
// scroll and ONE rAF that, every frame:
//   · reads scroll progress + velocity from Lenis (or native scroll when
//     reduced-motion) and writes the `scroll` singleton the WebGL scene reads
//   · ramps the layered-song stems to the current progress
//   · pulls FFT energy off the song's AnalyserNode → level / bass / treble
//   · publishes --agr-progress and --agr-level CSS vars for DOM reactivity
// StrictMode-safe: an `alive` flag guarantees exactly one live loop.
export function useCinema() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const lenis = reduce ? null : new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.6 });
    const doc = document.documentElement;

    let alive = true;
    let raf = 0;
    let mx = 0, my = 0;            // parallax targets
    let freq: Uint8Array<ArrayBuffer> | null = null;

    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    // volume on by default: browsers (esp. mobile Safari/Chrome) block bare
    // autoplay, so kick the song off on the very FIRST user gesture of any kind.
    // Broad event net + resume-inside-gesture makes it reliable on touch devices.
    const GEST = ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'keydown', 'wheel'];
    const kick = () => { void scrollSong.start(); off(); };
    const off = () => GEST.forEach((ev) => window.removeEventListener(ev, kick));
    GEST.forEach((ev) => window.addEventListener(ev, kick, { passive: true }));
    void scrollSong.start(); // try immediately too (works where autoplay is allowed)

    const winProgress = () => {
      const max = doc.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    const frame = (t: number) => {
      if (!alive) return;
      lenis?.raf(t);

      const p = lenis ? (lenis.progress ?? winProgress()) : winProgress();
      const v = lenis ? Math.min(1, Math.abs(lenis.velocity ?? 0) / 40) : 0;
      scroll.progress = p;
      scroll.velocity = lerp(scroll.velocity, v, 0.2);
      scroll.mouseX = lerp(scroll.mouseX, mx, 0.06);
      scroll.mouseY = lerp(scroll.mouseY, my, 0.06);
      doc.style.setProperty('--agr-progress', p.toFixed(4));

      scrollSong.setScroll(p);

      const an = scrollSong.analyser;
      if (an) {
        if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(freq);
        const N = freq.length;
        let all = 0, bass = 0, treb = 0;
        const bEnd = Math.max(1, Math.floor(N * 0.12));
        const tStart = Math.floor(N * 0.55);
        for (let i = 0; i < N; i++) {
          all += freq[i];
          if (i < bEnd) bass += freq[i];
          if (i >= tStart) treb += freq[i];
        }
        scroll.level = lerp(scroll.level, Math.min(1, all / N / 165), 0.35);
        scroll.bass = lerp(scroll.bass, Math.min(1, bass / bEnd / 200), 0.4);
        scroll.treble = lerp(scroll.treble, Math.min(1, treb / Math.max(1, N - tStart) / 150), 0.4);
      } else {
        scroll.level = lerp(scroll.level, 0, 0.1);
        scroll.bass = lerp(scroll.bass, 0, 0.1);
        scroll.treble = lerp(scroll.treble, 0, 0.1);
      }
      doc.style.setProperty('--agr-level', scroll.level.toFixed(3));

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      off();
      lenis?.destroy();
      doc.style.removeProperty('--agr-level');
      doc.style.removeProperty('--agr-progress');
    };
  }, []);
}
