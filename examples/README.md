# Example cards

Three cards for agents a small ops hub could run. They show the format, not real agents: the
ratings are estimates (`~`), so every card is **New** with no overall. They follow standard v0.2.
`source.files` is empty because these agents are examples only; they are not defined anywhere.
The skill tags imitate OASF's `category/skill` style; real IDs get checked against the OASF
taxonomy before v1.0.

Notes that JSON can't hold as comments:

- `fleet-scout`: `ratings.overall` is `unrated` because estimates never count; an overall needs
  six measured ratings.
- `ops-orchestrator`: `guardrails.permission` is `read-only` because it delegates and never
  changes things itself.

| Card | Type | What it shows |
|---|---|---|
| [`ops-orchestrator.roster.json`](ops-orchestrator.roster.json) | Orchestrator | Delegates only; project memory; approval needed to draft an operator |
| [`fleet-scout.roster.json`](fleet-scout.roster.json) | Researcher | Read only, so unattended (L3) is safe; cheap, fast model |
| [`change-gate.roster.json`](change-gate.roster.json) | Gatekeeper | Approve or deny only; JSON in and out; never approves its own card |

## How one card could look in the collection

Front (in the grid):

```
┌────────────────────────────────────────────┐
│ 🔭 FLEET SCOUT                  RESEARCHER │
│ Ops Hub · New                              │
│ "What's running, what's wrong, since when" │
│ haiku-5-5 · unattended (L3) · v2026.1      │
├────────────────────────────────────────────┤
│ OVR  —  unrated (estimates only)           │
│ Definition — not assessed yet              │
├────────────────────────────────────────────┤
│ 0 runs · — accepted · — per run            │
└────────────────────────────────────────────┘
```

Back (flip or open): the full spec in the standard's fixed order (kind, definition, role, goals,
persona, instructions, skills, tools, context, memory, guardrails, inputs and outputs, handoffs,
org, stats, source, evidence, provenance, profiles).

A measured card would show its overall and band in place of the `—`, for example
`OVR 86 · Strong`.
