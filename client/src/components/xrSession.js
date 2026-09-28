import { useEffect, useState, useSyncExternalStore } from 'react';
import { createXRStore } from '@react-three/xr';

/*
 * ONE XR STORE FOR THE PAGE, AND THE KNOBS QA TURNS ON THE HEADSET.
 *
 * The store is module-level so the VR button (DOM, outside the Canvas) and the
 * scene (inside it) talk to the same session.
 *
 * Quest performance cannot be judged from a desktop, and redeploying to try a
 * different setting costs minutes per try. So the settings that decide frame
 * rate on the headset are read from the URL, and a tester types them into the
 * Quest browser's address bar:
 *
 *   ?vrshadows=soft|hard|off   shadow quality in VR (default hard)
 *   ?lod=auto|lo|hi            Otokar mesh tier, from page load (default auto)
 *   ?vrscale=0.8               framebuffer scale, below 1 trades sharpness for fps
 *   ?vrstats=1|0               fps readout in the headset (on for qa. and localhost)
 *   ?vremu=1                   Meta Quest 3 emulator on any host, for a desktop
 *                              browser with no headset (localhost always has it)
 */
const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
const isTestHost = hostname === 'localhost' || hostname.startsWith('qa.');

function choice(name, allowed, fallback) {
  const value = params.get(name);
  return allowed.includes(value) ? value : fallback;
}

/*
 * The Quest browser renders the 2D page on the same mobile GPU, so it takes the
 * headset profile from the first frame. Switching shadow shading when the
 * session starts would recompile every material in the hall, and on the
 * headset that stall lands inside the headset view.
 */
export const IS_QUEST_BROWSER = typeof navigator !== 'undefined' && /OculusBrowser/.test(navigator.userAgent);

export const VR_OPTIONS = Object.freeze({
  shadows: choice('vrshadows', ['soft', 'hard', 'off'], 'hard'),
  lod: choice('lod', ['auto', 'lo', 'hi'], 'auto'),
  frameBufferScaling: Number(params.get('vrscale')) || undefined,
  stats: params.has('vrstats') ? params.get('vrstats') === '1' : isTestHost,
});

export const xrStore = createXRStore({
  // Quest 3 supports immersive-ar too, and the default offer would pick it: the
  // browser's own "enter" button must put people in the hall, not passthrough.
  offerSession: 'immersive-vr',
  emulate: params.get('vremu') === '1' ? { type: 'metaQuest3', inject: true } : 'metaQuest3',
  // Full fixed foveation: the edges of each eye render at lower resolution,
  // where the lens blurs them anyway. The single biggest GPU saving on Quest.
  foveation: 1,
  frameBufferScaling: VR_OPTIONS.frameBufferScaling,
  controller: { teleportPointer: true },
  hand: { teleportPointer: true },
});

// For automated checks on test hosts only: drive the emulator's sticks and
// trigger, read where the origin went. Never exposed on production.
if (isTestHost && typeof window !== 'undefined') window.__xrStore = xrStore;

const subscribe = (callback) => xrStore.subscribe(callback);
const sessionActive = () => xrStore.getState().session != null;

/** True while an immersive session is running. Usable outside the Canvas. */
export function useXRSessionActive() {
  return useSyncExternalStore(subscribe, sessionActive, () => false);
}

/**
 * Whether this browser can enter immersive VR. False on an ordinary desktop, so
 * production visitors never see the button; true on a Quest, and on localhost
 * once the emulator has been injected (asynchronously -- hence the re-checks).
 */
export function useVRSupported() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => {
      navigator.xr?.isSessionSupported('immersive-vr')
        .then((ok) => alive && setSupported(Boolean(ok)))
        .catch(() => {});
    };
    check();
    navigator.xr?.addEventListener?.('devicechange', check);
    const unsubscribe = xrStore.subscribe((state, prev) => {
      if (state.emulator !== prev.emulator) check();
    });
    return () => {
      alive = false;
      navigator.xr?.removeEventListener?.('devicechange', check);
      unsubscribe();
    };
  }, []);
  return supported;
}

export function enterVR() {
  return xrStore.enterVR().catch((error) => {
    // eslint-disable-next-line no-console
    console.warn('could not start VR:', error?.message || error);
  });
}

export function exitVR() {
  return xrStore.getState().session?.end();
}
