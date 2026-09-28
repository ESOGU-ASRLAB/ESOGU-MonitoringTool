import React, { lazy, Suspense, useState } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Documentation from './pages/Documentation';
import VRIntegration from './pages/VRIntegration';

// Lazy so /docs and /vr never evaluate the scene modules: Factory, Bus, Drone
// and Worker call useGLTF.preload at import time, which would start ~2 MB of
// GLB downloads on pages that show no 3D at all.
const DigitalTwin = lazy(() => import('./pages/DigitalTwin'));

// Pages chosen by path: the technical guide at /docs, the VR guide at /vr, the
// twin otherwise.
const isDocs = () => /^\/docs\/?$/.test(window.location.pathname);
const isVR = () => /^\/vr\/?$/.test(window.location.pathname);

export default function App() {
  // Lifted out of DigitalTwin so the live-status badge can render in the
  // Navbar (one header row instead of two) while DigitalTwin's SSE effect
  // keeps driving it exactly as before, just through the passed-in setter.
  const [liveStatus, setLiveStatus] = useState('connecting'); // 'connecting' | 'live' | 'offline'

  return (
    <div className="app-shell">
      <Navbar liveStatus={liveStatus} />
      <main className="app-main">
        {isDocs() ? <Documentation /> : isVR() ? <VRIntegration /> : (
          <Suspense fallback={null}>
            <DigitalTwin liveStatus={liveStatus} setLiveStatus={setLiveStatus} />
          </Suspense>
        )}
      </main>
      <Footer />
    </div>
  );
}
