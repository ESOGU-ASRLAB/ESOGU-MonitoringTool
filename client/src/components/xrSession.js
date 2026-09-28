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
 *   ?vrshadows=soft|hard|off   shadow quality in VR (default off)
 *   ?lod=auto|vr|lo|hi         Otokar mesh tier, from page load (default vr in a
 *                              headset, auto elsewhere)
 *   ?vrscenery=lite|full       hall decoration in a headset (default lite: no
 *                              parked buses, forklift, scrubber, drones, yard)
 *   ?vrhz=72|90|120            refresh rate asked of the headset (default 72)
 *   ?vrscale=0.8               framebuffer scale, below 1 trades sharpness for fps
 *   ?vrstats=1|0               fps readout in the headset (on for qa. and localhost)
 *   ?vremu=1                   Meta Quest 3 emulator on any host, for a desktop
 *                              browser with no headset (localhost always has it)
 *   ?vrclickms=1500            longest trigger press that still counts as a click;
 *                              raised only for automated emulator runs, where a
 *                              software-rendered session draws a frame every
 *                              few seconds and no press can be shorter than that
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

/*
 * THE HEADSET DEFAULTS, AND WHAT THEY WERE MEASURED AGAINST.
 *
 * Counted on the hall as it loads (renderer.info), per frame:
 *
 *   Otokar cell, lo tier       0.79 M triangles
 *   Otokar cell, hi tier       6.08 M triangles
 *   everything else            ~2.1 M triangles
 *   shadow pass                every shadow caster again: 1.9 M on lo, 8.0 M on hi
 *
 * Standing in the cell switches 'auto' to the hi tier, and in a headset the
 * scene is drawn once per eye, so a walk-up put ~26 M triangles a frame on a
 * mobile GPU. Hence: the lo tier, no shadow pass, and 72 Hz rather than the
 * library's default of the highest rate offered (90/120 Hz on Quest 3), which
 * leaves 8-11 ms a frame where 72 Hz leaves 13.9. Each stays a URL knob so the
 * headset can be tried the other way without a redeploy.
 *
 * That was still ~2.9 M triangles per eye, most of it the two cells at CAD
 * density, and the headset still stuttered. So the headset now also gets:
 *
 *   the Otokar 'vr' tier       0.32 M (lo simplified, scripts/otokar/build_vr_tier.mjs)
 *   the IFARLAB meshes         0.15 M, down from 1.13 M, for every viewer
 *                              (scripts/ifarlab/simplify_meshes.mjs)
 *   lite scenery               the parked buses, forklift, scrubber, drones and
 *                              yard left out: ~0.35 M and ~130 draw calls of
 *                              decoration nobody walks the hall to see
 */
export const VR_OPTIONS = Object.freeze({
  shadows: choice('vrshadows', ['soft', 'hard', 'off'], 'off'),
  // null = not set in the URL; DigitalTwin then picks by device.
  lod: choice('lod', ['auto', 'vr', 'lo', 'hi'], null),
  scenery: choice('vrscenery', ['lite', 'full'], 'lite'),
  hz: Number(choice('vrhz', ['72', '90', '120'], '72')),
  frameBufferScaling: Number(params.get('vrscale')) || undefined,
  stats: params.has('vrstats') ? params.get('vrstats') === '1' : isTestHost,
  clickMs: Number(params.get('vrclickms')) || 1500,
});

// The supported rate nearest the one asked for (Quest 3 offers 72/80/90/120).
function pickFrameRate(supported) {
  let best = supported[0];
  for (const rate of supported) {
    if (Math.abs(rate - VR_OPTIONS.hz) < Math.abs(best - VR_OPTIONS.hz)) best = rate;
  }
  return best;
}

export const xrStore = createXRStore({
  // Quest 3 supports immersive-ar too, and the default offer would pick it: the
  // browser's own "enter" button must put people in the hall, not passthrough.
  offerSession: 'immersive-vr',
  emulate: params.get('vremu') === '1' ? { type: 'metaQuest3', inject: true } : 'metaQuest3',
  // Full fixed foveation: the edges of each eye render at lower resolution,
  // where the lens blurs them anyway. The single biggest GPU saving on Quest.
  foveation: 1,
  frameRate: pickFrameRate,
  frameBufferScaling: VR_OPTIONS.frameBufferScaling,
  /*
   * No teleport pointer: it shared the trigger with the ray pointer, and the
   * one whose hit is nearer takes the press. The teleport arc bends down to the
   * floor, so it landed nearer than any robot a few metres off -- in the
   * emulator, with the ray resting on a robot's hit box, pulling the trigger
   * moved the wearer 1.34 m instead of opening its panel. The trigger now only
   * selects; VRWalk teleports on the right stick pushed forward, as Meta's
   * apps do.
   *
   * And a click is any press released within 1.5 s. The pointer library's
   * default is 300 ms -- a mouse click -- but a trigger is pulled and let go
   * deliberately, and a press held a little longer simply did nothing.
   */
  controller: { teleportPointer: false, rayPointer: { clickThresholdMs: VR_OPTIONS.clickMs } },
  hand: { teleportPointer: false, rayPointer: { clickThresholdMs: VR_OPTIONS.clickMs } },
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
