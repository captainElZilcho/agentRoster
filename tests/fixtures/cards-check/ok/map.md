# Map

## Summary

One workflow, one agent.

## Inventory

| id | kind | job |
|---|---|---|
| `daily-digest` | workflow | sends the digest |
| `fetcher` | agent | finds the notes |

## Agents and workflows

### `daily-digest`

Runs daily.

### `fetcher`

Searches notes.

## Flow

`daily-digest` calls `fetcher`.

## Checked, not an agent

None.

## Unknowns

- `fetcher` instructions: loaded from a database.

## Needs checking

None.

## Skipped

None.
