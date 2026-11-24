import React, { lazy, Suspense } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { useTelemetryStream } from './components/telemetryStream';
import Documentation from './pages/Documentation';
import VRIntegration from './pages/VRIntegration';
import { LanguageProvider } from './LanguageContext';

/*
 * A lazy page that heals a poisoned chunk.
 *
 * During a deploy a browser can ask for a new chunk a moment before the host
 * has it. Cloudflare Pages then answered with index.html and a 200, the zone's
 * browser TTL told the browser to keep that for 4 hours, and the twin stayed a
 * blank page on that browser -- only a private window or a cleared cache
 * brought it back. So on a ChunkLoadError, fetch the chunk again past the
 * browser cache (which also overwrites the bad copy there) and retry; if the
 * chunk is really gone -- a page from an older deploy -- reload once to pick
 * up the current index.html.
 *
 * The build also writes build/404.html (package.json postbuild). With one at
 * the top level Pages stops answering unknown paths with index.html and a 200
 * and sends a 404 instead, so no browser or service worker keeps a page as a
 * script or a mesh. /docs and /vr are real files, so nothing needed the old
 * fallback.
 */
const RELOADED_KEY = 'chunk-reload-at';
const CHUNK_RETRIES = 4;

function lazyWithRecovery(load) {
  return lazy(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await load();
      } catch (error) {
        if (error?.name !== 'ChunkLoadError') throw error;
        if (attempt < CHUNK_RETRIES) {
          // webpack forgets a failed chunk, so the retry asks for it again,
          // and finds this fresh copy in the browser cache.
          if (error.request) await fetch(error.request, { cache: 'reload' }).catch(() => {});
          continue;
        }
        let canReload = false;
        try {
          const last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
          if (Date.now() - last > 60000) {
            sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
            canReload = true;
          }
        } catch {
          // Without storage a second reload looks like the first: never loop.
        }
        if (!canReload) throw error;
        window.location.reload();
        return new Promise(() => {});
      }
    }
  });
}

// Lazy so /docs and /vr never evaluate the scene modules: Factory, Bus, Drone
// and Worker call useGLTF.preload at import time, which would start ~2 MB of
// GLB downloads on pages that show no 3D at all.
const DigitalTwin = lazyWithRecovery(() => import('./pages/DigitalTwin'));

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
    <LanguageProvider>
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
    </LanguageProvider>
  );
}
