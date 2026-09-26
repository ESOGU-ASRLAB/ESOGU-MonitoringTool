import { useEffect, useRef, useState } from 'react';

/*
 * LIVE AXIS VALUES, OUT OF THE RENDER LOOP.
 *
 * The panel needs to show what each machine is actually doing, and the
 * machines do not go through React to do it: every robot here animates inside
 * its own useFrame, writing straight to the three.js objects. React state is
 * only the MANUAL pose, so with the engine running it is stale -- the sliders
 * say one thing while the arm does another.
 *
 * Lifting the animation into state instead would re-render the whole page
 * sixty times a second to move a number, which is the wrong trade for a
 * readout. So the frame loop writes here, and the panel samples at a rate a
 * person can actually read.
 *
 * PUBLISHERS MUST REUSE THEIR ARRAY. publish() keeps the reference rather than
 * copying, so allocating a fresh array every frame would hand the collector
 * work sixty times a second per robot. The sampler copies instead, once per
 * sample, which is where copying is cheap.
 */
const store = new Map();

export function publishTelemetry(id, values, extra) {
  store.set(id, { values, extra });
}

/*
 * Nothing calls this when the page unmounts, and it does not need to: the
 * store is keyed by robot id, so a remount overwrites rather than accumulates.
 */
export function clearTelemetry() {
  store.clear();
}

/*
 * A snapshot of every robot's axes, refreshed `hz` times a second.
 *
 * 8 Hz by default. Fast enough that the numbers look live and move with the
 * machine, slow enough to read: at 60 Hz the digits are a blur and the panel
 * re-renders as often as the scene does, for no information a reader can take
 * in.
 */
export function useTelemetry(hz = 8, windowSamples = 48) {
  const [snapshot, setSnapshot] = useState(() => ({}));
  /*
   * Kept in a ref, not in state: the history is APPENDED every sample and read
   * only when the panel draws, so putting it in state would mean a second
   * render per tick for data the first render already carried.
   */
  const historyRef = useRef(new Map());

  useEffect(() => {
    const history = historyRef.current;

    const tick = () => {
      const next = {};
      let any = false;
      for (const [id, entry] of store) {
        const values = entry.values.slice();
        any = true;

        let traces = history.get(id);
        if (!traces || traces.length !== values.length) {
          traces = values.map(() => []);
          history.set(id, traces);
        }
        for (let i = 0; i < values.length; i += 1) {
          const trace = traces[i];
          trace.push(values[i]);
          if (trace.length > windowSamples) trace.shift();
        }

        next[id] = { values, extra: entry.extra, traces };
      }
      if (any) setSnapshot(next);
    };

    tick();
    const timer = setInterval(tick, 1000 / hz);
    return () => clearInterval(timer);
  }, [hz, windowSamples]);

  return snapshot;
}

/*
 * A trace scaled to its own recent range, as points in a 0..1 box.
 *
 * PER-AXIS AUTOSCALING, not a fixed range, and that is the whole reason the
 * strip is worth drawing. The axes here span wildly different numbers -- a
 * gantry rail travels 15 000 mm while a wrist turns 90 degrees -- so one
 * shared scale would flatten every rotary axis into a line at the bottom of
 * the box. Scaling each to what it has actually done in the window shows
 * MOTION, which is what a live strip is for.
 *
 * The cost of autoscaling is that a still axis would otherwise be amplified
 * into noise, because a range of nothing normalises to full height. `floor`
 * guards that: below it the axis is drawn flat at mid height, which is the
 * truthful picture of an axis that is not moving.
 */
export function normaliseTrace(trace, floor = 1e-6) {
  if (!trace || trace.length < 2) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of trace) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  const last = trace.length - 1;
  if (!(span > floor)) return trace.map((_, i) => [i / last, 0.5]);
  return trace.map((v, i) => [i / last, (v - min) / span]);
}
