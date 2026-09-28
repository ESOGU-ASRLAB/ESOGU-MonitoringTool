'use strict';

// LIMITS: what one client, or everyone together, may cost the API.
//
// The API runs on a small Render instance whose bandwidth is metered, and
// every telemetry stream reads MongoDB Atlas. Nothing here stops a determined
// attacker with many addresses -- that is the job of a proxy in front (see the
// README) -- but it keeps one address, a buggy page or a crowd of forgotten
// tabs from running up the bill or crowding real visitors out:
//
//   requests      a token bucket per address for every HTTP request and
//                 WebSocket upgrade
//   connections   a cap on open streams and sockets, per address and in all
//
// Addresses are only counted in memory and never logged or stored.

// Render serves its apps through Cloudflare, which puts the visitor's address
// in CF-Connecting-IP and overwrites any value a client sends, so that header
// cannot be forged from outside. Locally there is no proxy: the socket's own
// address is the client. CLIENT_IP_HEADER names another header for a host
// that uses one (e.g. true-client-ip).
const IP_HEADERS = [process.env.CLIENT_IP_HEADER, 'cf-connecting-ip']
  .filter(Boolean)
  .map((h) => h.toLowerCase());

function clientIp(req) {
  for (const header of IP_HEADERS) {
    const value = req.headers[header];
    if (typeof value === 'string' && value.trim()) return { ip: value.trim(), source: header };
  }
  return { ip: req.socket?.remoteAddress || 'unknown', source: 'socket' };
}

/*
 * A token bucket per address: `burst` requests at once, refilled at
 * `perMinute`. take(ip) says whether this request may go ahead and, if not,
 * how many seconds until one may.
 */
function createRateLimiter({ perMinute, burst }) {
  const buckets = new Map(); // ip -> { tokens, at }
  const perMs = perMinute / 60000;

  // Full buckets carry no information; drop them so the map stays small.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of buckets) {
      if (bucket.tokens + (now - bucket.at) * perMs >= burst) buckets.delete(ip);
    }
  }, 60000);
  sweep.unref();

  return {
    take(ip) {
      const now = Date.now();
      const bucket = buckets.get(ip) || { tokens: burst, at: now };
      bucket.tokens = Math.min(burst, bucket.tokens + (now - bucket.at) * perMs);
      bucket.at = now;
      buckets.set(ip, bucket);
      if (bucket.tokens < 1) return { ok: false, retryAfterS: Math.ceil((1 - bucket.tokens) / perMs / 1000) };
      bucket.tokens -= 1;
      return { ok: true, retryAfterS: 0 };
    },
  };
}

/*
 * Open connections, per address and in all. open(ip) returns a release
 * function to call exactly once when the connection ends, or null when the
 * connection would go over a cap (and the reason, for the response).
 */
function createConnectionLimiter({ total, perIp }) {
  const byIp = new Map(); // ip -> open count
  let open = 0;

  return {
    open(ip) {
      const mine = byIp.get(ip) || 0;
      if (open >= total) return { release: null, reason: 'server busy' };
      if (mine >= perIp) return { release: null, reason: 'too many connections from this address' };
      open += 1;
      byIp.set(ip, mine + 1);
      let released = false;
      return {
        reason: null,
        release() {
          if (released) return;
          released = true;
          open -= 1;
          const left = (byIp.get(ip) || 1) - 1;
          if (left > 0) byIp.set(ip, left);
          else byIp.delete(ip);
        },
      };
    },
    count: () => open,
  };
}

module.exports = { clientIp, createRateLimiter, createConnectionLimiter };
