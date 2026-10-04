/*
 * Keeps the 3D assets across a page refresh.
 *
 * THE PROBLEM. Reloading the page re-fetched every mesh. drei's useGLTF cache
 * is per-page-load, so a refresh starts empty and asks the network again, and
 * the dev server answers with revalidation rather than a hard cache hit -- so
 * every refresh paid for another round of requests before anything could be
 * drawn. With the scene's assets that is a long wait for bytes the machine
 * already had.
 *
 * WHAT THIS DOES. Cache Storage survives reloads, so the second visit is
 * served from disk with no network at all. The scope is deliberately narrow:
 * only binary 3D assets (GLB and STL), the Draco decoder, the PNG/WebP/JPEG
 * images, the realistic look's HDR environment and the headset's Ogg sound
 * recordings under /assets. Everything else -- HTML, JS bundles, CSS, API calls --
 * is left completely alone, so this cannot serve stale code or interfere with
 * hot reloading while developing.
 *
 * TWO STRATEGIES, because the URLs come in two kinds.
 *
 *   Versioned (?v=... , the Otokar meshes): cache-first, never revalidated.
 *   The version string IS the cache key, so bumping OTOKAR_ASSET_VERSION
 *   changes the URL and misses the cache by construction. There is no way for
 *   a stale mesh to be served for a version that asked for something else.
 *
 *   Unversioned (the worker, drone, warehouse and parked-bus props, the
 *   IFARLAB STL meshes, the logos): stale-while-revalidate. The cached copy is
 *   returned immediately -- which is the whole point -- and a fresh copy is
 *   fetched in the background for the next load. That background fetch goes
 *   through the HTTP cache, so with the host's ETags an unchanged file comes
 *   back as a bodiless 304. So replacing a prop costs one reload to take effect
 *   rather than never taking effect.
 */

const CACHE = 'matisse-assets-v1';

// Only these. Anything not matching goes straight to the network untouched.
const ASSET_RE = /\/(meshes|assets|draco)\/.*\.(glb|gltf|bin|wasm|js|stl|png|webp|jpe?g|hdr|ogg)$/i;

self.addEventListener('install', (event) => {
  // Take over without the usual wait, so the first load after registering
  // already benefits instead of the one after that.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('matisse-assets-') && n !== CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  // Match on pathname, not the whole href: the Otokar URLs carry ?v=... and a
  // test against the full string would never see the extension.
  return ASSET_RE.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Same-origin only. A cross-origin CDN response is likely opaque, and
  // caching opaque responses hides failures as successes.
  if (url.origin !== self.location.origin) return;
  if (!isAsset(url)) return;

  const versioned = url.searchParams.has('v');

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);

      if (hit && versioned) return hit;

      const network = fetch(request)
        .then((response) => {
          // Only store real successes. A 206, an error page or an opaque
          // response cached here would be replayed on every later load.
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch((err) => {
          if (hit) return hit;
          throw err;
        });

      // Unversioned and already cached: answer now, refresh behind.
      if (hit) {
        event.waitUntil(network.catch(() => {}));
        return hit;
      }
      return network;
    })(),
  );
});
