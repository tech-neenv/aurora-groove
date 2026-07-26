import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Studio from './pages/Studio';
import AuthCallback from './pages/AuthCallback';

// /goodlanding is heavy (R3F + postprocessing) — lazy-load so it never weighs
// down the main landing bundle.
const GoodLanding = lazy(() => import('./goodlanding/GoodLanding'));
// /v2landing — aurora-video scroll-scrub experience. Also heavy; lazy-load.
const V2Landing = lazy(() => import('./v2landing/V2Landing'));

// Aurora Groove — routes. Anything unknown falls back to the landing page.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Suspense fallback={<div style={{ background: '#04030a', width: '100%', height: '100vh' }} />}><V2Landing /></Suspense>} />
        <Route path="/classic" element={<Landing />} />
        <Route path="/studio" element={<Studio />} />
        <Route
          path="/goodlanding"
          element={
            <Suspense fallback={<div style={{ background: '#05040c', width: '100%', height: '100vh' }} />}>
              <GoodLanding />
            </Suspense>
          }
        />
        <Route
          path="/v2landing"
          element={
            <Suspense fallback={<div style={{ background: '#04030a', width: '100%', height: '100vh' }} />}>
              <V2Landing />
            </Suspense>
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
