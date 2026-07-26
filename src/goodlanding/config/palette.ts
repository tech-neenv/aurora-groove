// Aurora Groove — "The Night of Found Sound" palette (brief Section 2, locked).
// Derived from the brand theme-color, not a generic dark theme. Do not re-ideate.
export const PALETTE = {
  void: '#05040c', // base — matches auroragroove.com theme-color
  snow: '#dfe6f2', // moonlit white, never pure #fff
  aurora1: '#16e0b8', // teal
  aurora2: '#6a5cff', // violet
  aurora3: '#ff4fd8', // magenta — climax only; earn it
  device: '#ffd166', // warm device-screen glow — only warm note in the world
} as const;

// Numeric forms for three.js (0xRRGGBB) — avoids re-parsing hex in hot paths.
export const HEX = {
  void: 0x05040c,
  snow: 0xdfe6f2,
  aurora1: 0x16e0b8,
  aurora2: 0x6a5cff,
  aurora3: 0xff4fd8,
  device: 0xffd166,
} as const;

// Display / body type (brief Section 2). Display = high-contrast serif (Fraunces),
// body/UI = quiet grotesk. Bricolage Grotesque already ships in the app for UI.
export const TYPE = {
  display: '"Fraunces", Georgia, serif',
  body: '"Bricolage Grotesque", system-ui, sans-serif',
} as const;
