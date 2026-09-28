import React, { lazy, Suspense } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { useTelemetryStream } from './components/telemetryStream';
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

// The twin moves its arms at the stream's pace; the guides only show the
// badge, so they ask the API to poll MongoDB every 2 s instead of 4 times a second.
const TWIN_STREAM_MS = 250;
const GUIDE_STREAM_MS = 2000;

export default function App() {
  const onGuide = isDocs() || isVR();
  // One telemetry stream per page, for the navbar's badge on every page and
  // for the twin's arms (telemetryStream.js).
  const liveStatus = useTelemetryStream(onGuide ? GUIDE_STREAM_MS : TWIN_STREAM_MS); // 'connecting' | 'live' | 'offline'

  return (
    <div className="app-shell">
      <Navbar liveStatus={liveStatus} />
      <main className="app-main">
        {isDocs() ? <Documentation /> : isVR() ? <VRIntegration /> : (
          <Suspense fallback={null}>
            <DigitalTwin liveStatus={liveStatus} />
          </Suspense>
        )}
      </main>
      <Footer />
    </div>
  );
}
