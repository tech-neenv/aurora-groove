// The nine chapters (brief Section 3). Copy is sparse, centered, fades in.
// `stems` = indices into scrollSong's STEM_LABELS
// [KICK,SUB,HATS,CLAP,BASS,CHORDS,ARP,LEAD,BELLS,FX] that this chapter unlocks.
// We REUSE the existing live-synth scrollSong engine (decision: reuse), so a
// chapter "unlocking a stem" = its scroll window crossing that stem's threshold.

export type Interaction = 'scroll' | 'hold' | 'tap' | 'drag' | 'record' | 'cta';

export interface Chapter {
  id: number;
  key: string;
  title: string;
  interaction: Interaction;
  stems: number[]; // scrollSong stem indices unlocked here
  copy: string[]; // fade-in lines, in order
  hud?: string; // optional HUD line
}

export const CHAPTERS: Chapter[] = [
  { id: 1, key: 'silence', title: 'Silence', interaction: 'scroll', stems: [],
    copy: ['The night had no sound.', 'He walked anyway.'] },
  { id: 2, key: 'glow', title: 'Glow', interaction: 'scroll', stems: [1], // SUB/drone
    copy: ['Then the sky moved.', 'And the dark began to hum.'] },
  { id: 3, key: 'device', title: 'Device', interaction: 'hold', stems: [0], // KICK heartbeat
    copy: ['Half-buried. Still warm.', 'As if it had been waiting.'],
    hud: 'EVERY KEY, ALREADY IN TUNE.' },
  { id: 4, key: 'pulse', title: 'Pulse', interaction: 'hold', stems: [2, 3], // HATS+CLAP (drums)
    copy: ['Something was beating under the ice.'] },
  { id: 5, key: 'depth', title: 'Depth', interaction: 'tap', stems: [4], // BASS
    copy: ['The lake answered every touch.'] },
  { id: 6, key: 'strings', title: 'Strings', interaction: 'drag', stems: [5, 6], // CHORDS+ARP
    copy: ['He reached up —', 'and the sky let him play it.'] },
  { id: 7, key: 'voice', title: 'Voice', interaction: 'record', stems: [8], // BELLS/texture
    copy: ['The wind had been singing all along.', 'He finally listened.'] },
  { id: 8, key: 'mix', title: 'The Mix', interaction: 'scroll', stems: [7, 9], // LEAD+FX (full)
    copy: ['Everything he found.', 'All at once.'] },
  { id: 9, key: 'reveal', title: 'Aurora Groove', interaction: 'cta', stems: [],
    copy: ['The device is real.', 'Your night starts here.'] },
];

export const CHAPTER_COUNT = CHAPTERS.length;
// scroll length per chapter (vh). Brief: ~9 × 300vh, tune per chapter later.
export const CHAPTER_VH = 300;

// Progress window [start,end] in 0..1 for a chapter index (0-based).
export function chapterWindow(i: number): [number, number] {
  const span = 1 / CHAPTER_COUNT;
  return [i * span, (i + 1) * span];
}
