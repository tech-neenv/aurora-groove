import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// /auth/callback — Supabase parses the OAuth token from the URL on load
// (detectSessionInUrl); once auth resolves we send the player into the studio.
export default function AuthCallback() {
  const nav = useNavigate();
  const { loading } = useAuth();
  useEffect(() => { if (!loading) nav('/studio', { replace: true }); }, [loading, nav]);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: '#05040c', color: '#cfc6ff' }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(155,140,255,.25)', borderTopColor: '#9B8CFF', animation: 'agspin .8s linear infinite' }} />
      <p style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: '1.05rem' }}>Signing you in…</p>
      <style>{'@keyframes agspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
