import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Studio from './pages/Studio';
import AuthCallback from './pages/AuthCallback';

// Concept prototypes — lazy so their WebGL/three payload only loads when visited.
const Try1 = lazy(() => import('./try/ZeroG'));
const Try2 = lazy(() => import('./try/Merge'));

// Aurora Groove — routes. Anything unknown falls back to the landing page.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/try1" element={<Suspense fallback={<div style={{ background: '#05040c', width: '100%', height: '100vh' }} />}><Try1 /></Suspense>} />
        <Route path="/try2" element={<Suspense fallback={<div style={{ background: '#05040c', width: '100%', height: '100vh' }} />}><Try2 /></Suspense>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
