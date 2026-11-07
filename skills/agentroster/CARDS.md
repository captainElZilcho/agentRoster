# Cards: one roster card per agent and workflow

This file is the method for the cards phase. Read `SKILL.md` first; it says when to come here.
The map is done: `map.md` and `coverage.json` are in the run folder and passed their checks.

You write `roster.json`, a roster file (format 0.1, `spec/roster-file-v0.1.md`) that holds one
standard v0.2 card per agent and workflow (`spec/roster-card-standard-v0.2.md`). Then the scripts
check the cards and draw them as Markdown and as an HTML page.

## 1. What goes in

- **The inventory comes from the map.** Write exactly one card for each id in `map.md`'s
  inventory, with that id, and no others. Never add or drop an agent here. If you find an agent
  the map missed, or a card that should not exist, go back to the map step (`MAP.md`), fix
  `map.md` and `coverage.json`, and run their checks again.
- **Read the code again** for each card. The map tells you where to look; the card needs the
  exact values and the lines they come from.
- **Hand-written cards** (`*.roster.json` in the project) are candidates in the map. Read each one.

## 2. Filling a card

- **Every field is present.** A field the source does not show is `null` (single values) or `[]`
  (lists). Never write the text "none", "n/a" or "unknown" as a value.
- **Every filled value has evidence:** at least one item `{"file", "line", "quote", "found_by"}`
  under `evidence`, keyed by the field path (`"engine.model"`, `"guardrails.limits.turns"`). For a
  list field, key the evidence by the field itself (`"goals"`, `"tools.allow"`), never by an item
  number. `file` is the path from the project root with forward slashes. `line` is the line
  number, or `null` for a whole file. `quote` is the line as written, with any secret replaced by
  `[redacted]`. `found_by` is `script`, `agent` or `hand`.
- **`kind` and `type` are never null.** `kind` follows the identity rule in `MAP.md` (an agent
  lets the model choose its next step or tool; a workflow runs model calls along fixed paths).
  `type` is a judgement: choose it by the job, not by the name the agent gives itself, and quote
  the line that decided it under `evidence.type`. When two types fit, pick by the job and note the
  other in `map.md` under that agent.
- **Ids** come from the map; the order for choosing them is in `MAP.md`.
- **What you could not see stays empty.** A field whose value lives outside the code (a prompt in a
  database, a model left to an SDK's default) is `null` on the card and has an unknown in
  `coverage.json` (`card`, `field`, `reason`, `detail`, `evidence`). Cite the line where the value
  would be set. For a list, keep the items the code does show and add the unknown to say the list
  may be incomplete (for example an MCP server whose tools live in a package).
- **A stated limit is not a limit.** A limit written in a prompt ("keep it under 5 steps") but not
  enforced by code is never put in `guardrails.limits`. Record where it is stated in the role or
  details, and list the field it would fill under the card-view extension's `stated_only` (below).
- **Permission comes only from a declared setting:** a permission mode (Claude Code's
  `permissionMode`, the Agent SDK's `permission_mode`) or a hand card's value. A list of tools is
  `tools.allow` / `tools.deny`, never permission.
- **The general rules in `MAP.md` section 4 apply to every card**, for example: saving output is
  not memory; a trigger is not input; a handoff is recorded only where one carded step passes work
  straight to another; a run-wide budget belongs to the workflow and a limit inside one agent's
  loop belongs to that agent; the main prompt is `instructions` and a shared skill file appended
  to it is a skill; the output format (`io.report`) is filled only from a stated output line
  apart from the goal; `instructions` is a path when the prompt lives in a file and the text when
  it lives in code; a check the pipeline runs between steps belongs to the pipeline's card.
- **Do not fill** `ratings` (all `"unrated"`), `definition` (`null`), `stats` (`null`),
  `headline_stats` (`[]`) or `status` (`null`). The assessment sets them later.

## 3. Hand-written cards win

A developer may keep `<id>.roster.json` beside an agent.

- **Its values replace scanned ones.** Use them as written, with the hand card as the first
  evidence item (`found_by: "hand"`). When the code shows the same field, add the code evidence
  after it.
- **Fields it leaves empty are filled from the code**, with code evidence.
- **When it disagrees with the code** (for example `permission: read-only` while a tool writes
  files), keep the hand value, add the code evidence beside it, and leave the gap for the
  assessment to report. Never "fix" a hand card.
- **A hand card with no matching code** keeps its id and card; its candidate in `coverage.json` has
  `validation.status: "needs-checking"`.
- **A file name that doesn't match its `id`** (`a.roster.json` with `"id": "b"`): use the `id`, and
  say so in your final message as a warning.

## 4. The card-view extension

Some things the card shows have no core field: the short runtime name, the language, what starts
a workflow, its steps in flow order, how many of its steps are plain code, and which limits are
only stated. They go in one extension on the card, named exactly:

```
io.github.captainelzilcho.agentroster.card-view/v1
```

```json
"extensions": {
  "io.github.captainelzilcho.agentroster.card-view/v1": {
    "runtime_name": "LangGraph",
    "language": "Python",
    "starts": ["daily 06:30 UTC", "on demand"],
    "steps": ["scout", "analyst", "critic"],
    "plain_steps": 4,
    "stated_only": [],
    "evidence": {
      "runtime_name": [{"file": "app/graph.py", "line": 4, "quote": "from langgraph.graph import StateGraph", "found_by": "agent"}],
      "starts": [{"file": "app/scheduler.py", "line": 9, "quote": "scheduler.add_job(run, \"cron\", hour=6, minute=30)", "found_by": "agent"}]
    }
  }
}
```

- Fill only what the code shows; leave a key out (or `[]`) otherwise.
- `steps` lists the ids of the cards that report to this workflow, in the order the code runs them.
- `stated_only` lists card field paths (such as `"guardrails.limits.turns"`) whose value is only
  stated in a prompt.
- Evidence for these values goes in the extension's own `evidence` map, one key per field, same
  item shape as the card's evidence. Every filled value here needs it.

## 5. Check, then draw

Run these from the skill folder, in this order, after writing `roster.json`:

```
node <skill>/scripts/validate-card.mjs <run>/roster.json
node <skill>/scripts/check-cards.mjs <run>
```

Then follow `VALIDATION.md` (the validator checks each card against the code), then:

```
node <skill>/scripts/redact-check.mjs <run> --project <project>
node <skill>/scripts/render-cards.mjs <run>
```

`check-cards.mjs` checks that the cards, the map and the coverage name the same agents; that every
filled value has evidence; that every evidence key is a real field; that evidence paths are
relative with forward slashes; that a field with an unknown is empty; and that a workflow's
`steps` report to it. A failed check is fixed and run again; a run never ends with a known leak or
an invalid file. `render-cards.mjs` writes `cards/<id>.md` and `cards.html` in the run folder.
