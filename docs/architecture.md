# Architecture Proposal: `node-red-contrib-surrealdb`

## 1. Objectives

The palette should offer:

- CRUD-style operations (`insert`, `upsert`, `select`, `delete`)
- streaming subscriptions (`live`)
- resilient connection behavior in unstable environments

Connection behavior must include:

- dead connection detection
- automatic reconnect with retry policy
- automatic token refresh for expiring auth tokens
- optional connection validation health checks
- configurable min/max pool sizing

## 2. High-Level Design

### 2.1 Config Node as Connection Boundary

A single Node-RED config node (`surrealdb-config`) owns all transport and auth concerns.
Action nodes do not open sockets directly; they request a client lease from the config node manager.

Benefits:

- one source of truth for connection lifecycle
- easier observability and status updates
- no duplicate reconnect logic per action node

### 2.2 Shared Runtime Components

`lib/connection-manager.js`

- state machine: `disconnected`, `connecting`, `connected`, `reconnecting`
- retry/backoff policy
- health check scheduler
- dead connection recycling
- token integration

`lib/token-manager.js`

- stores token + expiry metadata
- computes refresh threshold (`expiry - skewSeconds`)
- triggers proactive refresh

`lib/pool.js`

- simple async lease/release pool
- configurable `minConnections`, `maxConnections`
- wait queue for temporary exhaustion

## 3. Node Roles

### 3.1 `surrealdb-config` (config node)

Holds:

- endpoint: `url`
- database context: `namespace`, `database`
- auth: static user/pass or token flow
- resilience settings:
  - `retryAttempts`
  - `retryDelayMs`
  - `healthCheckIntervalMs`
  - `validateConnection`
  - `minConnections`, `maxConnections`
  - `tokenRefreshSkewSec`

Exposes manager methods:

- `execute(operationFn)`
- `query(sql, vars?)`
- `registerLive(...)`
- `close()`

### 3.2 Operation nodes

- `surrealdb-insert`
- `surrealdb-upsert`
- `surrealdb-select`
- `surrealdb-delete`

Each node:

1. resolves config node
2. leases a client via manager
3. executes operation
4. returns result via `msg.payload`
5. reports errors with `node.error(err, msg)`

### 3.3 `surrealdb-live`

Manages live subscription registrations and unsubscribes on node close.
On reconnect, subscriptions should be re-established.

## 4. Error Handling Strategy

- transient errors:
  - retry according to policy
  - set status to yellow (`reconnecting`)
- auth/token errors:
  - refresh token once, retry request
  - if refresh fails, transition red (`auth failed`)
- hard failures:
  - mark connection unhealthy
  - close and rebuild client

## 5. Suggested Defaults

- `minConnections = 1`
- `maxConnections = 5`
- `retryAttempts = 5`
- `retryDelayMs = 1000`
- `healthCheckIntervalMs = 30000`
- `validateConnection = true`
- `tokenRefreshSkewSec = 60`

## 6. Phased Delivery Plan

1. MVP: config node + `insert/select/upsert/delete` + reconnect basics
2. Add pool tuning and health checks
3. Add robust `live` re-subscribe
4. Add tests (token expiry, reconnect, pool pressure, live resume)

