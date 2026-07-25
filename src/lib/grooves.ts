import { supabase } from './supabase';
import { looper, type Session, type SavedLayer } from '../looper/looper';

// Cloud groove store. A groove row holds the instrument layers (note-events + fx)
// as JSON; voice audio is uploaded to the private `voice` Storage bucket as WAV
// and referenced by path — never base64 in the row.

export interface GrooveMeta {
  id: string;
  name: string;
  keyRoot: number;
  scaleId: string;
  bpm: number;
  bars: number;
  quantize: boolean;
  layerCount: number;
  updatedAt: string;
}

interface GrooveRow {
  id: string;
  name: string;
  key_root: number;
  scale_id: string;
  bpm: number;
  bars: number;
  quantize: boolean;
  layers: SavedLayer[];
  voice_paths: string[];
  updated_at: string;
}

async function uid(): Promise<string> {
  const { data } = await supabase!.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('not signed in');
  return id;
}

export async function listGrooves(): Promise<GrooveMeta[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('grooves')
    .select('id,name,key_root,scale_id,bpm,bars,quantize,layers,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, keyRoot: r.key_root, scaleId: r.scale_id, bpm: r.bpm, bars: r.bars,
    quantize: r.quantize, layerCount: Array.isArray(r.layers) ? r.layers.length : 0, updatedAt: r.updated_at,
  }));
}

// Save (insert or update). Uploads each voice layer's audio as a WAV, strips the
// base64 PCM out of the stored JSON. Returns the groove id.
export async function saveGroove(session: Session, name: string, existingId?: string): Promise<string> {
  if (!supabase) throw new Error('cloud disabled');
  const userId = await uid();
  const id = existingId ?? crypto.randomUUID();

  const voicePaths: string[] = [];
  const storedLayers: SavedLayer[] = [];
  let vi = 0;
  for (const L of session.layers) {
    if (L.kind === 'voice') {
      const path = `${userId}/${id}/${vi}.wav`;
      const wav = looper.voicePcmToWav(L.pcm);
      const { error } = await supabase.storage.from('voice').upload(path, wav, { upsert: true, contentType: 'audio/wav' });
      if (error) throw error;
      voicePaths.push(path);
      storedLayers.push({ kind: 'voice', pcm: '', fx: L.fx });   // marker — audio lives in Storage
      vi++;
    } else {
      storedLayers.push(L);
    }
  }

  const row: GrooveRow = {
    id, name, key_root: session.keyRoot, scale_id: session.scaleId, bpm: session.bpm, bars: session.bars,
    quantize: session.quantize, layers: storedLayers, voice_paths: voicePaths, updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('grooves').upsert({ ...row, user_id: userId });
  if (error) throw error;
  return id;
}

// Load a groove into a full Session (downloads + decodes any voice WAVs).
export async function loadGroove(id: string): Promise<Session> {
  if (!supabase) throw new Error('cloud disabled');
  const { data, error } = await supabase.from('grooves').select('*').eq('id', id).single();
  if (error) throw error;
  const row = data as GrooveRow;

  const layers: SavedLayer[] = [];
  let vi = 0;
  for (const L of row.layers) {
    if (L.kind === 'voice') {
      const path = row.voice_paths[vi++];
      let pcm = '';
      if (path) {
        const { data: blob, error: dlErr } = await supabase.storage.from('voice').download(path);
        if (!dlErr && blob) pcm = await looper.wavToPcm(await blob.arrayBuffer());
      }
      layers.push({ kind: 'voice', pcm, fx: L.fx });
    } else {
      layers.push(L);
    }
  }
  return { bpm: row.bpm, bars: row.bars, keyRoot: row.key_root, scaleId: row.scale_id, quantize: row.quantize, layers };
}

export async function deleteGroove(id: string): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.from('grooves').select('voice_paths').eq('id', id).single();
  const paths = (data as { voice_paths?: string[] } | null)?.voice_paths ?? [];
  if (paths.length) await supabase.storage.from('voice').remove(paths);
  await supabase.from('grooves').delete().eq('id', id);
}
