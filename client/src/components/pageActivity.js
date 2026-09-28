/*
 * WHETHER ANYONE IS LOOKING.
 *
 * A tab left open in the background kept its telemetry stream and presence
 * socket going for as long as the browser lived, and every one of those
 * streams is API bandwidth. runWhileVisible stops a connection once the page
 * has been hidden for a minute and starts it again the moment it is shown.
 *
 * Not while a VR session runs: a headset browser may report the 2D page as
 * hidden while the wearer is inside the hall, which is exactly when the
 * stream matters. xrSession.js reports the session here (setXRActive), so
 * this module stays tiny and the guides never load the XR code.
 */

const HIDDEN_GRACE_MS = 60000;

let xrActive = false;
const xrListeners = new Set();

export function setXRActive(active) {
  if (xrActive === active) return;
  xrActive = active;
  xrListeners.forEach((listener) => listener());
}

/**
 * Calls start() now and whenever the page is shown again, and stop() once it
 * has been hidden for HIDDEN_GRACE_MS outside a VR session. Returns a cleanup
 * that stops for good.
 */
export function runWhileVisible(start, stop) {
  let running = false;
  let timer = null;

  const ensureRunning = () => {
    clearTimeout(timer);
    timer = null;
    if (!running) {
      running = true;
      start();
    }
  };
  const update = () => {
    if (document.visibilityState !== 'hidden' || xrActive) {
      ensureRunning();
    } else if (running && !timer) {
      timer = setTimeout(() => {
        timer = null;
        running = false;
        stop();
      }, HIDDEN_GRACE_MS);
    }
  };

  ensureRunning();
  update();
  document.addEventListener('visibilitychange', update);
  xrListeners.add(update);

  return () => {
    document.removeEventListener('visibilitychange', update);
    xrListeners.delete(update);
    clearTimeout(timer);
    if (running) {
      running = false;
      stop();
    }
  };
}
