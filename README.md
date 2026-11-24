# AgentRoster

**Find every AI agent in your project, and get a card for each one.**

AgentRoster is a skill your coding agent runs on your project. It reads the code (it never runs
it), finds every agent and every workflow that calls a model, in any language, and writes a
standard **roster card** for each: what it is for, which model and tools it uses, its guardrails,
what starts it, and where each fact came from, down to the file and line. You get the cards as
Markdown files and as one page to open in your browser.

It answers a question most teams can't: **what agents do we actually have, what can each one do,
and are they agents at all, or workflows that call a model?**

**Status:** early. The map and the cards work today. Checking how well each agent is defined
(assess) and the full report are planned, not built. The card standard and file formats are
drafts. · **Licence:** Apache-2.0

## Quick start

You need:

- a coding agent that can use Agent Skills, such as Claude Code;
- Node.js 20 or later (for the small checking scripts; they have no dependencies).

**1. Add the skill to your project.**

```
npx skills add captainElZilcho/agentRoster
```

Or copy the [`skills/agentroster/`](skills/agentroster/) folder into your agent's skills folder
(for Claude Code: `.claude/skills/agentroster/` in your project, or `~/.claude/skills/agentroster/`
for all your projects). The folder has everything the skill needs.

**2. Keep its output out of git.** Add this line to your `.gitignore`:

```
.agentroster/
```

The skill checks this and stops if the folder isn't ignored.

**3. Ask your agent:**

> Map the agents in this project and make the cards.

**4. Open the cards.** The run ends by telling you where they are:
`.agentroster/run-YYYY-MM-DD-N/cards.html`.

## What you get

Each run writes a folder `.agentroster/run-YYYY-MM-DD-N/`:

| File | What it is |
|---|---|
| `cards.html` | One offline page with a card per agent and workflow: what it does, what it runs on, what it can do, its guardrails, what the scan could not see, and the sources |
| `cards/<id>.md` | The same cards, one Markdown file each |
| `map.md` | The inventory: every agent and workflow, how they connect, and what was checked and found not to be an agent |
| `roster.json` | All the cards as data, in the [roster card standard](spec/roster-card-standard-v0.2.md) |
| `coverage.json` | Every place the scan looked, and everything it could not see |

Nothing on a card is guessed. A value the code doesn't show stays empty. A value that lives
outside the code (a prompt in a database, a model left to an SDK's default) is shown as
"couldn't see", never as missing or fine.

## What it does and doesn't do to your project

- **It never runs your code**, never installs anything, and never changes your files.
- **It never opens secret files** (`.env`, keys, credentials), and it is told to cite a secret
  by file and line only, writing `[redacted]` in its place. Before it finishes, a script checks
  the output for anything that looks like a secret or matches a value from your `.env`.
- **It may ask you questions.** Some things are a judgement call, mainly an agent's type (is it
  an assistant or a researcher?). When the skill isn't sure, it shows its pick and the runner-up
  and asks you. If you agree, it saves your answers in **`agentroster.json`** at the project root,
  so later runs use them and never ask again. That is the only file it ever writes in your
  project, and only after you say yes. You can edit it by hand or commit it so your team gets the
  same cards ([format](spec/answers-file-v0.1.md)).
- When it runs without a person (in CI, for example), it never asks and never writes: unsure
  picks are marked "to confirm" on the card.
- **On a project you don't trust, keep your agent on a short leash.** The skill is run by your
  own coding agent, so your agent's permissions are what really stop it from doing something
  wrong. On a project you didn't write, use a mode that asks before each file write and each
  command. Your agent may also load the project's `CLAUDE.md` or `AGENTS.md` as instructions when
  it starts inside the project. To avoid that, start it in another folder and name the project's
  folder in your request.

## What it finds

Agents and model workflows in any language. It knows these well, with notes for each: the
Anthropic, OpenAI and Claude Agent SDKs, LangChain and LangGraph, CrewAI, Claude Code subagents
and skills, and MCP servers, in Python and TypeScript or JavaScript. Other code that calls a model
is found too, from the code itself.

It tells **agents** (the model chooses its next step or tool) apart from **workflows** (model
calls along fixed paths), and gives each card one of nine standard types: orchestrator,
assistant, researcher, builder, specialist, reviewer, gatekeeper, operator or monitor.

## How it works

```
project ─► MAP ─► map.md ─► CARDS ─► roster.json ─► ASSESS ─► findings.json ─► REPORT
                             cards/*.md · cards.html                        assessment.md · assessment.html
```

1. **Map** (built): a script searches for the usual signs of model use, then your agent reads
   the code to find what text search can't see (wrappers, plain HTTP calls, prompt files).
2. **Cards** (built): one card per agent and workflow, with evidence for every value, then the
   Markdown cards and the cards page.
3. **Assess** (planned): check packs for completeness, depth, fit and least agency; a 1–5
   definition score per card, and findings that each say what, why, impact and the fix.
4. **Report** (planned): one offline report with the cards, a workflow view and the findings.

Everything a model writes is checked by a fresh validator before it counts, and scripts check
the files themselves. Your own agent and model do the reading; nothing is sent anywhere else.

## The roster card standard

A portable description of any agent: type, purpose, role, goals, instructions, skills, tools,
context, memory, guardrails, handoffs, ratings and usage stats, shown like a collection of
sports cards. It reuses A2A Agent Cards, Agent Skills, MCP and Claude Code subagent fields where
they exist and adds what they lack. You can also write a card by hand (`<id>.roster.json` next to
an agent): the skill uses your values over what it finds.

- Standard (draft): [`spec/roster-card-standard-v0.2.md`](spec/roster-card-standard-v0.2.md)
  (the [v0.1 draft](spec/roster-card-standard-v0.1.md) is kept)
- JSON Schema: [`schema/roster-card-0.2.schema.json`](schema/roster-card-0.2.schema.json)
- Examples: [`examples/`](examples/)

AgentRoster is not affiliated with the A2A protocol. A2A's "Agent Card" is a different document;
roster cards can be mapped to it.

## Scripts

The skill runs these for you. You can also run them yourself, for example in CI. They need
Node.js 20 or later and nothing else. Paths are relative to the skill folder.

| Script | What it does |
|---|---|
| `validate-card.mjs <file>...` | Checks a roster card or a `roster.json` against the standard |
| `validate-coverage.mjs <file>...` | Checks a `coverage.json` |
| `validate-findings.mjs <file>...` | Checks a `findings.json` |
| `validate-answers.mjs <file>...` | Checks an `agentroster.json` answers file |
| `detect.mjs <project> [--out <file>] [--exclude <dir>]...` | Searches a project for signs of model use, without running anything |
| `check-map.mjs <run>` | Checks `map.md` against `coverage.json` |
| `check-cards.mjs <run> --project <project>` | Checks the cards against the map and the code: the same agents everywhere, evidence for every value, each quote on its line, stored answers applied (stale ones printed as `note:` lines) |
| `redact-check.mjs <run> [--project <project>]` | Fails a run whose output holds anything secret-shaped or a value from the project's `.env`, MCP or settings files; prints where, never the value |
| `render-cards.mjs <run>` | Writes `cards/<id>.md` and `cards.html` into the run folder |
| `match-golden.mjs [--only coverage] <expected> <run>` | Compares a run with a reviewed answer key, one line per difference |

Exit codes: `0` ok, `1` problems found (listed), `2` a file or folder can't be used.
`detect.mjs` and `render-cards.mjs` exit `0` or `2`.

Try them on this repo's test fixtures:

```
node skills/agentroster/scripts/validate-card.mjs examples/fleet-scout.roster.json
node skills/agentroster/scripts/detect.mjs tests/fixtures/detect/anthropic-sdk
node skills/agentroster/scripts/check-cards.mjs tests/fixtures/cards-check/ok --project tests/fixtures/cards-check/ok-project
```

## File formats

| File | Spec | Schema |
|---|---|---|
| A roster card | [roster card standard v0.2](spec/roster-card-standard-v0.2.md) | [`roster-card-0.2`](schema/roster-card-0.2.schema.json) |
| `roster.json` (every card of a run) | [roster file v0.1](spec/roster-file-v0.1.md) | [`roster-file-0.1`](schema/roster-file-0.1.schema.json) |
| `coverage.json` | [coverage v0.2](spec/coverage-v0.2.md) (the validator also reads [0.1](spec/findings-and-coverage-v0.1.md)) | [`coverage-0.2`](schema/coverage-0.2.schema.json) |
| `findings.json` (planned assess phase) | [findings v0.1](spec/findings-and-coverage-v0.1.md) | [`findings-0.1`](schema/findings-0.1.schema.json) |
| `agentroster.json` (your answers) | [answers file v0.1](spec/answers-file-v0.1.md) | [`answers-file-0.1`](schema/answers-file-0.1.schema.json) |

All are drafts and may change with a new version.

## Repository layout

| Path | What it holds |
|---|---|
| `skills/agentroster/` | The skill: `SKILL.md` (start here), `MAP.md`, `CARDS.md`, `VALIDATION.md`, `ecosystems/` (notes per framework), `references/`, `templates/` (the cards page), `schema/` (copies) and `scripts/` |
| `spec/` | The roster card standard and the file formats (versioned drafts) |
| `schema/` | JSON Schemas for each format |
| `examples/` | Example roster cards and example run files |
| `tests/` | Tests and synthetic fixtures |
| `CLAUDE.md`, `AGENTS.md` | Instructions for coding agents working on this repository |

## Develop

```
npm install   # dev only: Ajv, used by the tests to cross-check the schemas
npm test
```

The shipped scripts have no dependencies. Changes are made test-first.

## Roadmap

- **Done:** the roster card standard v0.2 draft and its schema; the coverage, findings, roster
  file and answers file formats with validators; the map and cards phases of the skill,
  including the cards page and asking about unsure types.
- **Next:** the assess phase (check packs, definition score, findings), then the report.

## Contributing

Issues and discussion are welcome, especially on the standard, the agent types and the checks.
See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE).
