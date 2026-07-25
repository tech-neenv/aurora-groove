import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase client — only spun up when the env keys are present. Until then the
// app runs fully local (grooves in localStorage, no sign-in). `supabaseEnabled`
// lets the UI hide/disable cloud features cleanly.
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled: boolean = !!(url && anon);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
