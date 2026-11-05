# AgentRoster

**Status:** standard v0.2, findings and coverage formats v0.1, and their validators; the skill is not built yet · **Licence:** Apache-2.0

AgentRoster will be a tool you add to a project. It is meant to read the code, map every agent and
every workflow that calls a model, write a standard **roster card** for each, and **assess** how
well each one is defined to do its job.

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

This is the planned design. Only the formats and their validators are built so far.

AgentRoster will be a skill your own coding agent runs with your model (`npx skills add`). Small
scripts with no dependencies will check everything it writes.

```
project ─► MAP ─► map.md ─► CARDS ─► roster.json ─► ASSESS ─► findings.json ─► REPORT
                                                                     cards/*.md · assessment.md · assessment.html
```

1. **Map**: will find every agent and workflow that calls a model, in any language, read-only.
2. **Cards**: will write one roster card each, with file-and-line evidence for every value;
   nothing invented, no secrets copied.
3. **Assess**: will check packs for completeness, depth, fit and least agency. Each card will get
   a 1–5 definition score with a confidence; each finding will say what, why, impact and the fix.
   What the scan couldn't see is marked unknown, never reported as missing or fine.
4. **Report**: will write Markdown for agents and one offline HTML report for people, in a
   git-ignored folder: a dashboard of agent cards at the top, then the findings and
   recommendations below.

Everything a model writes will be checked by a fresh validator before it counts.

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

Check a roster card, a `findings.json` or a `coverage.json` against its rules. Needs Node 20 or
later and no install:

```
node skills/agentroster/scripts/validate-card.mjs my-agent.roster.json
node skills/agentroster/scripts/validate-findings.mjs findings.json
node skills/agentroster/scripts/validate-coverage.mjs coverage.json
```

The formats are in [`spec/findings-and-coverage-v0.1.md`](spec/findings-and-coverage-v0.1.md).
Exit codes (all three): `0` all files are valid, `1` any file is invalid, `2` a file can't be read
or isn't JSON.

## Layout

| Path | What it holds |
|---|---|
| `spec/` | The roster card standard (versioned drafts; v0.2 is current, v0.1 kept) and the findings and coverage formats (`findings-and-coverage-v0.1.md`) |
| `schema/` | JSON Schemas: roster cards (`roster-card-0.2.schema.json`), `findings-0.1.schema.json` and `coverage-0.1.schema.json` |
| `skills/agentroster/` | The skill; so far the three validators (`scripts/validate-card.mjs`, `scripts/validate-findings.mjs`, `scripts/validate-coverage.mjs`) |
| `examples/` | Example roster cards (`*.roster.json`), `findings.example.json` and `coverage.example.json` |
| `tests/` | Tests and synthetic fixtures (`npm test`) |
| `package.json` | Node 20 or later; no runtime dependencies |
| `CLAUDE.md`, `AGENTS.md` | Instructions for coding agents working on this repo |

## Roadmap

Done: standard v0.2 draft, its JSON Schema and the card validator; findings and coverage formats v0.1 and their validators.
Next: the skill's phases (map, cards, assess, report).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE).
