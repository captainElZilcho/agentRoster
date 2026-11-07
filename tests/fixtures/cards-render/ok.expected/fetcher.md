# Fetcher

Finds today's notes using a search tool.

◆ agent · researcher · Tiny App · ↳ daily-digest

## Not on this card

- ○ Instructions — loaded from a database when the agent runs

## Specs

### Runs on

- Model: claude-sonnet-4-5
- Runtime: Python, Anthropic SDK

### Can do

- Tools (1): search_notes

### Guardrails

- Turn limit: 5 turns
- Permission: — not declared
- Must not: 1 rule

## Details

- Job: Searches the notes store and returns the matching notes.
- Goals: Return every note written today.
- Instructions: ○ not on this card — loaded from a database when the agent runs
- Must not: change a note
- Works with: reports to daily-digest

## Sources

| Field | Value | Where | Quote | From |
|---|---|---|---|---|
| purpose | Finds today's notes using a search tool. | app/fetcher.py:1 | `"""Fetcher: finds today's notes."""` | code |
| engine.model | claude-sonnet-4-5 | app/fetcher.py:6 | `MODEL = "claude-sonnet-4-5"` | code |
| runtime | Python, Anthropic SDK | app/fetcher.py:4 | `import anthropic` | code |
| role | Searches the notes store and returns the matching notes. | app/fetcher.py:14 | `tools=[SEARCH_NOTES]` | code |
| goals | Return every note written today. | app/fetcher.py:2 | `# goal: every note written today` | code |
| tools.allow | search_notes | app/fetcher.py:9 | `"name": "search_notes",` | code |
| guardrails.forbidden | change a note | app/fetcher.py:3 | `# never change a note` | code |
| guardrails.limits.turns | 5 | app/fetcher.py:7 | `MAX_TURNS = 5` | code |
| org.reports_to | daily-digest | app/digest.py:11 | `notes = fetcher.run()` | code |

Definition: not rated yet · Evidence: 9 items
