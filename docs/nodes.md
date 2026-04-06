# Node Reference

This document describes all current nodes in `node-red-contrib-surrealdb`, including example inputs and links to the official SurrealDB documentation.

## General Notes

- Most nodes read their main data from `msg.payload`.
- Many node settings can be overridden with `msg.*` fields at runtime.
- Record targets can be provided as:
  - `table` + `recordId` suffix, for example `table=person`, `recordId=tobie`
  - Full record id, for example `person:tobie`
  - Record id object, for example `{ tb: "person", id: "tobie" }`

## `surrealdb-config`

Shared connection and resilience settings.

### Important fields

- `url`: WebSocket endpoint, for example `ws://surrealdb:8000`
- `namespace`, `database`
- `authType`: `credentials` or `token`
- Pool and resilience:
  - `minConnections`, `maxConnections`
  - `healthCheckIntervalMs`
  - `retryAttempts`, `retryDelayMs`
  - `validateConnection`
  - `tokenRefreshSkewSec`

### Official docs

- JS SDK connection concepts: https://surrealdb.com/docs/sdk/javascript/concepts/connecting-to-surrealdb
- JS SDK overview: https://surrealdb.com/docs/sdk/javascript

## `surrealdb-insert` (mode: `insert` or `create`)

Writes records to a table.

### Node properties

- `table` (required)
- `mode`: `insert` (default) or `create`

### Runtime overrides

- `msg.table`
- `msg.mode` (`insert` or `create`)
- `msg.payload` record or array of records

### Example: insert

```json
{
  "table": "person",
  "mode": "insert",
  "payload": {
    "name": "Ada",
    "active": true
  }
}
```

### Example: create specific id

```json
{
  "table": "person:tobie",
  "mode": "create",
  "payload": {
    "name": "Tobie"
  }
}
```

### Official docs

- JS SDK `.insert()`: https://surrealdb.com/docs/sdk/javascript/methods/insert
- JS SDK `.create()`: https://surrealdb.com/docs/sdk/javascript/methods/create
- SurrealQL `INSERT`: https://surrealdb.com/docs/surrealql/statements/insert

## `surrealdb-upsert`

Insert or replace depending on record existence.

### Node properties

- `table` (optional if full `recordId` is provided)
- `recordId` (optional)

### Runtime overrides

- `msg.table`
- `msg.recordId` or `msg.id`
- `msg.payload`

### Example: upsert by id

```json
{
  "table": "person",
  "recordId": "jane-doe",
  "payload": {
    "name": "Jane Doe",
    "active": true
  }
}
```

### Official docs

- JS SDK `.upsert()`: https://surrealdb.com/docs/sdk/javascript/methods/upsert
- SurrealQL `UPSERT`: https://surrealdb.com/docs/surrealql/statements/upsert

## `surrealdb-modify` (mode: `merge`, `update`, `patch`)

Updates records with one of three behaviors.

### Node properties

- `table` (optional if full `recordId` is provided)
- `recordId` (optional, required for `patch` mode)
- `mode`: `merge` (default), `update`, `patch`

### Runtime overrides

- `msg.table`
- `msg.recordId` or `msg.id`
- `msg.mode`
- `msg.payload`

### Behavior summary

- `merge`: partial object merge
- `update`: replaces content
- `patch`: JSON Patch operations

### Example: merge

```json
{
  "table": "person",
  "recordId": "tobie",
  "mode": "merge",
  "payload": {
    "settings": {
      "active": true
    }
  }
}
```

### Example: patch

```json
{
  "table": "person",
  "recordId": "tobie",
  "mode": "patch",
  "payload": [
    { "op": "replace", "path": "/settings/active", "value": false },
    { "op": "add", "path": "/tags", "value": ["developer"] }
  ]
}
```

### Official docs

- JS SDK `.merge()`: https://surrealdb.com/docs/sdk/javascript/methods/merge
- JS SDK `.update()`: https://surrealdb.com/docs/sdk/javascript/methods/update
- JS SDK `.patch()`: https://surrealdb.com/docs/sdk/javascript/methods/patch
- SurrealQL `UPDATE`: https://surrealdb.com/docs/surrealql/statements/update

## `surrealdb-select`

Reads all records from a table or one specific record.

### Node properties

- `table` (optional if full `recordId` is provided)
- `recordId` (optional)

### Runtime overrides

- `msg.table`
- `msg.recordId` or `msg.id`

### Example: select one record

```json
{
  "table": "person",
  "recordId": "tobie"
}
```

### Official docs

- JS SDK `.select()`: https://surrealdb.com/docs/sdk/javascript/methods/select
- SurrealQL `SELECT`: https://surrealdb.com/docs/surrealql/statements/select

## `surrealdb-delete`

Deletes a full table or a specific record.

### Node properties

- `table` (optional if full `recordId` is provided)
- `recordId` (optional)

### Runtime overrides

- `msg.table`
- `msg.recordId` or `msg.id`

### Example: delete one record

```json
{
  "table": "person",
  "recordId": "tobie"
}
```

### Official docs

- JS SDK `.delete()`: https://surrealdb.com/docs/sdk/javascript/methods/delete
- SurrealQL `DELETE`: https://surrealdb.com/docs/surrealql/statements/delete

## `surrealdb-relate`

Creates graph relations (`from -> relation -> to`).

### Node properties

- `from` (record id, for example `person:alice`)
- `relation` (table name, for example `likes`)
- `to` (record id, for example `movie:matrix`)

### Runtime overrides

- `msg.from`
- `msg.relation`
- `msg.to`
- `msg.payload` edge content

### Example

```json
{
  "from": "person:alice",
  "relation": "likes",
  "to": "movie:matrix",
  "payload": {
    "rating": 9
  }
}
```

### Official docs

- SurrealQL `RELATE`: https://surrealdb.com/docs/surrealql/statements/relate
- JS SDK API overview (includes relation query builders): https://surrealdb.com/docs/sdk/javascript

## `surrealdb-query`

Executes free-form SurrealQL.

### Node properties

- `query` (required): SurrealQL statement
- `vars` (optional): JSON object string for query variables

### Runtime overrides

- `msg.query` or `msg.sql`
- `msg.vars` or `msg.parameters`

### Example

```json
{
  "query": "SELECT * FROM person WHERE active = $active;",
  "vars": { "active": true }
}
```

### Official docs

- JS SDK `.query()`: https://surrealdb.com/docs/sdk/javascript/methods/query
- SurrealQL overview: https://surrealdb.com/docs/surrealql

## `surrealdb-live`

Starts/stops a live subscription for a table.

### Node properties

- `table` (required)

### Runtime controls

- `msg.command = "start"` to start subscription
- `msg.command = "stop"` to stop subscription
- If `msg.command` is omitted, node starts by default

### Output behavior

- On start: emits ack payload with subscription metadata
- On live events: emits event payloads from SurrealDB notifications
- On stop: emits ack payload with `stopped: true`

### Official docs

- JS SDK `.live()`: https://surrealdb.com/docs/sdk/javascript/methods/live
- SurrealQL `LIVE SELECT`: https://surrealdb.com/docs/surrealql/statements/live
