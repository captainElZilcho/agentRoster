# AgentRoster

**Status:** design v0.2 approved, nothing to install yet · **Licence:** Apache-2.0

Add it to a project. AgentRoster reads the code, maps every agent and every workflow that calls
a model, writes a standard **roster card** for each, and **assesses** how well each one is defined
to do its job: what is missing, why it matters, what goes wrong if you leave it, and the exact fix.

It also answers a question most teams can't: **do you actually have agents, or workflows that
call a model?**

## Why

Projects use agents from many places: their own code calling the Anthropic or OpenAI SDKs,
LangGraph or CrewAI services, Claude Code subagents and skills, MCP servers. Each is defined
differently, often only in code, so nobody can answer "what agents do I have, what can each one
do, and is each one defined well enough to do its job?" in one place.

## How it works

AgentRoster is a skill your own coding agent runs with your model (`npx skills add`). Small
scripts with no dependencies check everything it writes.

```
project ─► MAP ─► map.md ─► CARDS ─► roster.json ─► ASSESS ─► findings.json ─► REPORT
                                                                     cards/*.md · assessment.md · assessment.html
```

1. **Map**: find every agent and workflow that calls a model, in any language, read-only.
2. **Cards**: one roster card each, with file-and-line evidence for every value; nothing invented,
   no secrets copied.
3. **Assess**: check packs for completeness, depth, fit and least agency. Each card gets a 1–5
   definition score with a confidence; each finding says what, why, impact and the fix.
4. **Report**: Markdown for agents, one offline HTML report for people, in a git-ignored folder.

Everything a model writes is checked by a fresh validator before it counts.

## The roster card standard

A portable, extensible description of any agent: type, purpose, role, goals, instructions,
skills, tools, context, memory, guardrails, handoffs, ratings and usage stats, displayed like a
collection of sports cards. It reuses A2A Agent Cards, Agent Skills, MCP and Claude Code
subagent fields where they exist and adds what they lack.

Draft: [`spec/roster-card-standard-v0.1.md`](spec/roster-card-standard-v0.1.md) ·
Examples: [`examples/`](examples/)

AgentRoster is not affiliated with the A2A protocol; A2A's "Agent Card" is a different document,
and roster cards can export to it.

## Layout

| Path | What it holds |
|---|---|
| `spec/` | The roster card standard (versioned drafts; JSON Schema to come) |
| `examples/` | Example roster cards (`*.roster.json`) |
| `CLAUDE.md`, `AGENTS.md` | Instructions for coding agents working on this repo |

## Roadmap

Next: standard v0.2 with its JSON Schema and validator, then the skill's phases (map, cards,
assess, report).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE).
