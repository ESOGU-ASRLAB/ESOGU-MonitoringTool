'use strict';

// PRESENCE: who else is in the hall right now.
//
// Every open page -- a desktop browser or a headset -- holds one WebSocket at
// /api/presence. It says which kind it is, then reports where its viewer
// stands (x and z on the floor, in metres, and a heading) whenever that
// changes. The server hands each page a short label ("Visitor 3"), relays
// poses to everyone else, and says when people come and go. The scene draws
// every other visitor as a worker at their pose.
//
// Nothing is stored and nothing identifies a person: a restart only means
// everyone reconnects and gets a label again.
//
// Messages are small JSON objects with a one-word type `t`:
//
//   page -> server   { t: 'hello', kind: 'desktop' | 'vr' }   (again on change)
//                    { t: 'pose', x, z, yaw }
//   server -> page   { t: 'welcome', id, label, peers: [{ id, label, kind, pose }] }
//                    { t: 'peer', id, label, kind }            (joined / changed)
//                    { t: 'pose', id, x, z, yaw }
//                    { t: 'leave', id }

const { WebSocketServer, WebSocket } = require('ws');
const { clientIp, createConnectionLimiter } = require('./limits');

const PATH = '/api/presence';
// A free instance serves this; the caps keep one bad client (or a crowd) from
// costing the SSE telemetry its CPU or the workspace its bandwidth. The
// per-address cap stops one address taking every place (a classroom behind
// one campus address still fits).
const MAX_CLIENTS = 40;
const MAX_CLIENTS_PER_IP = 20;
const MAX_PAYLOAD_BYTES = 512;
const MAX_POSES_PER_SECOND = 12;
const HEARTBEAT_MS = 25000;
// A slow reader's queue is dropped from, not grown without bound.
const MAX_BUFFERED_BYTES = 64 * 1024;
// Generous box around the hall: anything outside is a bug or a forgery.
const LIMIT_M = 60;
const KINDS = new Set(['desktop', 'vr']);

const round2 = (v) => Math.round(v * 100) / 100;

function attachPresence(server, { originAllowed = () => true, httpLimiter = null } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const connections = createConnectionLimiter({ total: MAX_CLIENTS, perIp: MAX_CLIENTS_PER_IP });
  const peers = new Map(); // id -> { ws, id, label, kind, pose, alive, tokens, refill }
  let nextId = 1;

  // Labels count from 1 and a freed number is reused, so they stay short
  // however many people have come and gone.
  function freeLabelNumber() {
    const used = new Set([...peers.values()].map((p) => p.number));
    let n = 1;
    while (used.has(n)) n += 1;
    return n;
  }

  function send(ws, message) {
    if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES) return;
    ws.send(JSON.stringify(message));
  }

  function broadcast(fromId, message) {
    const data = JSON.stringify(message);
    for (const peer of peers.values()) {
      if (peer.id === fromId) continue;
      const { ws } = peer;
      if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES) continue;
      ws.send(data);
    }
  }

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== PATH) {
      socket.destroy();
      return;
    }
    // Same rule as the HTTP routes (server.js): only the site's own pages.
    if (!originAllowed(req.headers.origin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const { ip } = clientIp(req);
    // An upgrade is a request like any other for the per-address budget, so
    // a client cannot reconnect in a tight loop.
    if (httpLimiter && !httpLimiter.take(ip).ok) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      return;
    }
    const slot = connections.open(ip);
    if (!slot.release) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      return;
    }
    // Released when the raw socket closes: that also covers a handshake ws
    // rejects, which never reaches the callback.
    socket.once('close', slot.release);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    const number = freeLabelNumber();
    const peer = {
      ws,
      id: nextId,
      number,
      label: `Visitor ${number}`,
      kind: 'desktop',
      pose: null,
      alive: true,
      tokens: MAX_POSES_PER_SECOND,
      refill: Date.now(),
    };
    nextId += 1;

    send(ws, {
      t: 'welcome',
      id: peer.id,
      label: peer.label,
      peers: [...peers.values()].map((p) => ({ id: p.id, label: p.label, kind: p.kind, pose: p.pose })),
    });
    peers.set(peer.id, peer);
    broadcast(peer.id, { t: 'peer', id: peer.id, label: peer.label, kind: peer.kind });

    ws.on('pong', () => {
      peer.alive = true;
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.t === 'hello') {
        if (!KINDS.has(msg.kind) || msg.kind === peer.kind) return;
        peer.kind = msg.kind;
        broadcast(peer.id, { t: 'peer', id: peer.id, label: peer.label, kind: peer.kind });
        return;
      }

      if (msg.t === 'pose') {
        // Token bucket: MAX_POSES_PER_SECOND sustained; extras are dropped,
        // which the next pose makes up for.
        const now = Date.now();
        peer.tokens = Math.min(MAX_POSES_PER_SECOND, peer.tokens + ((now - peer.refill) / 1000) * MAX_POSES_PER_SECOND);
        peer.refill = now;
        if (peer.tokens < 1) return;
        peer.tokens -= 1;

        const { x, z, yaw } = msg;
        if (![x, z, yaw].every(Number.isFinite)) return;
        if (Math.abs(x) > LIMIT_M || Math.abs(z) > LIMIT_M) return;
        peer.pose = { x: round2(x), z: round2(z), yaw: round2(yaw) };
        broadcast(peer.id, { t: 'pose', id: peer.id, ...peer.pose });
      }
    });

    ws.on('close', () => {
      peers.delete(peer.id);
      broadcast(peer.id, { t: 'leave', id: peer.id });
    });
    ws.on('error', () => {
      // 'close' follows and does the cleanup.
    });
  });

  // Drops connections that vanished without a close (a headset taken off and
  // put to sleep, a laptop lid shut), so their workers do not stand forever.
  const heartbeat = setInterval(() => {
    for (const peer of peers.values()) {
      if (!peer.alive) {
        peer.ws.terminate();
        continue;
      }
      peer.alive = false;
      peer.ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return {
    count: () => peers.size,
    close: () => wss.close(),
  };
}

module.exports = { attachPresence, PRESENCE_PATH: PATH };
