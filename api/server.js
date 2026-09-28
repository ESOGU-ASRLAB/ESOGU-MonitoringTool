'use strict';

// HTTP/SSE backend for the monitoring-tool client. Streams the latest
// UR10e + Kawasaki joint state from MongoDB Atlas over Server-Sent Events
// at /api/telemetry/joint-states/stream. For a one-off console dump of the
// same data, use debug.js instead.

require('dotenv').config();

const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { attachPresence } = require('./presence');
const { clientIp, createRateLimiter, createConnectionLimiter } = require('./limits');

const PORT = Number(process.env.PORT || 3001);
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'ifarlabmatisse_db_user';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'joint_states';
const MIN_INTERVAL_MS = 250;
const MAX_INTERVAL_MS = 10000;
const DEFAULT_INTERVAL_MS = 1000;
const HEARTBEAT_MS = 15000;

/*
 * What the API lets anyone spend (limits.js). Sized for a classroom behind
 * one campus address -- 20-30 people opening the page at once -- not for a
 * single browser:
 *
 *   HTTP requests     120 a minute per address, bursts of 120
 *   telemetry streams 30 open per address, 150 in all
 *
 * A stream is also closed after 30 minutes; EventSource reconnects on its own
 * a few seconds later, so a page open all day costs a reconnect every half
 * hour and an abandoned connection cannot hold a slot forever.
 */
const httpLimiter = createRateLimiter({ perMinute: 120, burst: 120 });
const streamLimiter = createConnectionLimiter({ total: 150, perIp: 30 });
const STREAM_MAX_AGE_MS = 30 * 60 * 1000;
// A reader this far behind is dropped rather than buffered for.
const MAX_BUFFERED_BYTES = 64 * 1024;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in .env.');
  process.exit(1);
}

// Raw Mongo document stores ur10e/kawasaki as 7-element arrays: the first
// entry is the mobile/linear mount joint -- a prismatic (metres, not
// radians) axis that slides the whole arm/AGV along its rail -- followed by
// the 6 arm joints in order.
//
// Values go out rounded -- a thousandth of a degree, a tenth of a millimetre,
// far finer than the scene can show -- which halves every event: full doubles
// ("-89.98112136888565") were most of each message's bytes.
const RAD_TO_DEG = 180 / Math.PI;
const round = (value, places) => Number(Number(value).toFixed(places));
const toArmDegrees = (values) => {
  if (!Array.isArray(values) || values.length < 7) return null;
  return values.slice(1, 7).map((rad) => round(Number(rad) * RAD_TO_DEG, 3));
};
const toRailPosition = (values) => {
  if (!Array.isArray(values) || values.length < 1) return null;
  return round(values[0], 4);
};

let client = null;
let collection = null;
let connecting = null;

async function ensureConnected() {
  if (collection) return collection;
  if (connecting) return connecting;

  connecting = (async () => {
    const mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    await mongoClient.connect();
    client = mongoClient;
    collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
    console.log('MongoDB Atlas connection successful.');
    console.log(`Database   : ${DB_NAME}`);
    console.log(`Collection : ${COLLECTION_NAME}`);
    return collection;
  })().catch((error) => {
    console.error('MongoDB connection error:', error.message);
    client = null;
    collection = null;
    throw error;
  }).finally(() => {
    connecting = null;
  });

  return connecting;
}

async function getLatestDocument() {
  const col = await ensureConnected();
  const latestById = await col.findOne({ _id: 'latest' });
  if (latestById) return latestById;
  return col.find({}).sort({ ts: -1 }).limit(1).next();
}

/*
 * Which pages may use the API. CORS_ORIGIN lists them (comma-separated);
 * `*` allows any. Unset, the API allows any origin while developing, and on
 * Render -- which sets RENDER -- only the site itself: an API that answered
 * every origin let any other page open streams on its visitors' behalf, on
 * this project's bandwidth.
 */
const SITE_ORIGINS = ['https://www.asrlab.cloud', 'https://asrlab.cloud'];
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAnyOrigin = configuredOrigins.includes('*')
  || (configuredOrigins.length === 0 && !process.env.RENDER);
const allowedOrigins = allowAnyOrigin ? [] : (configuredOrigins.length > 0 ? configuredOrigins : SITE_ORIGINS);
const originAllowed = (origin) => allowAnyOrigin || allowedOrigins.includes(origin);

const app = express();
app.disable('x-powered-by');

// Nothing here is meant to be sniffed, framed, cached or referred from.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use((req, res, next) => {
  const { ip } = clientIp(req);
  const verdict = httpLimiter.take(ip);
  if (!verdict.ok) {
    res.setHeader('Retry-After', String(verdict.retryAfterS));
    res.status(429).json({ ok: false, error: 'too many requests' });
    return;
  }
  next();
});

app.use(cors({ origin: allowAnyOrigin ? true : allowedOrigins }));

// Set once the HTTP server exists (below); the health route only reads it.
let presence = null;

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mongoConnected: Boolean(collection),
    presence: presence ? presence.count() : 0,
    streams: streamLimiter.count(),
    // Which header the client address came from -- never the address itself --
    // so a deploy can confirm the per-address limits see visitors, not a proxy.
    ipSource: clientIp(req).source,
  });
});

/*
 * THE TELEMETRY, READ ONCE FOR EVERYONE.
 *
 * Each stream used to poll MongoDB on its own timer, so N open pages were
 * N queries every 250 ms. Now one loop polls, at the fastest rate any stream
 * wants, only while a stream is open, and every stream is sent the same
 * pre-serialised event -- the Atlas load no longer grows with the audience.
 * A stream asking for a slower interval (the guides' badge, 2 s) is sent the
 * newest state at most that often.
 */
const subscribers = new Set(); // { res, intervalMs, lastSentAt, lastTs }
let latestEvent = null; // { ts, text }
let pollTimer = null;
let polling = false;

function deliver(subscriber, now) {
  if (!latestEvent || subscriber.lastTs === latestEvent.ts) return;
  if (now - subscriber.lastSentAt < subscriber.intervalMs) return;
  if (subscriber.res.writableLength > MAX_BUFFERED_BYTES) return;
  subscriber.res.write(latestEvent.text);
  subscriber.lastTs = latestEvent.ts;
  subscriber.lastSentAt = now;
}

async function poll() {
  if (polling) return; // a slow Atlas round trip must not pile up queries
  polling = true;
  try {
    const doc = await getLatestDocument();
    if (doc) {
      const ts = doc.ts ? new Date(doc.ts).getTime() : Date.now();
      const ur10e = toArmDegrees(doc.ur10e);
      const kawasaki = toArmDegrees(doc.kawasaki);
      if ((ur10e || kawasaki) && (!latestEvent || latestEvent.ts !== ts)) {
        const payload = {
          timestamp: ts, ur10e, ur10eRail: toRailPosition(doc.ur10e), kawasaki, agvRail: toRailPosition(doc.kawasaki),
        };
        latestEvent = { ts, text: `event: joint_states\ndata: ${JSON.stringify(payload)}\n\n` };
      }
    }
  } catch (error) {
    // Transient Atlas/DNS hiccups shouldn't kill the streams -- just skip
    // this tick and retry on the next one.
    console.warn('Telemetry query error:', error.message);
  } finally {
    polling = false;
  }
  const now = Date.now();
  subscribers.forEach((subscriber) => deliver(subscriber, now));
}

function startPolling() {
  if (pollTimer) return;
  poll();
  pollTimer = setInterval(poll, MIN_INTERVAL_MS);
}

function stopPollingIfIdle() {
  if (subscribers.size > 0 || !pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

app.get('/api/telemetry/joint-states/stream', (req, res) => {
  // Browsers send Origin on this cross-site request; another site's page
  // opening streams through its visitors is refused before it costs anything.
  if (!allowAnyOrigin && !originAllowed(req.headers.origin)) {
    res.status(403).json({ ok: false, error: 'origin not allowed' });
    return;
  }
  const { ip } = clientIp(req);
  const slot = streamLimiter.open(ip);
  if (!slot.release) {
    res.setHeader('Retry-After', '30');
    res.status(503).json({ ok: false, error: slot.reason });
    return;
  }

  const requested = Number(req.query.interval) || DEFAULT_INTERVAL_MS;
  const intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, requested));

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Reconnect after 3 s when this stream ends (or is ended below).
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const subscriber = { res, intervalMs, lastSentAt: 0, lastTs: null };
  subscribers.add(subscriber);
  // The newest state at once, so a new page goes live without waiting a tick.
  deliver(subscriber, Date.now());
  startPolling();

  const heartbeatTimer = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  // Ends a little before the half hour, spread so a crowd that arrived
  // together does not reconnect together.
  const maxAgeTimer = setTimeout(() => res.end(), STREAM_MAX_AGE_MS * (0.9 + Math.random() * 0.1));

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    clearTimeout(maxAgeTimer);
    subscribers.delete(subscriber);
    slot.release();
    stopPollingIfIdle();
  });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'not found' });
});

// No stack traces to the outside. (Express knows an error handler by its four
// parameters, so `next` stays although it is unused.)
app.use((error, req, res, next) => {
  console.error('Request error:', error.message);
  res.status(500).json({ ok: false, error: 'server error' });
});

const server = app.listen(PORT, () => {
  console.log(`API listening: http://localhost:${PORT}`);
  console.log(`Allowed origins: ${allowAnyOrigin ? 'any' : allowedOrigins.join(', ')}`);
  ensureConnected().catch(() => {
    console.warn('Could not establish MongoDB connection at startup; will retry on each tick.');
  });
});

// Who else is in the hall, over a WebSocket on the same port (presence.js).
presence = attachPresence(server, { originAllowed, httpLimiter });

process.on('SIGINT', async () => {
  await client?.close().catch(() => {});
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await client?.close().catch(() => {});
  process.exit(0);
});
