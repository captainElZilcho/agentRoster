# AgentRoster

**Status:** standard v0.2, findings format v0.1 and coverage format v0.2 (drafts), their validators, and the map and cards phases of the skill. The assess and report phases are not built yet · **Licence:** Apache-2.0

AgentRoster is a tool you add to a project. It reads the code, maps every agent and every
workflow that calls a model, writes a standard **roster card** for each, and (planned)
**assesses** how well each one is defined to do its job. Today the map and the cards are built;
assess and report are not.

Think of it as an inventory plus a configuration review, like auditing firewalls: what agents
are there, what each one is set up to do, and whether that is enough, including what should be
there but isn't. Each agent gets two parts: its **definition** (the card: what it is and what it
can do) and its **result** (how well that definition holds up, check by check).

It is meant to answer a question most teams can't: **do you actually have agents, or workflows
that call a model?**

## Why

Projects use agents from many places: their own code calling the Anthropic or OpenAI SDKs,
LangGraph or CrewAI services, Claude Code subagents and skills, MCP servers. Each is defined
differently, often only in code, so nobody can answer "what agents do I have, what can each one
do, and is each one defined well enough to do its job?" in one place.

## How it works

The **map** and **cards** phases are built. The assess and report phases are the planned design
and are not built yet; a run stops after the cards and says so.

AgentRoster is a skill your own coding agent runs with your model (`npx skills add`). Small
scripts with no dependencies do everything that needs no model.

```
project ─► MAP ─► map.md ─► CARDS ─► roster.json ─► ASSESS ─► findings.json ─► REPORT
                             cards/*.md · cards.html                        assessment.md · assessment.html
```

1. **Map** (built): finds every agent and workflow that calls a model, in any language,
   read-only, and writes `map.md` and `coverage.json`.
2. **Cards** (built): writes one roster card each into `roster.json`, with file-and-line
   evidence for every value; nothing invented; secrets checked for. Then draws each card as
   Markdown (`cards/<id>.md`) and as one offline page (`cards.html`): a header with what the agent
   does, its specs (what it runs on, what it can do, its guardrails), what the card could not see,
   and the details and sources folded away.
3. **Assess** (not built): will check packs for completeness, depth, fit and least agency. Each card will get
   a 1–5 definition score with a confidence; each finding will say what, why, impact and the fix.
   What the scan couldn't see is marked unknown, never reported as missing or fine.
4. **Report** (not built): will write one offline HTML report for people, in a git-ignored
   folder: the cards at the top, a workflow view, then the findings and recommendations.

Everything a model writes is checked by a fresh validator before it counts (for now, the map and cards phases are checked this way).

### Run it

Ask your coding agent to use the `agentroster` skill, for example: "Map the agents in this
project." It follows [`skills/agentroster/SKILL.md`](skills/agentroster/SKILL.md): it sets up a run
folder (`.agentroster/run-YYYY-MM-DD-N/`, which must be git-ignored), runs the search script,
reads the candidates, writes `detect.json`, `map.md` and `coverage.json`, then writes the cards
(`roster.json`, `cards/<id>.md`, and `cards.html` to open in a browser). It never runs your
project and never edits your files. It never opens secret files, and it checks its own output
for secrets before it finishes, using the scripts below. Then it tells you what it found and
what it could not see.

### Map and card scripts

```
node skills/agentroster/scripts/detect.mjs tests/fixtures/detect/anthropic-sdk
node skills/agentroster/scripts/check-map.mjs tests/fixtures/map/ok
node skills/agentroster/scripts/redact-check.mjs tests/fixtures/map/ok
node skills/agentroster/scripts/check-cards.mjs tests/fixtures/cards-check/ok
```

The paths above are this repo's own test fixtures. `detect.mjs` prints to the screen; add
`--out <file>` to write a file (the skill writes into the run folder).

- `detect.mjs <project-dir> [--out <file>] [--exclude <dir>]...` looks for the common signs of
  model use without running anything. Exit codes: `0` it ran, `2` the folder can't be read.
- `check-map.mjs <run-dir>` checks `map.md` against `coverage.json`. Exit codes: `0` ok, `1`
  problems (listed), `2` a file can't be read.
- `redact-check.mjs <run-dir> [--project <dir>]` fails a run whose output holds secret-shaped
  text, a value from the project's `.env`, MCP or settings files, or a link. It prints where,
  never the value. Exit codes: `0` clean, `1` a leak, `2` a file can't be read.
- `check-cards.mjs <run-dir>` checks `roster.json` against `map.md` and `coverage.json`: the same
  agents in all three, evidence for every filled value, real field names, relative paths.
  Exit codes: `0` ok, `1` problems (listed), `2` a file can't be read.
- `render-cards.mjs <run-dir>` writes `cards/<id>.md` and `cards.html` into the run folder (it
  writes files, so run it on a run folder, not on these fixtures). Exit codes: `0` written, `2`
  input missing or invalid.

## The roster card standard

A portable, extensible description of any agent: type, purpose, role, goals, instructions,
skills, tools, context, memory, guardrails, handoffs, ratings and usage stats, displayed like a
collection of sports cards. It reuses A2A Agent Cards, Agent Skills, MCP and Claude Code
subagent fields where they exist and adds what they lack.

Draft: [`spec/roster-card-standard-v0.2.md`](spec/roster-card-standard-v0.2.md). The earlier
[v0.1 draft](spec/roster-card-standard-v0.1.md) is kept.
JSON Schema: [`schema/roster-card-0.2.schema.json`](schema/roster-card-0.2.schema.json) ·
Examples: [`examples/`](examples/)

AgentRoster is not affiliated with the A2A protocol; A2A's "Agent Card" is a different document,
and roster cards can be mapped to it.

## Check a card or a run file

Check a roster card, a `roster.json` (every card of a run), a `findings.json` or a `coverage.json`
against its rules. Needs Node 20 or
later and no install:

```
node skills/agentroster/scripts/validate-card.mjs my-agent.roster.json
node skills/agentroster/scripts/validate-card.mjs roster.json
node skills/agentroster/scripts/validate-findings.mjs findings.json
node skills/agentroster/scripts/validate-coverage.mjs coverage.json
node skills/agentroster/scripts/match-golden.mjs expected/ run/
node skills/agentroster/scripts/match-golden.mjs --only coverage expected/ run/
```

The formats are in [`spec/findings-and-coverage-v0.1.md`](spec/findings-and-coverage-v0.1.md),
[`spec/coverage-v0.2.md`](spec/coverage-v0.2.md) (the coverage format the map writes; the validator
reads 0.1 and 0.2) and [`spec/roster-file-v0.1.md`](spec/roster-file-v0.1.md).
Exit codes for the validators (`validate-card`, `validate-findings`, `validate-coverage`): `0` all files are valid, `1` any file is invalid, `2` a file can't be read
or isn't JSON.

`match-golden.mjs` compares a run folder with a reviewed answer key (`roster.json`, `coverage.json`
and an optional `expect.json` with `forbidden_strings` and `notes`). It prints one line per
difference. With `--only coverage` it compares only `coverage.json` (the map phase). Exit codes:
`0` the run matches, `1` it differs, `2` a file is missing or invalid.

## Layout

| Path | What it holds |
|---|---|
| `spec/` | The roster card standard (versioned drafts; v0.2 is current, v0.1 kept), the findings and coverage formats (`findings-and-coverage-v0.1.md`, `coverage-v0.2.md`) and the roster file (`roster-file-v0.1.md`) |
| `schema/` | JSON Schemas: roster cards (`roster-card-0.2.schema.json`), `findings-0.1.schema.json`, `coverage-0.1.schema.json`, `coverage-0.2.schema.json` and `roster-file-0.1.schema.json` |
| `skills/agentroster/` | The skill: `SKILL.md`, `MAP.md`, `CARDS.md`, `VALIDATION.md`, `ecosystems/` (notes and `patterns.json` for each ecosystem the search knows), `templates/` (the cards page) and `scripts/` (the three validators, `detect.mjs`, `check-map.mjs`, `redact-check.mjs`, `check-cards.mjs`, `render-cards.mjs`, `match-golden.mjs`) |
| `examples/` | Example roster cards (`*.roster.json`), `roster.example.json`, `findings.example.json`, `coverage.example.json` and `coverage-0.2.example.json` |
| `tests/` | Tests and synthetic fixtures (`npm test`) |
| `package.json` | Node 20 or later; no runtime dependencies |
| `CLAUDE.md`, `AGENTS.md` | Instructions for coding agents working on this repo |

## Roadmap

Done: standard v0.2 draft, its JSON Schema and the card validator; findings and coverage formats and their validators; the map phase of the skill (search script, map checks, secret check, ecosystem notes); the cards phase (cards with evidence, card checks, Markdown cards and the offline cards page).
Next: the assess and report phases.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE).
