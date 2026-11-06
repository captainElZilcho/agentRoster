# AgentRoster coverage format — v0.2 (draft)

**Status:** draft for discussion · **Date:** 2026-11-05 · **Project:** [AgentRoster](../README.md)

`coverage.json` is the scan's own record of what it looked at and what it could not see. This
page defines version 0.2. Version 0.1 stays as it is on the
[findings and coverage page](findings-and-coverage-v0.1.md). The snapshot, evidence, empty-value
and sorting parts are the same as there (its section 2).

## Changes from 0.1

- Each candidate has two new fields: `found_by` (`script` or `agent`) and `validation`
  (`status` and `rounds`).
- The summary has a new count, `needs_checking`, between `no_agent` and `unknowns`.
- `coverage` is `"0.2"`. Nothing else changes.

---

## 1. The format

```
{ "coverage": "0.2", "snapshot": { }, "summary": { }, "candidates": [ ], "unknowns": [ ] }
```

All five keys are present. `coverage` is the format version. The scan flags every place that
might hold an agent or workflow (a candidate), reads what it can, and records what it couldn't see
(an unknown).

### 1.1 A candidate

A candidate is a place the scan flagged. It is recorded whether or not it led to a card.

| Field | Values |
|---|---|
| `file` | Path inside the project (same path rules as evidence on the 0.1 page, section 2.2) |
| `line` | A whole number from 1, or `null` for the whole file |
| `signals` | A non-empty list of `llm-import`, `llm-call`, `claude-agent-file`, `skill-file`, `mcp-config`, `roster-card`, `prompt-file`, `other` |
| `detail` | Text (for example `"imports anthropic"`), or `null` |
| `status` | `read`, `not-read` or `not-understood` |
| `reason` | Text, required for `not-read` and `not-understood`; `null` for `read` |
| `outcome` | `cards` (feeds one or more cards), `no-agent` (read, nothing to make a card from), or `pending` (not read, or not understood) |
| `cards` | A list of card ids: not empty when `outcome` is `cards`, `[]` otherwise |
| `note` | Text, required for `no-agent` (for example "imports the SDK but never calls it"); `null` otherwise |
| `found_by` | `script` (a script flagged it) or `agent` (the agent found it by reading) |
| `validation` | `{"status", "rounds"}`. `status` is `validated` (a fresh check agreed) or `needs-checking` (the check rounds ended without agreement). `rounds` is a whole number from 1 to 3: the check rounds used |

Each `file` and `line` pair appears once. Candidates are sorted by `file`, then `line` (`null`
first).

### 1.2 An unknown

An unknown is a part of a definition the scan couldn't see.

| Field | Values |
|---|---|
| `card` | The card id |
| `field` | The card field as a path, for example `instructions`, `guardrails.forbidden` or `goals.0` |
| `reason` | `loaded-from-database`, `loaded-from-url`, `loaded-from-env`, `outside-repo`, `unparsable`, `unsupported-framework` or `other` |
| `detail` | Text, or `null` |
| `evidence` | A list of at least one evidence item: where it points (for example, the line that reads the prompt from the database) |

Unknowns are sorted by `card`, then `field`. The field on the card stays `null` (or `[]` for a list field), the matching
check results in `findings.json` are `unknown`, and the card's confidence goes down.

### 1.3 Summary

| Field | Values |
|---|---|
| `candidates` | The number of candidates |
| `read` | The number with status `read` |
| `not_read` | The number with status `not-read` |
| `not_understood` | The number with status `not-understood` |
| `cards` | The number of distinct card ids across all candidates |
| `no_agent` | The number with outcome `no-agent` |
| `needs_checking` | The number of candidates whose `validation.status` is `needs-checking` |
| `unknowns` | The number of unknowns |

Every value is worked out from the lists. A file whose summary disagrees with them is invalid.

### 1.4 Example

Three cards, one candidate the scan could not understand, one that imports the SDK without using it, and one unknown.

```json
{
  "coverage": "0.2",
  "snapshot": {
    "id": "run-2026-11-05-1",
    "taken_at": "2026-11-05T14:30:00Z",
    "project": "ops-hub",
    "standard": "0.2",
    "packs": [
      {
        "id": "completeness",
        "version": "0.1"
      },
      {
        "id": "fit",
        "version": "0.1"
      },
      {
        "id": "least-agency",
        "version": "0.1"
      },
      {
        "id": "structure",
        "version": "0.1"
      }
    ],
    "mode": "standard",
    "previous": null
  },
  "summary": {
    "candidates": 5,
    "read": 4,
    "not_read": 0,
    "not_understood": 1,
    "cards": 3,
    "no_agent": 1,
    "needs_checking": 1,
    "unknowns": 1
  },
  "candidates": [
    {
      "file": ".claude/agents/change-gate.md",
      "line": null,
      "signals": [
        "claude-agent-file"
      ],
      "detail": "Claude Code subagent file",
      "status": "read",
      "reason": null,
      "outcome": "cards",
      "cards": [
        "change-gate"
      ],
      "note": null,
      "found_by": "script",
      "validation": {
        "status": "validated",
        "rounds": 1
      }
    },
    {
      "file": ".claude/agents/fleet-scout.md",
      "line": null,
      "signals": [
        "claude-agent-file"
      ],
      "detail": "Claude Code subagent file",
      "status": "read",
      "reason": null,
      "outcome": "cards",
      "cards": [
        "fleet-scout"
      ],
      "note": null,
      "found_by": "script",
      "validation": {
        "status": "validated",
        "rounds": 1
      }
    },
    {
      "file": "prompts/ops-orchestrator.md",
      "line": null,
      "signals": [
        "prompt-file"
      ],
      "detail": "Instructions for the Claude Code main agent",
      "status": "read",
      "reason": null,
      "outcome": "cards",
      "cards": [
        "ops-orchestrator"
      ],
      "note": null,
      "found_by": "agent",
      "validation": {
        "status": "validated",
        "rounds": 1
      }
    },
    {
      "file": "services/ops/legacy_runner.rb",
      "line": 12,
      "signals": [
        "llm-call"
      ],
      "detail": "calls a model through a home-made HTTP wrapper",
      "status": "not-understood",
      "reason": "The wrapper builds the request from settings the scan could not follow.",
      "outcome": "pending",
      "cards": [],
      "note": null,
      "found_by": "agent",
      "validation": {
        "status": "needs-checking",
        "rounds": 3
      }
    },
    {
      "file": "services/ops/llm_client.py",
      "line": 2,
      "signals": [
        "llm-import"
      ],
      "detail": "imports anthropic",
      "status": "read",
      "reason": null,
      "outcome": "no-agent",
      "cards": [],
      "note": "Imports the SDK but never calls it.",
      "found_by": "script",
      "validation": {
        "status": "validated",
        "rounds": 1
      }
    }
  ],
  "unknowns": [
    {
      "card": "change-gate",
      "field": "guardrails.needs_approval",
      "reason": "loaded-from-database",
      "detail": "The approval rules are loaded by name from a database.",
      "evidence": [
        {
          "file": "services/gate/rules.py",
          "line": 14,
          "quote": "rules = db.load_rules(\"change-gate\")",
          "found_by": "agent"
        }
      ]
    }
  ]
}
```
