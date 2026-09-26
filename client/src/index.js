import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

/*
 * KEEPS THE 3D ASSETS ACROSS A REFRESH.
 *
 * drei's useGLTF cache lives for one page load, so reloading started from
 * nothing and asked the network for every mesh again. Cache Storage does
 * survive reloads, so public/sw-assets.js answers the second visit from disk
 * with no network at all.
 *
 * Its scope is only binary 3D assets and the Draco decoder -- HTML, JS, CSS
 * and API calls are passed through untouched, so it cannot serve stale code or
 * interfere with hot reloading. Registration is deliberately late (after load)
 * so installing it never competes with the first paint for bandwidth.
 *
 * If it ever needs to be taken out: navigator.serviceWorker.getRegistrations()
 * then .unregister() on each, or Application > Service Workers in devtools.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL}/sw-assets.js`)
      .catch((err) => {
        // A failed registration must never take the page down with it: the app
        // works without it, just without the cache.
        // eslint-disable-next-line no-console
        console.warn('asset cache unavailable:', err.message);
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
