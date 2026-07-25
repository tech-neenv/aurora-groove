// Minimal audio engine for Aurora Groove.
//
// The loop station only needs ONE shared AudioContext (a single sample clock).
// The old Riyaaz academy engine — song scheduler, soundfonts, idle groove — is
// intentionally left behind; this is all the studio ever asked of it.
class Engine {
  private ctx: AudioContext | null = null;

  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  // no ambient idle groove in the standalone app — kept as a no-op so the
  // looper's `engine.stopIdle()` calls stay valid.
  stopIdle(): void { /* nothing to stop */ }
}

export const engine = new Engine();
