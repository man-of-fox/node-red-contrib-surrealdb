# node-red-contrib-surrealdb

Node-RED palette for SurrealDB with robust connection handling, token refresh, retry logic, and optional connection validation.

## Goals

- Provide simple nodes for common SurrealDB operations:
  - `INSERT` (mode: `insert` or `create`)
  - `QUERY`
  - `RELATE`
  - `UPSERT`
  - `MODIFY` (`update`, `merge`, `patch`)
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
│   ├── surrealdb-query.html
│   ├── surrealdb-query.js
│   ├── surrealdb-relate.html
│   ├── surrealdb-relate.js
│   ├── surrealdb-modify.html
│   ├── surrealdb-modify.js
│   ├── surrealdb-select.html
│   ├── surrealdb-select.js
│   ├── surrealdb-upsert.html
│   └── surrealdb-upsert.js
└── package.json
```

## Node Documentation

Detailed node descriptions with examples and official SurrealDB references:

- [docs/nodes.md](docs/nodes.md)

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

Run integration tests (requires SurrealDB running):

```bash
npm run test:integration
```

Run authenticated integration tests:

```bash
npm run test:integration:auth
```

Run resilience integration tests (token refresh + reconnect):

```bash
npm run test:integration:resilience
```

Current unit coverage focuses on:

- `lib/token-manager.js`
- `lib/pool.js`
- `lib/connection-manager.js` (core execution/error handling paths)
- Node-RED runtime behavior for `insert`, `relate`, `select`, `delete`, `modify`, and `live` nodes

Integration coverage includes:

- real SurrealDB container connectivity
- create/select/upsert/delete lifecycle
- SQL query execution path via `ConnectionManager.query(...)`

### Local Integration Test Setup

Start SurrealDB container:

```bash
docker compose up -d surrealdb
```

The compose setup pins SurrealDB to `v2.6.1` (SDK-compatible) and runs in `--unauthenticated` mode for deterministic CI integration tests.

Run integration tests:

```bash
npm run test:integration
```

Start authenticated SurrealDB container:

```bash
docker compose up -d surrealdb-auth
```

Run authenticated integration tests:

```bash
npm run test:integration:auth
```

For resilience tests, run both containers:

```bash
docker compose up -d surrealdb surrealdb-auth
npm run test:integration:resilience
```

Stop container:

```bash
docker compose down
```

## Lint

Run lint checks:

```bash
npm run lint
```

Auto-fix lint issues:

```bash
npm run lint:fix
```

## Pre-commit Hook

This project uses Husky + lint-staged to auto-fix staged formatting/lint issues before commit.

One-time setup after install:

```bash
npm install
npm run prepare
```

Hook behavior on commit:

- JS files: `eslint --fix` then `prettier --write`
- JSON/Markdown/YAML: `prettier --write`

## CI

GitHub Actions runs on push and pull requests and executes:

- `npm ci`
- `npm run lint`
- `npm test` (unit)
- `npm run test:integration` (with SurrealDB service container)
- `npm run test:integration:auth` (with authenticated SurrealDB service container)
- `npm run test:integration:resilience` (token refresh + dead connection recovery scenarios)

The workflow uses current Actions major versions and opts into the Node.js 24 JavaScript action runtime.

## UI Test With Docker Compose

Start a local UI test stack (Node-RED + SurrealDB):

```bash
docker compose -f docker-compose.ui-test.yml up -d
```

All `test/flows/*.json` files are automatically merged into Node-RED as additional tabs.
If no tabs exist yet, a default `Flow 1` tab is kept.

Open Node-RED UI:

```text
http://localhost:1880
```

Stop and remove the stack:

```bash
docker compose -f docker-compose.ui-test.yml down
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
