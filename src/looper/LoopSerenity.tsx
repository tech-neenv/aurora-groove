import { useEffect, useRef, useState } from 'react';
import { useLooper, KROWS, SCALE_IDS, INSTRUMENTS, KEYS, SCALES, ROW_HOME, ROW_TOP } from './useLooper';
import { FluidCanvas } from './FluidCanvas';
import { looper } from './looper';
import type { Session } from './looper';
import { useAuth } from '../lib/auth';
import { listGrooves, saveGroove, loadGroove, deleteGroove, type GrooveMeta } from '../lib/grooves';
import './serenity.css';

// SERENITY — /looper/v2. One fixed violet accent, a living smoke field,
// breathing liquid glass, save/replay of sessions.
const HUE = '#9B8CFF';

interface Save { id: number; name: string; session: Session }
const SAVES_KEY = 'riyaaz.looper.saves';
// carries the in-progress loop across the Google OAuth full-page redirect
const PENDING_KEY = 'aurora.pending.session';
const readSaves = (): Save[] => { try { return JSON.parse(localStorage.getItem(SAVES_KEY) || '[]'); } catch { return []; } };
const writeSaves = (a: Save[]) => localStorage.setItem(SAVES_KEY, JSON.stringify(a));
// voice PCM is heavy — if the store overflows, retry without the voice audio.
const persistSaves = (a: Save[]) => {
  try { writeSaves(a); }
  catch {
    try { writeSaves(a.map((s) => ({ ...s, session: { ...s.session, layers: s.session.layers.filter((l) => l.kind !== 'voice') } }))); }
    catch { /* out of room — keep the newest in memory only */ }
  }
};

// a thin, smooth, curvy "hotspot" line (like cricket Hawk-Eye) — flat where quiet,
// sharp mirrored peaks where there's a note. Built from a 0..1 peak envelope.
function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    d += ` Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
}
function Waveform({ peaks, hue }: { peaks: number[]; hue: string }) {
  const K = peaks.length; if (!K) return null;
  const W = 100, cy = 50, amp = 44;
  const top = peaks.map((p, i) => [(i / (K - 1)) * W, cy - Math.min(1, p) * amp] as [number, number]);
  const bot = peaks.map((p, i) => [(i / (K - 1)) * W, cy + Math.min(1, p) * amp] as [number, number]);
  return (
    <svg className="sr-wf" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ ['--c' as string]: hue }}>
      <line className="sr-wf-base" x1="0" y1="50" x2="100" y2="50" vectorEffect="non-scaling-stroke" />
      <path className="sr-wf-line" d={smoothPath(top)} vectorEffect="non-scaling-stroke" />
      <path className="sr-wf-line" d={smoothPath(bot)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function VoiceWave({ env, hue }: { env?: number[]; hue: string }) {
  return <Waveform peaks={env && env.length ? env : new Array(48).fill(0.06)} hue={hue} />;
}
// live mic — a scrolling hotspot line fed by the running level (thin, curvy, spikes as you sing)
function LiveWave({ hue }: { hue: string }) {
  const N = 90;
  const buf = useRef<number[]>(new Array(N).fill(0));
  const [peaks, setPeaks] = useState<number[]>(() => new Array(N).fill(0));
  useEffect(() => {
    let raf = 0, last = 0;
    const tick = (t: number) => {
      if (t - last > 32) { last = t; const a = buf.current; a.push(Math.min(1, looper.level * 6.5)); a.shift(); setPeaks(a.slice()); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <Waveform peaks={peaks} hue={hue} />;
}

function Fx({ label, val, min, set }: { label: string; val: number; min: number; set: (v: number) => void }) {
  return (
    <label className="sr-fx">
      <span className="l">{label}</span>
      <input type="range" min={min} max={10} value={val} onChange={(e) => set(+e.target.value)} />
      <b>{val}</b>
    </label>
  );
}

export function LoopSerenity({ onExit }: { onExit: () => void }) {
  const h = useLooper();
  const { looper, ready, tab, micActive, selectTab, padFor, bpmDraft, setBpmDraft, commitBpm,
    showKeys, setShowKeys, headRef, capRef, play, rec, lb, recLabel, fxId, fxA, force } = h;

  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, []);

  // subtle spark on the tape each time an instrument beat lands in the loop while
  // recording (mic excluded — it never calls capture). Pure joy.
  const sparkRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    looper.onCapture = () => {
      const layer = sparkRef.current; if (!layer) return;
      const s = document.createElement('span'); s.className = 'sr-spark';
      s.style.left = (looper.posNow * 100) + '%';
      s.style.top = (28 + Math.random() * 44) + '%';
      layer.appendChild(s); setTimeout(() => s.remove(), 680);
    };
    return () => { looper.onCapture = null; };
  }, []);

  // magic-wand cursor — trails tiny stars on move, whooshes a burst on click.
  useEffect(() => {
    const layer = document.createElement('div'); layer.className = 'sr-cursor-fx';
    document.body.appendChild(layer);
    let last = 0;
    const star = (x: number, y: number, cls: string, tx = 0, ty = 0) => {
      const s = document.createElement('i'); s.className = cls;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--r', (Math.random() * 360) + 'deg');
      s.style.setProperty('--sc', (0.55 + Math.random() * 0.7).toFixed(2));
      if (tx || ty) { s.style.setProperty('--tx', tx + 'px'); s.style.setProperty('--ty', ty + 'px'); }
      layer.appendChild(s); setTimeout(() => s.remove(), 720);
    };
    const move = (e: PointerEvent) => {
      const now = performance.now(); if (now - last < 34) return; last = now;
      star(e.clientX + (Math.random() * 14 - 7), e.clientY + (Math.random() * 14 - 7), 'mstar');
    };
    const down = (e: PointerEvent) => {
      const w = document.createElement('i'); w.className = 'mwhoosh';
      w.style.left = e.clientX + 'px'; w.style.top = e.clientY + 'px';
      layer.appendChild(w); setTimeout(() => w.remove(), 620);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; star(e.clientX, e.clientY, 'mburst', Math.cos(a) * 40, Math.sin(a) * 40); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down); layer.remove(); };
  }, []);

  // ---- auth + grooves (cloud when signed in; local fallback if Supabase off) ----
  const { user, signIn, signOut, enabled } = useAuth();
  const cloud = enabled && !!user;
  const [panel, setPanel] = useState<'keys' | 'saves' | null>(null);
  const [cards, setCards] = useState<GrooveMeta[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // carry the in-progress loop across the OAuth full-page redirect, restore on return
  const signInPreserving = async () => {
    try { if (looper.layers.length > 0) sessionStorage.setItem(PENDING_KEY, JSON.stringify(await looper.snapshotSession())); } catch { /* ignore */ }
    await signIn();
  };
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return;
    restoredRef.current = true;
    sessionStorage.removeItem(PENDING_KEY);
    try { looper.loadSession(JSON.parse(raw) as Session); force(); } catch { /* ignore */ }
  }, [ready]);
  const localCards = (): GrooveMeta[] => readSaves().map((s) => ({
    id: String(s.id), name: s.name, keyRoot: s.session.keyRoot, scaleId: s.session.scaleId,
    bpm: s.session.bpm, bars: s.session.bars, quantize: s.session.quantize, layerCount: s.session.layers.length, updatedAt: '',
  }));
  const refreshSaves = async () => {
    if (cloud) { try { setCards(await listGrooves()); } catch { setCards([]); } }
    else if (!enabled) setCards(localCards());
    else setCards([]);   // signed out while cloud is on → nothing until sign-in
  };
  useEffect(() => { void refreshSaves(); }, [cloud]);
  useEffect(() => { if (showKeys) { setPanel('keys'); setShowKeys(false); } }, [showKeys]);

  const nextName = () => 'Groove ' + (cards.length + 1);
  const doSave = async () => {
    if (enabled && !user) { void signInPreserving(); return; }    // saving requires sign-in
    setBusy(true);
    try {
      const session = await looper.snapshotSession();
      if (cloud) {
        const name = cards.find((c) => c.id === savedId)?.name ?? nextName();
        setSavedId(await saveGroove(session, name, savedId ?? undefined)); await refreshSaves();
      } else {
        const all = readSaves();
        if (savedId != null) { const i = all.findIndex((s) => String(s.id) === savedId); if (i >= 0) all[i].session = session; }
        else { const id = Date.now(); all.push({ id, name: nextName(), session }); setSavedId(String(id)); }
        persistSaves(all); setCards(localCards());
      }
    } finally { setBusy(false); }
  };
  // keep the current groove in sync as the loop grows (voice export is async)
  useEffect(() => {
    if (savedId == null) return;
    let alive = true;
    void looper.snapshotSession().then(async (session) => {
      if (!alive) return;
      if (cloud) { const name = cards.find((c) => c.id === savedId)?.name ?? nextName(); await saveGroove(session, name, savedId); await refreshSaves(); }
      else { const all = readSaves(); const i = all.findIndex((s) => String(s.id) === savedId); if (i >= 0) { all[i].session = session; persistSaves(all); setCards(localCards()); } }
    });
    return () => { alive = false; };
  }, [looper.layers.length, savedId]);

  const delSave = async (id: string) => {
    if (cloud) await deleteGroove(id); else writeSaves(readSaves().filter((s) => String(s.id) !== id));
    if (savedId === id) setSavedId(null);
    await refreshSaves();
  };
  const playSave = async (id: string) => {
    setBusy(true);
    try {
      if (cloud) { looper.loadSession(await loadGroove(id)); }
      else { const s = readSaves().find((x) => String(x.id) === id); if (s) looper.loadSession(s.session); }
      setSavedId(id); setPanel(null); force();
    } finally { setBusy(false); }
  };
  // one-click migration of pre-login local grooves into the cloud
  const localPending = cloud ? readSaves().length : 0;
  const importLocal = async () => {
    setBusy(true);
    try { for (const s of readSaves()) await saveGroove(s.session, s.name); localStorage.removeItem(SAVES_KEY); await refreshSaves(); }
    finally { setBusy(false); }
  };

  // download the whole groove (4 loops) as a WAV
  const [dl, setDl] = useState(false);
  const doDownload = async () => {
    if (dl || looper.layers.length === 0) return;
    if (enabled && !user) { void signInPreserving(); return; }    // download requires sign-in too
    setDl(true);
    try {
      const blob = await looper.exportWav(4);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = (cards.find((c) => c.id === savedId)?.name || 'groove') + '.wav';
      a.click(); URL.revokeObjectURL(url);
    } finally { setDl(false); }
  };

  // once a loop exists (or recording), the grid is frozen — key/scale/bpm/bars
  // define the timeline every layer is locked to, so they become view-only.
  const locked = looper.layers.length > 0 || rec !== 'idle';

  return (
    <div className="sr-root" style={{ ['--hue' as string]: HUE }} data-rec={rec} data-mic={micActive ? '1' : '0'}>
      <FluidCanvas hue={HUE} />
      <div className="sr-veil" aria-hidden="true" />
      <div className="sr-motes" aria-hidden="true">{Array.from({ length: 7 }).map((_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>

      {/* topbar */}
      <header className="sr-top sr-rise" style={{ ['--d' as string]: 0 }}>
        <div className="sr-brand">
          <svg className="sr-logo" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="14" fill="none" stroke="currentColor" strokeWidth="2" opacity=".45" />
            <circle cx="22" cy="22" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".28" />
            <g className="node"><circle cx="22" cy="8" r="3.4" fill="currentColor" /></g>
            <circle cx="22" cy="22" r="1.6" fill="currentColor" opacity=".8" />
          </svg>
          <span className="wm">loop<em>station</em></span>
        </div>
        <div className={'sr-top-ctl' + (locked ? ' frozen' : '')}>
          <button className={'sr-glass chip' + (locked ? ' locked' : '')} disabled={locked} onClick={() => { looper.setKey((looper.keyRoot + 1) % 12); force(); }}><span className="v">{KEYS[looper.keyRoot]}</span><span className="k">key</span></button>
          <button className={'sr-glass chip' + (locked ? ' locked' : '')} disabled={locked} onClick={() => looper.setScale(SCALE_IDS[(SCALE_IDS.indexOf(looper.scaleId) + 1) % SCALE_IDS.length])}><span className="v sm">{(SCALES[looper.scaleId]?.name ?? '').replace('pentatonic', 'pent')}</span><span className="k">scale</span></button>
          <div className={'sr-glass chip slide' + (locked ? ' locked' : '')}><div className="row"><span className="v">{bpmDraft}</span><span className="k">bpm</span></div>
            <input type="range" min={50} max={180} value={bpmDraft} disabled={locked} onChange={(e) => setBpmDraft(+e.target.value)} onPointerUp={commitBpm} onKeyUp={commitBpm} /></div>
          <div className={'sr-glass chip' + (locked ? ' locked' : '')}><div className="step"><button disabled={locked} onClick={() => looper.setBars(looper.bars - 1)}>–</button><span className="v">{looper.bars}</span><button disabled={locked} onClick={() => looper.setBars(looper.bars + 1)}>+</button></div><span className="k">bars</span></div>
          <button className={'sr-glass chip tog' + (looper.metroOn ? ' on' : '')} onClick={() => { looper.toggleMetro(); force(); }}>metronome</button>
          <button className={'sr-glass chip tog' + (looper.quantize ? ' on' : '')} onClick={() => { looper.setQuantize(!looper.quantize); force(); }}>assist</button>
          {/* master VOLUME knob — hidden for now
          <div className="sr-glass chip slide"><div className="row"><span className="v">{looper.masterVolume}</span><span className="k">volume</span></div>
            <input type="range" min={0} max={10} value={looper.masterVolume} onChange={(e) => { looper.setMasterVolume(+e.target.value); force(); }} /></div>
          */}
        </div>
        <div className="sr-top-end">
          <button className={'sr-orb' + (dl ? ' busy' : '')} disabled={looper.layers.length === 0 || dl} onClick={doDownload} title={enabled && !user ? 'sign in to download' : 'download groove (.wav)'} aria-label="download">
            {dl ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></svg>}
          </button>
          <button className={'sr-orb' + (savedId != null ? ' saved' : '')} disabled={savedId != null || busy || looper.layers.length === 0} onClick={doSave}
            title={enabled && !user ? 'sign in to save' : savedId != null ? 'saved — auto-syncs' : 'save this groove'} aria-label="save">
            <svg viewBox="0 0 24 24" fill={savedId != null ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"><path d="M12 21s-7.5-4.6-10-9.2C.4 8.5 1.9 4.9 5.3 4.5 7.5 4.2 9.2 5.4 12 8.2c2.8-2.8 4.5-4 6.7-3.7 3.4.4 4.9 4 3.3 7.3C19.5 16.4 12 21 12 21z" /></svg>
          </button>
          <button className="sr-orb" onClick={() => { void refreshSaves(); setPanel('saves'); }} title="my grooves" aria-label="my grooves">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5M3 16.5l9 5 9-5" /></svg>
          </button>
          <button className="sr-orb" onClick={() => setPanel('keys')} title="learn to groove" aria-label="learn to groove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 3v4M3 5h4M6 17v3M4.5 18.5h3" /><path d="M15 4l2.4 5.6L23 12l-5.6 2.4L15 20l-2.4-5.6L7 12l5.6-2.4L15 4z" /></svg>
          </button>
          {enabled && (user ? (
            <button className="sr-orb acct" onClick={() => void signOut()} title={(user.email ?? 'account') + ' — sign out'} aria-label="sign out">
              <span className="ini">{(user.email ?? '?').charAt(0).toUpperCase()}</span>
            </button>
          ) : (
            <button className="sr-orb" onClick={() => void signInPreserving()} title="sign in with Google" aria-label="sign in">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
            </button>
          ))}
        </div>
      </header>

      {/* stage: tape ribbon (80%) + per-layer mixer (20%) */}
      <div className="sr-stage sr-rise" style={{ ['--d' as string]: 1 }}>
        <section className={'sr-tape sr-glass rec-' + rec}>
          <div className="sr-grid">{Array.from({ length: lb }).map((_, i) => <div key={i} className={'c' + (i % looper.bpb === 0 ? ' bar' : '')}><span>{(i % looper.bpb) + 1}</span></div>)}</div>
          <div className="sr-lanes">
            {looper.layers.map((L, li) => (
              <div key={li} className={'sr-lane ' + L.kind + (L.mute ? ' muted' : '')}>
                {L.kind === 'voice' ? <VoiceWave env={L.env} hue={HUE} />
                  : (L.events ?? []).map((ev, ei) => <span key={ei} className="sr-mark" style={{ left: (ev.beat / lb * 100) + '%', ['--c' as string]: HUE }} />)}
              </div>
            ))}
            {micActive && <div className="sr-liveband"><LiveWave hue={HUE} /></div>}
          </div>
          <div className="sr-sparks" ref={sparkRef} aria-hidden="true" />
          <div className="sr-head" ref={headRef}><i /></div>
          {rec === 'counting' && <div className="sr-count"><span key={looper.countIn}>{looper.countIn || '·'}</span><em>breathe · get ready</em></div>}
          {looper.loopSet && rec === 'idle' && (
            <div className="sr-tp" aria-label="transport">
              <button className="tp-btn play" onClick={() => { looper.playPause(); force(); }} title="play / pause  (enter)" aria-label="play or pause">
                {looper.transportState === 'playing'
                  ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
                  : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <button className="tp-btn" onClick={() => { looper.stop(); force(); }} title="stop  (.)" aria-label="stop">
                <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            </div>
          )}
        </section>
        <aside className="sr-mixer sr-glass">
          <div className="mx-head">layers</div>
          <div className="mx-list">
            {looper.layers.length === 0 ? <p className="mx-empty">Record a layer and it lands here.</p> :
              looper.layers.map((_, i) => i).reverse().map((i) => {   // newest on top
                const L = looper.layers[i];
                return (
                  <div className={'mx-row' + (L.mute ? ' muted' : '')} key={i}>
                    <span className="mx-name">{looper.layerName(i)}</span>
                    <button className={'mx-b' + (L.mute ? ' on' : '')} onClick={() => { looper.setLayerMute(i, !L.mute); force(); }} title="mute">M</button>
                    <button className={'mx-b s' + (L.solo ? ' on' : '')} onClick={() => { looper.setLayerSolo(i, !L.solo); force(); }} title="solo">S</button>
                    <input className="mx-vol" type="range" min={0} max={10} value={looper.layerVol(i)} onChange={(e) => { looper.setLayerVolume(i, +e.target.value); force(); }} title="layer volume" />
                  </div>
                );
              })}
          </div>
        </aside>
      </div>

      {/* selector + fx */}
      <div className="sr-dock sr-rise" style={{ ['--d' as string]: 2 }}>
        <div className="sr-tabs sr-glass">
          <button className={'sr-tab mic' + (micActive ? ' active' : '')} onClick={() => selectTab(0)}><span className="tk">◉</span>{micActive && !looper.micOn ? 'allow mic' : 'mic'}</button>
          <span className="sr-sep" />
          {INSTRUMENTS.map((it, i) => <button key={it.id} className={'sr-tab' + (tab === i + 1 ? ' active' : '')} onClick={() => selectTab(i + 1)}><span className="tk">{i < 9 ? i + 1 : i === 9 ? '–' : '='}</span>{it.label}</button>)}
        </div>
        <div className="sr-pod sr-glass">
          <div className="sr-fxgrid">
            <Fx label="vol" val={fxA.volume} min={0} set={(v) => { looper.setInstVolume(fxId, v); force(); }} />
            <Fx label="rev" val={fxA.reverb} min={0} set={(v) => { looper.setInstReverb(fxId, v); force(); }} />
            <Fx label="drv" val={fxA.drive} min={0} set={(v) => { looper.setInstDrive(fxId, v); force(); }} />
            <Fx label="sus" val={fxA.sustain} min={0} set={(v) => { looper.setInstSustain(fxId, v); force(); }} />
          </div>
          <div className="tr"><button onClick={() => looper.undo()} disabled={looper.layers.length === 0}>undo</button><button onClick={() => looper.clear()} disabled={looper.layers.length === 0}>clear</button></div>
        </div>
      </div>

      {/* keyboard — top (qwerty) + home (asdf) note rows; big REC below */}
      <div className="sr-board sr-rise" style={{ ['--d' as string]: 3 }}>
        {KROWS.slice(1, 3).map((row, ri) => (
          <div className="sr-krow" key={ri}>
            {row.mod && <div className="sr-cap mod" style={{ ['--w' as string]: row.mod.w }}>{row.mod.label}</div>}
            {row.keys.map((char) => {
              const pad = padFor(char);
              const lit = !!pad;
              const micLit = micActive && (ROW_HOME.includes(char) || ROW_TOP.includes(char));
              return (
                <div key={char} ref={(el) => { capRef.current['k:' + char] = el; }}
                  className={'sr-cap' + (lit ? ' lit' : micLit ? ' miclit' : ' asleep')}
                  onPointerDown={(e) => { e.preventDefault(); play(char); }}>
                  <span className="kc">{char.toUpperCase()}</span>{pad && <span className="kn">{pad.label}</span>}
                  <i className="ring" />
                </div>
              );
            })}
            {row.tail?.map((t, ti) => <div key={'t' + ti} className="sr-cap asleep" style={{ ['--w' as string]: t.w }}>{t.label}</div>)}
          </div>
        ))}
        <div className="sr-krow">
          <button className={'sr-cap space rec-' + rec} onPointerDown={(e) => { e.preventDefault(); looper.record(); (e.currentTarget as HTMLButtonElement).blur(); }} style={{ ['--w' as string]: 13 }}><span className="reclbl">{recLabel === 'REC' || recLabel === '＋' ? 'REC' : recLabel}</span><em>space bar</em><i className="ring" /></button>
        </div>
      </div>

      {panel && (
        <div className="sr-drawer-scrim" onClick={() => setPanel(null)}>
          <aside className={'sr-drawer ' + panel} onClick={(e) => e.stopPropagation()}>
            <span className="dwand" aria-hidden="true" />
            <div className="dh">
              <b>{panel === 'keys' ? 'Learn to Groove' : 'My Grooves'}</b>
              <button className="dx" onClick={() => setPanel(null)} aria-label="close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {panel === 'keys' ? (
              <div className="dbody keys">
                {([
                  ['1 – 9 · – =', 'Pick your voice', 'Numbers switch instrument; – and = reach the two calm voices (harp · aura). ` grabs the mic, Tab cycles.'],
                  ['A – L · Q – P', 'Play in tune', 'The glowing keys are your notes. Every press lands in key — you cannot hit a wrong one.'],
                  ['Space', 'Lay it down', 'A 1·2·3·4 count-in, then it captures exactly one loop and stops on its own.'],
                  ['Space again', 'Stack a layer', 'Play something new and hit Space — it overdubs on top of what is already looping.'],
                  ['⌫ · ⇧⌫', 'Take it back', 'Backspace lifts the last layer. Shift + Backspace clears the whole groove.'],
                  ['` then sing', 'Add your voice', 'Pick the mic, allow it, and sing — your voice loops right in with the beat.'],
                  ["' · \\ · /", 'Shape the feel', 'Quote swaps the scale · Backslash toggles the click · Slash toggles assist (snap to grid).'],
                  ['Hold ⌥', 'Twist the knobs', '⌥←→ instrument volume · ⌥R reverb · ⌥D drive · ⌥S sustain, all without touching a slider.'],
                ] as [string, string, string][]).map(([k, t, v], i) => (
                  <div className="lrow" key={k} style={{ ['--d' as string]: i }}>
                    <span className="lk">{k}</span>
                    <span className="lt"><b>{t}</b>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dbody saves">
                {enabled && !user ? (
                  <div className="sr-empty">
                    <span className="ei">✦</span><b>Sign in to save</b>
                    <p>Your grooves live in your account. Sign in with Google to save them and pick up on any device.</p>
                    <button className="groovebtn signin" onClick={() => void signInPreserving()}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 11v2h5.6c-.3 1.4-1.6 4-5.6 4a5 5 0 1 1 0-10c1.5 0 2.8.6 3.6 1.3l1.7-1.7A7.5 7.5 0 1 0 12 20c4.3 0 7.2-3 7.2-7.3 0-.5 0-.9-.1-1.2H12z" /></svg>
                      <span>Continue with Google</span>
                    </button>
                  </div>
                ) : cards.length === 0 ? (
                  <div className="sr-empty"><span className="ei">✦</span><b>No grooves yet</b><p>Build a loop, tap the heart, and it lands here.</p></div>
                ) : cards.map((c, i) => {
                  const scale = (SCALES[c.scaleId]?.name || '').replace('pentatonic', 'pent');
                  return (
                    <div className="sr-card" key={c.id} style={{ ['--d' as string]: i }}>
                      <div className="ch">
                        <b>{c.name}</b>
                        <button className="rm" onClick={() => void delSave(c.id)} aria-label="remove groove" title="remove">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
                        </button>
                      </div>
                      <div className="meta">
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="7" cy="18" r="2.5" /><circle cx="18" cy="15.5" r="2.5" /><path d="M9.5 18V6l11-2v11.5" /></svg><em>{KEYS[c.keyRoot]}</em><i>in the key of</i></span>
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12c2.5-6 4.5-6 7 0s4.5 6 7 0 4.5-6 6-3" /></svg><em>{scale}</em><i>scale</i></span>
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12h4l2-6 4 12 2-6h6" /></svg><em>{c.bpm}</em><i>bpm tempo</i></span>
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 4v16M12 4v16M18 4v16" /></svg><em>{c.bars}</em><i>bars long</i></span>
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 8V6a2 2 0 0 1 2-2M5 16v2a2 2 0 0 0 2 2M19 8V6a2 2 0 0 0-2-2M19 16v2a2 2 0 0 1-2 2M9 12h6" /></svg><em>{c.quantize ? 'on' : 'off'}</em><i>assist snap</i></span>
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /></svg><em>{c.layerCount}</em><i>layers deep</i></span>
                      </div>
                      <button className="groovebtn" disabled={busy} onClick={() => void playSave(c.id)}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l11-7z" /></svg><span>Groove</span><i className="shine" />
                      </button>
                    </div>
                  );
                })}
                {cloud && localPending > 0 && (
                  <button className="sr-import" disabled={busy} onClick={() => void importLocal()}>
                    Import {localPending} local groove{localPending > 1 ? 's' : ''} to your account
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
