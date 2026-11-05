# AgentRoster

**Status:** standard v0.2 draft and its schema; the skill is not built yet · **Licence:** Apache-2.0

AgentRoster will be a tool you add to a project. It is meant to read the code, map every agent and
every workflow that calls a model, write a standard **roster card** for each, and **assess** how
well each one is defined to do its job.

It is meant to answer a question most teams can't: **do you actually have agents, or workflows
that call a model?**

## Why

Projects use agents from many places: their own code calling the Anthropic or OpenAI SDKs,
LangGraph or CrewAI services, Claude Code subagents and skills, MCP servers. Each is defined
differently, often only in code, so nobody can answer "what agents do I have, what can each one
do, and is each one defined well enough to do its job?" in one place.

## How it works

This is the planned design. Only the card validator is built so far.

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
4. **Report**: will write Markdown for agents and one offline HTML report for people, in a
   git-ignored folder.

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

## Check a card

Check a roster card against the v0.2 rules. Needs Node 20 or later and no install:

```
node skills/agentroster/scripts/validate-card.mjs my-agent.roster.json
```

Exit codes: `0` all cards are valid, `1` any card is invalid, `2` a file can't be read or isn't
JSON.

## Layout

| Path | What it holds |
|---|---|
| `spec/` | The roster card standard (versioned drafts; v0.2 is current, v0.1 kept) |
| `schema/` | JSON Schemas for roster cards (`roster-card-0.2.schema.json`) |
| `skills/agentroster/` | The skill; so far the card validator (`scripts/validate-card.mjs`) |
| `examples/` | Example roster cards (`*.roster.json`) |
| `tests/` | Tests and synthetic fixtures (`npm test`) |
| `package.json` | Node 20 or later; no runtime dependencies |
| `CLAUDE.md`, `AGENTS.md` | Instructions for coding agents working on this repo |

## Roadmap

Done: standard v0.2 draft, its JSON Schema and the card validator.
Next: the skill's phases (map, cards, assess, report).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE).
