# Daily Digest

Collects the day's notes and sends a short digest.

◇ workflow · orchestrator · Tiny App · top level

## Specs

### Runs on

- Model: — none
- Runtime: cron job · Python

### Steps

- Order: fetcher
- With a model: 1 · plain code: 2
- Starts: daily 07:00 UTC

### Guardrails

- Time limit: 10 min per run
- Permission: — not declared

## Details

- Works with: top level

## Sources

| Field | Value | Where | Quote | From |
|---|---|---|---|---|
| purpose | Collects the day's notes and sends a short digest. | app/digest.py:1 | `"""Collect notes and send a digest."""` | code |
| runtime | Python script run by cron | app/digest.py:3 | `# run by cron at 07:00` | code |
| guardrails.limits.minutes | 10 | app/digest.py:8 | `TIMEOUT_MINUTES = 10` | code |
| card view: runtime_name | cron job | app/digest.py:3 | `# run by cron at 07:00` | code |
| card view: language | Python | app/digest.py:3 | `# run by cron at 07:00` | code |
| card view: starts | daily 07:00 UTC | app/digest.py:3 | `# run by cron at 07:00` | code |
| card view: steps | fetcher | app/digest.py:11 | `notes = fetcher.run()` | code |
| card view: plain_steps | 2 | app/digest.py:12 | `digest = summarise(notes)` | code |

Definition: not rated yet · Evidence: 8 items
