import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoopSerenity } from '../looper/LoopSerenity';

// /studio — the loop station. Open to everyone (incl. mobile landscape).
// The UI is designed for a comfortable "stage" size; on smaller screens we
// render it at that design size and UNIFORMLY SCALE it to fit the viewport
// (a true zoomed-out version) so every control stays reachable with no scroll.
const DESIGN_W = 940;
const DESIGN_H = 470;

export default function Studio() {
  const nav = useNavigate();

  useEffect(() => {
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    const prevOverscroll = root.style.overscrollBehavior;
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';

    // Fit-to-viewport + force-landscape:
    //  · Landscape screen smaller than the design stage → scale down to fit.
    //  · Portrait phone/tablet → present the studio in LANDSCAPE by rotating it
    //    90° (so it fills the screen sideways); scale is computed against the
    //    swapped dimensions. Rotating the phone to real landscape drops the
    //    rotation automatically (recomputed on resize/orientationchange).
    // Never scales up past 1.
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const portrait = vh > vw;
      const availW = portrait ? vh : vw; // landscape-oriented available space
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
  }, []);

  return <LoopSerenity onExit={() => nav('/')} />;
}
