// MIDI note number → frequency in Hz (A4 = 69 = 440 Hz).
export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
