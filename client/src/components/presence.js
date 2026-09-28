import { useEffect, useSyncExternalStore } from 'react';
import { PRESENCE_URL } from './apiBase';
import { runWhileVisible } from './pageActivity';

/*
 * WHO ELSE IS IN THE HALL -- the page's side of api/presence.js.
 *
 * One socket per page, module-level like the XR store, so the React tree can
 * mount and unmount around it. The page says whether it is a desktop view or a
 * headset, reports where its viewer stands, and keeps a list of everyone else.
 *
 * Two speeds of change, kept apart on purpose:
 *
 *   the LIST (joins, leaves, a label or kind changing) is React state through
 *   usePeers(), because it decides which workers are mounted;
 *
 *   POSES arrive several times a second per visitor and are written onto the
 *   peer objects in place, for useFrame to read through getPeer() -- putting
 *   them in state would re-render the scene for every step anyone takes.
 */

const RECONNECT_MAX_MS = 30000;
// At most 5 poses a second, and only for a move worth seeing: 3 cm or ~2°.
const SEND_INTERVAL_MS = 200;
const MIN_MOVE_M = 0.03;
const MIN_TURN_RAD = 0.03;

const peers = new Map(); // id -> { id, label, kind, pose: { x, z, yaw } | null }
let self = null; // { id, label } once the server has welcomed this page
let snapshot = [];
const listeners = new Set();

function emit() {
  snapshot = [...peers.values()];
  listeners.forEach((listener) => listener());
}

let socket = null;
let wanted = false;
let kind = 'desktop';
let attempts = 0;
let retryTimer = null;
let lastSent = null;
let lastSentAt = 0;

function handleMessage(data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  switch (msg.t) {
    case 'welcome':
      self = { id: msg.id, label: msg.label };
      peers.clear();
      for (const p of msg.peers) peers.set(p.id, { id: p.id, label: p.label, kind: p.kind, pose: p.pose });
      emit();
      break;
    case 'peer': {
      const known = peers.get(msg.id);
      if (known) {
        known.label = msg.label;
        known.kind = msg.kind;
      } else {
        peers.set(msg.id, { id: msg.id, label: msg.label, kind: msg.kind, pose: null });
      }
      emit();
      break;
    }
    case 'pose': {
      const peer = peers.get(msg.id);
      if (!peer) return;
      const first = peer.pose == null;
      peer.pose = { x: msg.x, z: msg.z, yaw: msg.yaw };
      // Workers are only mounted once there is somewhere to put them.
      if (first) emit();
      break;
    }
    case 'leave':
      if (peers.delete(msg.id)) emit();
      break;
    default:
  }
}

function connect() {
  if (!wanted || socket) return;
  let ws;
  try {
    ws = new WebSocket(PRESENCE_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    attempts = 0;
    lastSent = null;
    ws.send(JSON.stringify({ t: 'hello', kind }));
  };
  ws.onmessage = (event) => handleMessage(event.data);
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    self = null;
    if (peers.size) {
      peers.clear();
      emit();
    }
    scheduleReconnect();
  };
  // 'close' always follows and does the work.
  ws.onerror = () => {};
}

// 1 s, 2 s, 4 s ... capped: a sleeping free-tier API wakes in ~a minute.
function scheduleReconnect() {
  if (!wanted) return;
  clearTimeout(retryTimer);
  const delay = Math.min(RECONNECT_MAX_MS, 1000 * 2 ** attempts);
  attempts += 1;
  retryTimer = setTimeout(connect, delay);
}

function disconnect() {
  wanted = false;
  clearTimeout(retryTimer);
  const ws = socket;
  socket = null;
  self = null;
  ws?.close();
  if (peers.size) {
    peers.clear();
    emit();
  }
}

const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * Where this page's viewer stands: floor x/z in metres, and the heading a
 * worker model would face (0 = facing +z). Called every frame; only sends when
 * the move is worth showing, at most 5 times a second.
 */
export function publishPose(x, z, yaw, now) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !self) return;
  if (now - lastSentAt < SEND_INTERVAL_MS) return;
  if (lastSent && Math.hypot(x - lastSent.x, z - lastSent.z) < MIN_MOVE_M && angleBetween(yaw, lastSent.yaw) < MIN_TURN_RAD) return;
  socket.send(JSON.stringify({ t: 'pose', x, z, yaw }));
  lastSent = { x, z, yaw };
  lastSentAt = now;
}

/** The live peer object (pose updated in place), for reading inside useFrame. */
export function getPeer(id) {
  return peers.get(id);
}

/** Everyone else on the page right now; changes only on joins, leaves and kind changes. */
export function usePeers() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}

/**
 * Holds the page's presence connection open while mounted, tagged desktop or
 * vr -- closed after a minute in a background tab, where nobody is looking
 * from, and reopened when it is shown (pageActivity.js).
 */
export function usePresence(currentKind) {
  useEffect(() => runWhileVisible(
    () => {
      wanted = true;
      connect();
    },
    disconnect,
  ), []);

  useEffect(() => {
    kind = currentKind;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'hello', kind }));
  }, [currentKind]);
}
