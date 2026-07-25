import { useEffect } from 'react';

// ── Landing motion layer ─────────────────────────────────────────────────────
// One hook that wires premium micro-motion across the page:
//   · every CTA (.lz-btn) is MAGNETIC — pulls toward the cursor
//   · every card (.lz-mel / .lz-bcard / .lz-step / .lz-quote) gets 3D TILT + a
//     cursor-following spotlight
//   · anything [data-parallax] drifts on scroll (kinetic headings / decor)
// Pointer FX are skipped on touch + reduced-motion; parallax stays (it's scroll).

const MAGNETIC = '[data-magnetic], .lz-btn';
const TILT = '[data-tilt], .lz-mel, .lz-bcard, .lz-step, .lz-quote';

export function useLandingMotion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const coarse = window.matchMedia('(pointer:coarse)').matches;
    const cleanups: Array<() => void> = [];

    if (!reduce && !coarse) {
      // magnetic CTAs
      document.querySelectorAll<HTMLElement>(MAGNETIC).forEach((el) => {
        const s = parseFloat(el.dataset.magnetic || '0.28');
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * s}px, ${(e.clientY - (r.top + r.height / 2)) * s}px)`;
        };
        const leave = () => { el.style.transform = ''; };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
      });

      // tilt + spotlight cards
      document.querySelectorAll<HTMLElement>(TILT).forEach((el) => {
        el.classList.add('has-tilt');
        const max = parseFloat(el.dataset.tilt || '6');
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          el.style.transform = `perspective(900px) rotateY(${(px - 0.5) * max * 2}deg) rotateX(${-(py - 0.5) * max * 2}deg)`;
          el.style.setProperty('--mx', `${px * 100}%`);
          el.style.setProperty('--my', `${py * 100}%`);
        };
        const leave = () => { el.style.transform = ''; };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
      });
    }

    // parallax (scroll-linked) — kept on all devices unless reduced-motion
    const par = reduce ? [] : [...document.querySelectorAll<HTMLElement>('[data-parallax]')];
    if (par.length) {
      let raf = 0;
      const tick = () => {
        const vh = window.innerHeight;
        for (const el of par) {
          const speed = parseFloat(el.dataset.parallax || '0.06');
          const r = el.getBoundingClientRect();
          const center = r.top + r.height / 2 - vh / 2;
          el.style.setProperty('--py', `${(-center * speed).toFixed(1)}px`);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(raf));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);
}
