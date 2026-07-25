import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseEnabled } from './supabase';

// Auth state for Aurora Groove. When Supabase isn't configured (`enabled=false`)
// everything stays local and the sign-in UI hides itself.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(supabaseEnabled);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = () =>
    supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  const signOut = () => supabase?.auth.signOut();

  return { user, loading, signIn, signOut, enabled: supabaseEnabled };
}

export type { User };
