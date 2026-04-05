# node-red-contrib-surrealdb

Node-RED palette for SurrealDB with robust connection handling, token refresh, retry logic, and optional connection validation.

## Goals

- Provide simple nodes for common SurrealDB operations:
  - `INSERT`
  - `UPSERT`
  - `DELETE`
  - `SELECT`
  - `LIVE`
- Centralize all connection concerns in one config node:
  - connection lifecycle
  - health checks
  - reconnect/retry
  - token refresh
  - pool min/max sizing

## Planned Features

- Config node for endpoint, namespace, database, auth, retry, and pool settings
- Auto-reconnect on dropped connections
- Automatic token refresh before expiry
- Optional validation health checks (`validateConnection`)
- Re-subscribe live queries after reconnect

## Project Layout

```text
.
├── docs/
│   └── architecture.md
├── lib/
│   ├── connection-manager.js
│   ├── pool.js
│   └── token-manager.js
├── nodes/
│   ├── surrealdb-config.html
│   ├── surrealdb-config.js
│   ├── surrealdb-delete.html
│   ├── surrealdb-delete.js
│   ├── surrealdb-insert.html
│   ├── surrealdb-insert.js
│   ├── surrealdb-live.html
│   ├── surrealdb-live.js
│   ├── surrealdb-select.html
│   ├── surrealdb-select.js
│   ├── surrealdb-upsert.html
│   └── surrealdb-upsert.js
└── package.json
```

## Install (local development)

1. Install dependencies:

```bash
npm install
```

2. In your Node-RED user directory (usually `~/.node-red`) install this package from local path:

```bash
npm install /path/to/node-red-contrib-surrealdb
```

3. Restart Node-RED.

## Tests

Run unit tests:

```bash
npm test
```

Current unit coverage focuses on:

- `lib/token-manager.js`
- `lib/pool.js`
- `lib/connection-manager.js` (core execution/error handling paths)

## Lint

Run lint checks:

```bash
npm run lint
```

Auto-fix lint issues:

```bash
npm run lint:fix
```

## Current Scaffold Status

- Base package metadata
- Config node
- Operation nodes (`insert`, `upsert`, `select`, `delete`, `live`)
- Shared connection manager with:
  - retry/backoff
  - health-check timer
  - token expiry watcher
  - simple pool abstraction

The scaffold is intentionally conservative and ready for iterative hardening.

## Next Recommended Steps

1. Add integration tests against a local SurrealDB container.
2. Validate auth flows (`signin`, token expiry, refresh failure fallback).
3. Expand `LIVE` handling with durable re-subscribe and idempotent unsubscribe.
4. Add metrics/log verbosity controls for troubleshooting in production flows.
