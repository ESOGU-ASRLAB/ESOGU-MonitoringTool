// Where the Express API lives. REACT_APP_API_URL is baked in at build time
// (the Cloudflare Pages env var); older values pointed at /api/auth, which this
// app never uses, so that suffix is folded back to /api.
export const API_BASE = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/api\/auth\/?$/, '/api')
  : 'http://localhost:3001/api';

// The presence socket on the same host (api/presence.js): http -> ws, https -> wss.
export const PRESENCE_URL = `${API_BASE.replace(/^http/, 'ws')}/presence`;
