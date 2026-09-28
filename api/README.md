# API — MongoDB Joint State Backend

Two entry points, same data source (`joint_states` collection on MongoDB Atlas):

- **`server.js`** — the real backend. An Express server that streams the latest UR10e/Kawasaki joint state to the `client/` app over Server-Sent Events. This is what the 3D viewer actually talks to.
- **`debug.js`** — a standalone CLI tool with no HTTP server at all. Polls Mongo directly and pretty-prints the latest document to the terminal, for checking connectivity/credentials without running the whole app.

See the [root README](../README.md) for the full project overview and how this fits into the rest of the app.

## Setup

1. Copy your Atlas connection string into `.env` as `MONGODB_URI` (see variables below). Never commit this file — it's already git-ignored.
2. Install dependencies:
   ```bash
   npm install
   ```

## Run the backend

```bash
npm start
```

Starts the SSE server (default `http://localhost:3001`) that the `client/` app connects to at `/api/telemetry/joint-states/stream`.

## Run the CLI debug tool

```bash
npm run debug        # polls and prints the latest document every POLL_INTERVAL_MS, Ctrl+C to stop
npm run debug:once   # prints once and exits
```

## Environment variables (`.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | — | Atlas connection string |
| `DB_NAME` | no | `ifarlabmatisse_db_user` | Database name |
| `COLLECTION_NAME` | no | `joint_states` | Collection name |
| `PORT` | no | `3001` | Port `server.js` listens on (Render/most hosts inject this automatically) |
| `CORS_ORIGIN` | no | *(see below)* | Comma-separated list of the pages allowed to use the API, or `*` for any. Unset: any origin locally; on Render (which sets `RENDER`) only `https://www.asrlab.cloud` and `https://asrlab.cloud`. |
| `CLIENT_IP_HEADER` | no | — | A header that carries the visitor's address, if the host uses one other than Cloudflare's `CF-Connecting-IP`. Only used for the limits below. |
| `POLL_INTERVAL_MS` | no | `1000` | `debug.js` only — re-poll interval, minimum 250 |

## Limits

The instance's bandwidth is metered and every stream reads Atlas, so the API caps what anyone can spend (`limits.js`, `server.js`, `presence.js`):

| What | Limit |
|---|---|
| MongoDB reads | One query every 250 ms while any stream is open, however many there are; none while nobody is connected |
| HTTP requests and WebSocket upgrades | 120 a minute per address (answered with `429` and `Retry-After`) |
| Telemetry streams | 30 open per address, 150 in all (`503`); each is closed after about 30 minutes and the browser reconnects by itself |
| Presence sockets | 20 per address, 40 in all |
| Other sites | A stream or socket opened from another origin is refused (`403`) |

The per-address figures leave room for a classroom behind one campus address. The client also closes its stream and presence socket after a minute in a background tab.

`/api/health` reports the open `streams` and `presence` counts and `ipSource`, the header the visitor's address was read from (never the address): on Render it should say `cf-connecting-ip`; `socket` there would mean every visitor looks like the same proxy.

These limits hold back one address, a buggy page or forgotten tabs. A flood from many addresses needs a proxy in front: serving the API from a proxied Cloudflare hostname (e.g. `api.asrlab.cloud`) adds Cloudflare's DDoS protection and rate-limiting rules.

## Atlas checklist

- The Database Access user needs read access to the collection.
- Network Access must allow the IP address of whichever machine runs this (your dev machine, or your server's IP in production).
- Don't push `.env` to GitHub.
