import { useEffect, useState } from 'react';
import { API_BASE } from './apiBase';
import { runWhileVisible } from './pageActivity';

/*
 * THE LIVE TELEMETRY STREAM, ON EVERY PAGE.
 *
 * App owns the one EventSource a page opens, so the navbar's Live badge tells
 * the truth on the guides too -- it used to be opened by the twin alone, and
 * /docs and /vr sat on "Connecting" for good. The twin subscribes to the joint
 * states it carries; the guides only need the badge, so they ask the API to
 * send them less often.
 *
 * Status rules, unchanged from when this lived in DigitalTwin: "live" on a
 * joint_states event with a new timestamp; an error only reads "offline" once
 * nothing has arrived for 10 s, since EventSource reconnects by itself.
 *
 * The stream is closed after a minute in a background tab and reopened when
 * the tab is shown again (pageActivity.js): a forgotten tab no longer streams
 * all day on the API's bandwidth.
 */

const OFFLINE_AFTER_MS = 10000;

const listeners = new Set();
let latest = null;

/** Calls `listener(payload)` for every new joint_states event; returns an unsubscribe. */
export function subscribeJointStates(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The most recent joint_states payload on this page, or null. */
export function latestJointStates() {
  return latest;
}

function openStream(intervalMs, setStatus) {
  const es = new EventSource(`${API_BASE}/telemetry/joint-states/stream?interval=${intervalMs}`);
  let lastTimestamp = null;
  let lastActivity = 0;

  const markActivity = () => {
    lastActivity = Date.now();
    setStatus((prev) => (prev === 'offline' ? 'connecting' : prev));
  };

  es.addEventListener('open', () => {
    setStatus((prev) => (prev === 'live' ? prev : 'connecting'));
  });

  es.addEventListener('hello', () => {
    markActivity();
    setStatus((prev) => (prev === 'live' ? prev : 'connecting'));
  });

  es.addEventListener('joint_states', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    const ur10eOk = Array.isArray(payload?.ur10e) && payload.ur10e.length === 6;
    const kawasakiOk = Array.isArray(payload?.kawasaki) && payload.kawasaki.length === 6;
    if (!ur10eOk && !kawasakiOk) return;
    if (payload.timestamp && payload.timestamp === lastTimestamp) return;
    lastTimestamp = payload.timestamp || null;
    lastActivity = Date.now();
    latest = payload;
    setStatus('live');
    listeners.forEach((listener) => listener(payload));
  });

  es.addEventListener('error', () => {
    if (Date.now() - lastActivity > OFFLINE_AFTER_MS) {
      setStatus('offline');
    } else {
      setStatus((prev) => (prev === 'live' ? prev : 'connecting'));
    }
  });

  return es;
}

/** Holds the stream open while the page is in use; returns 'connecting' | 'live' | 'offline'. */
export function useTelemetryStream(intervalMs) {
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    let es = null;
    return runWhileVisible(
      () => {
        es = openStream(intervalMs, setStatus);
      },
      () => {
        es?.close();
        es = null;
      },
    );
  }, [intervalMs]);

  return status;
}
