# Roster file v0.1 (draft)

A roster file, `roster.json`, holds every roster card of one run in a single file. The skill
writes it after the cards step. Later steps (compare, report) read it instead of many card files.

The file is JSON. Its schema is [`roster-file-0.1.schema.json`](../schema/roster-file-0.1.schema.json).
Each card follows the [roster card standard v0.2](roster-card-standard-v0.2.md).

## The envelope

```
{ "roster_file": "0.1", "snapshot": { }, "cards": [ ] }
```

| Field | Values |
|---|---|
| `roster_file` | The string `"0.1"` |
| `snapshot` | The run header. It is the same as in `findings.json` and `coverage.json`; the fields are in [`findings-and-coverage-v0.1.md`](findings-and-coverage-v0.1.md), section 2.1. `packs` may be `[]` |
| `cards` | A list of roster cards. `[]` is allowed when the run found no agent |

No other top-level keys are allowed.

## Checks

The schema checks the envelope. Then each card is checked against the card schema. An error in a
card has the path of the card first, for example `/cards/1/kind`.

Two more rules run only when the envelope and every card pass:

- Card ids are unique. A repeat is reported at `/cards/<index>/id` as `duplicate card id "<id>"`.
- Cards are sorted by `id`, by code unit, never by locale, so two runs give identical files. The
  first card out of place is reported at `/cards/<index>/id`.

## Example

A file with one card:

```json
{
  "roster_file": "0.1",
  "snapshot": {
    "id": "run-2026-11-05-1",
    "taken_at": "2026-11-05T14:30:00Z",
    "project": "ops-hub",
    "standard": "0.2",
    "packs": [
      {
        "id": "completeness",
        "version": "0.1"
      }
    ],
    "mode": "standard",
    "previous": null
  },
  "cards": [
    {
      "roster": "0.2",
      "id": "change-gate",
      "name": "Change Gate",
      "kind": "agent",
      "app": "Ops Hub",
      "type": "gatekeeper",
      "secondary": null,
      "status": "new",
      "purpose": "Approves or blocks any action that leaves the workspace (container restarts, pushes, messages) against the hub's rules.",
      "engine": {
        "model": "claude-opus-5-5",
        "effort": "high"
      },
      "runtime": "Claude Code subagent",
      "autonomy": "L3",
      "version": "2026.1",
      "icon": "🛡️",
      "definition": null,
      "ratings": {
        "ACC": "~90",
        "CON": "~88",
        "TOOL": "~70",
        "PLAN": "unrated",
        "DISC": "~95",
        "COMM": "~85",
        "SPD": "unrated",
        "EFF": "unrated",
        "overall": "unrated"
      },
      "headline_stats": [
        "runs",
        "accepted_rate",
        "cost_per_run"
      ],
      "role": "Reads the proposed action, the requester's card and the rules; returns approve, block or ask-the-user with the rule it applied. Produces no work.",
      "goals": [
        "Never let a forbidden action through",
        "Send anything the rules mark \"ask first\" to the user, every time",
        "Give the rule behind every decision"
      ],
      "persona": null,
      "instructions": "prompts/change-gate.md",
      "skills": [
        {
          "name": "policy-check",
          "tag": "security_privacy/policy_enforcement"
        }
      ],
      "tools": {
        "allow": [
          "Read",
          "mcp__opshub__fleet"
        ],
        "deny": [
          "Bash",
          "Write",
          "Edit"
        ],
        "mcp": [
          "opshub"
        ]
      },
      "context": [
        "CLAUDE.md"
      ],
      "memory": {
        "scope": "none",
        "where": null,
        "retention": null
      },
      "guardrails": {
        "permission": "approve",
        "needs_approval": [],
        "forbidden": [
          "approve output from its own card",
          "approve container actions without the user",
          "approve commits or pushes without the user"
        ],
        "data": "internal",
        "limits": {
          "turns": 4,
          "minutes": 1,
          "usd": 0.1
        }
      },
      "io": {
        "in": [
          "json"
        ],
        "out": [
          "json"
        ],
        "report": "{decision: approve|block|ask_user, rule, reason}"
      },
      "handoffs": {
        "from": [
          {
            "type": "orchestrator"
          },
          {
            "type": "operator"
          },
          {
            "type": "builder"
          }
        ],
        "to": [
          {
            "type": "orchestrator"
          }
        ]
      },
      "org": {
        "reports_to": "ops-orchestrator",
        "group": "safety"
      },
      "stats": null,
      "source": {
        "files": [],
        "found_by": "hand"
      },
      "evidence": {},
      "provenance": {
        "author": "AgentRoster examples",
        "created": "2026-11-01",
        "changed": "2026-11-01",
        "license": null,
        "signature": null
      },
      "profiles": [],
      "extensions": {
        "org.example.opshub/v1": {
          "inventory_app": "ops-hub"
        }
      }
    }
  ]
}
```

## Check a file

```
node skills/agentroster/scripts/validate-card.mjs roster.json
```

The same command checks a single card file. It reads the file as a roster file when the top level
has `roster_file`, and as a card otherwise.
