// Shared scroll/interaction state — a plain singleton written by the driver
// (useCinema) every frame and read by the WebGL scene + HUD. Decouples the DOM
// (Lenis smooth-scroll) from the canvas render loop with no React re-renders.
// Mutated in place; never reassigned.
export const scroll = {
  progress: 0,   // 0 → 1 across the whole document
  velocity: 0,   // Lenis scroll velocity (px/frame-ish) → motion blur amount
  mouseX: 0,     // -1 → 1, cursor parallax (smoothed)
  mouseY: 0,     // -1 → 1
  level: 0,      // overall audio loudness 0..1 (from AnalyserNode)
  bass: 0,       // low-band energy 0..1
  treble: 0,     // high-band energy 0..1
};
