# AgentRoster card standard — v0.1 (draft)

> **Name:** AgentRoster, chosen so it can't be confused with A2A's "Agent
> Card". One card in this standard is a **roster card**; a set of them is a **roster**.

**Status:** draft for discussion · **Date:** 2026-11-01 · **Project:** [AgentRoster](../README.md)

One standard way to describe any agent, in any app, so that every agent can be listed, compared
and displayed the same way: as a card in a collection, like sports cards. Every card has the
same fields. A field that doesn't apply is written as `none`, never left out, so cards line up
side by side.

Where an existing standard already defines something (skills, tools, discovery, runtime
settings), the card **references or compiles to** it instead of inventing a new shape.

Contents: 1 Agent types · 2 The card (fields) · 3 Ratings · 4 Usage stats · 5 Status, versions
and autonomy · 6 The collection view · 7 The org chart · 8 Drafting an agent · 9 Portability and
extensions · 10 Mappings to existing standards · 11 File format

---

## 1. Agent types

A fixed list of types, so a collection can be grouped and filtered the same way across apps.
Each card has one primary type and at most one secondary. The type also sets the **permission
ceiling**: the most an agent of that type should ever be allowed to change.

| Code | Type | What it does | Permission ceiling |
|---|---|---|---|
| `orchestrator` | Orchestrator | Plans a task, picks and hands work to other agents, collects results | Delegate; read |
| `assistant` | Assistant | Talks with a person and answers or helps directly (chat, briefing) | Read; actions only through other agents or with approval |
| `researcher` | Researcher | Finds and summarises information: code, web, documents, data | Read only |
| `builder` | Builder | Produces a work product: code, document, analysis, plan | Write inside its workspace |
| `specialist` | Specialist | Builder for one narrow area (SQL, one API, one language) | Write inside its workspace, own area |
| `reviewer` | Reviewer | Checks work: code review, tests, fact check, security review | Read; comment; run tests |
| `gatekeeper` | Gatekeeper | Approves or blocks actions against policy before they leave the workspace | Approve / deny |
| `operator` | Operator | Acts on the world: deploys, restarts, sends messages, places orders | Act outside the workspace, within guardrails |
| `monitor` | Monitor | Watches something on a schedule or on events and raises alerts | Read; notify |

**Separation of duties:** a reviewer or gatekeeper never reviews or approves output from its own
card.

## 2. The card (fields)

### Front: what you see in the collection

| Field | Meaning | Example |
|---|---|---|
| `id` | Stable, unique, kebab-case | `fleet-scout` |
| `name` | Display name | Fleet Scout |
| `app` | The app it belongs to (the "team" on the card) | Ops Hub |
| `type` | Agent type code (section 1), plus optional `secondary` | `researcher` |
| `purpose` | One sentence: what it is for | Answers "what's running and what's wrong" from the ops hub's data |
| `engine` | Model and effort | `claude-haiku-5-5`, effort low |
| `runtime` | Where and how it runs | Claude Code subagent; Python service; Agent SDK; scheduled job |
| `autonomy` | L0–L3 (section 5) | L3 |
| `status` | Active, New, Broken, Retired, External | Active |
| `ratings` | Eight ratings, 0–99, plus overall (section 3) | ACC 88 · CON 81 … OVR 84 |
| `headline_stats` | Three numbers from real use (section 4) | 412 runs · 96% accepted · $0.04/run |
| `version` | Card version (section 5) | 2026.2 |
| `icon` | Optional image or emoji for the card | 🔭 |

### Back: the full spec

The attributes the user named, in one fixed order.

| Field | Contents | Points to |
|---|---|---|
| `role` | What this agent does and doesn't do, in a few lines | — |
| `goals` | 1–5 outcomes it optimises for, most important first | — |
| `persona` | Optional, 1–3 sentences of voice and tone. Never carries rules | — |
| `instructions` | The system prompt, or a path to it | A file |
| `skills` | Skills it knows, each with a tag from a shared taxonomy | Agent Skills (`SKILL.md`), OASF tags |
| `tools` | Allowed tools and MCP servers; explicit deny list | MCP, runtime tool names |
| `context` | What it loads at start: project instruction files, documents, data sources | AGENTS.md, CLAUDE.md, files |
| `memory` | Whether it remembers between runs, scope (`none`, `run`, `project`, `user`), where, retention | Runtime memory settings |
| `guardrails` | Permission granted (≤ the type ceiling); actions needing approval; forbidden actions; data it may see; limits (turns, time, spend) | OWASP least agency |
| `io` | Input and output modes and the shape of its final report | A2A input/output modes |
| `handoffs` | Agents or types it takes work from and passes work to | — |
| `org` | Where it sits in the org chart: `reports_to` (a card ID, or the owning person or app), `group` (team or department inside the app) | Section 7 |
| `stats` | Usage stats (section 4) | Logged by the runtime |
| `source` | Where the definition lives (file path, repo), so the card can be checked against it | — |
| `provenance` | Author, created, last changed, licence, signature (optional) | A2A `signatures` |
| `extensions` | Extra fields under a namespace, never mixed into the core (section 9) | A2A `AgentExtension` idea |

## 3. Ratings

Eight ratings, always the same eight, on a 0–99 scale. **No evidence, no number:** each rating
names the test it came from, the date, and how many tasks and tries. A rating without evidence is
`unrated`. A self-reported estimate may be shown with a `~` (for example `~75`) and is never used
to meet a minimum when drafting.

| Code | Rating | What it measures | How (v0.1) |
|---|---|---|---|
| `ACC` | Accuracy | Gets the task right | Pass rate on a test set for its type, one try each (pass@1) × 100 |
| `CON` | Consistency | Gets it right every time | pass^3: share of tasks passed on all 3 tries × 100 |
| `TOOL` | Tool handling | Right tool, valid arguments, recovers from tool errors | Share of correct tool calls in test traces × 100 |
| `PLAN` | Planning | Finishes multi-step work (5+ steps) | Pass rate on the multi-step subset × 100 |
| `DISC` | Discipline | Stays inside its guardrails; refuses traps; stops and asks when it should | Share of seeded traps handled correctly (injected instructions, out-of-scope asks, secret bait, approval-required actions) × 100 |
| `COMM` | Communication | Reports accurately: no overclaiming, clear status, usable handoffs | Rubric score on its final reports (model grader plus a human sample) |
| `SPD` | Speed | Time to finish | Percentile against other cards of the same type (faster = higher) |
| `EFF` | Efficiency | Cost to finish | Percentile on cost per accepted run against the same type |

Capped at 99. `SPD` and `EFF` are relative to the collection; the other six are absolute.

**Bands** (card colour and word): 90–99 Excellent · 80–89 Strong · 70–79 Good · 60–69 Fair ·
below 60 Not ready.

### Overall (weighted by type)

What matters differs by type, so the overall uses type weights (each row sums to 100).

| Type | ACC | CON | TOOL | PLAN | DISC | COMM | SPD | EFF |
|---|---|---|---|---|---|---|---|---|
| Orchestrator | 10 | 10 | 5 | 30 | 15 | 20 | 5 | 5 |
| Assistant | 25 | 10 | 10 | 5 | 15 | 25 | 5 | 5 |
| Researcher | 20 | 10 | 20 | 10 | 10 | 20 | 5 | 5 |
| Builder | 30 | 15 | 15 | 15 | 10 | 5 | 5 | 5 |
| Specialist | 30 | 15 | 20 | 10 | 10 | 5 | 5 | 5 |
| Reviewer | 30 | 20 | 10 | 5 | 15 | 15 | 0 | 5 |
| Gatekeeper | 25 | 25 | 5 | 0 | 35 | 10 | 0 | 0 |
| Operator | 15 | 20 | 25 | 5 | 25 | 5 | 5 | 0 |
| Monitor | 25 | 25 | 15 | 0 | 10 | 15 | 5 | 5 |

`overall = round(Σ weight × rating / 100)`. Shown only when at least six of the eight are
measured, and for gatekeepers and operators only when `DISC` is measured.

## 4. Usage stats

Counted from real use, not tests. Ratings say how it tested; stats say how it works in practice.

| Stat | Meaning |
|---|---|
| `runs` | Times it was invoked |
| `accepted` | Runs whose output was accepted without rework (and the rate) |
| `reworked` | Runs whose output was redone or reverted |
| `handoffs` | Handoffs it made that led to accepted work |
| `blocked` | Guardrail violations and blocked actions, each logged with the rule |
| `caught` | Reviewers and gatekeepers: real problems caught ÷ real problems that reached them |
| `median_time` | Median time per run |
| `cost_per_run` | Mean cost per run |
| `last_run` | When it last ran |

The card front shows three of them (`headline_stats`); by default runs, accepted rate and cost
per run. A **drift flag** shows when the last 20 runs disagree with the ratings (for example the
accepted rate falling while `ACC` is high).

## 5. Status, versions and autonomy

| Status | Meaning |
|---|---|
| Active | In use and healthy |
| New | Fewer than six ratings measured; use with supervision |
| Broken | A tool, credential, MCP server or model it needs is failing or revoked |
| Retired | Replaced by another card; kept for its history |
| External | An agent from outside your apps, found through its A2A Agent Card; untrusted until reviewed |

**Versions.** Changing the model, instructions, tools, skills or guardrails makes a new card
version (`YYYY.N`). The previous version's ratings stay on the card marked **stale** until the
tests run again. Any rating older than 90 days is also stale.

**Autonomy**

| Level | Name | It may |
|---|---|---|
| L0 | Suggest | Propose only; a person or another agent acts |
| L1 | Supervised | Act, with approval before every change |
| L2 | Workspace | Act freely inside its workspace; approval for anything outside |
| L3 | Unattended | Act inside its guardrails without approval (still within the type ceiling) |

Granted permissions and autonomy can be lower than the type allows, never higher.

## 6. The collection view

The main way people see cards: every agent across every app, as a grid of cards, like a binder
of sports cards.

- **Card front in the grid:** icon, name, app, type badge, status, purpose, the overall score
  and band (or "unrated"), the eight ratings as a compact block, and the three headline stats.
- **Flip or open for the back:** the full spec in the fixed order of section 2.
- **Group by** app (each app is a "set"), type, or status. **Filter** by app, type, status,
  autonomy, model, skill, tool. **Sort** by overall, a single rating, cost or last run.
- **Same look for every card** regardless of the app or framework the agent comes from; the type
  sets the badge colour and the band sets the score colour.
- **Compare:** pick two to four cards to see them side by side, field by field.
- **Gaps are visible:** an agent with missing fields, stale ratings or a broken status shows
  that on the front, not hidden on the back.

Cards come from `*.roster.yaml` files, or are generated from an agent's own definition (a Claude
Code subagent file, an A2A Agent Card) with the gaps marked `none` until someone fills them.

## 7. The org chart

Cards together describe an organisation of agents. The org chart is **derived** from the cards,
not drawn by hand, so it stays true when agents change.

- **Top:** the owner (a person or organisation, from `provenance.author` or the collection's
  owner).
- **Next level:** apps, like departments (`app`). Inside an app, optional `org.group` sub-teams.
- **Reporting lines:** `org.reports_to`. An agent with no `reports_to` reports to its app.
  Orchestrators usually sit above the agents they hand work to.
- **Dotted lines:** `handoffs` that cross the reporting line or cross apps (for example a
  researcher in one app that feeds an orchestrator in another).
- **Shown on each box:** the card front in miniature (icon, name, type badge, status, overall).
- **Checks the chart makes visible:** agents nobody reports to or hands work to (orphans), cycles
  in `reports_to`, operators with no gatekeeper above or beside them, and handoffs to agents that
  are Broken or Retired.

## 8. Drafting an agent

Because every card has the same fields, an orchestrator (or a person) can pick the best agent
for a job from the collection.

1. **Need:** type, required skills and tools, the permission and autonomy needed, data
   sensitivity, budget, minimum ratings, and optional weight shifts (±10 per rating).
2. **Filter out** any card that is not Active (New only at L0–L1 with a gatekeeper involved),
   doesn't match the type, lacks a skill or tool, lacks the permission or data clearance, costs
   more than the budget, or misses a minimum with a measured, non-stale rating.
3. **Rank** the rest by `Σ (type weight + shift) × rating`; ties go to lower cost, then agents
   that have worked well together before, then fresher ratings.
4. **Record** the pick, the runner-up, the reason and what was filtered out.

**Team rules** for a task with several agents: an operator, or any agent at L3, needs a
gatekeeper; a work product gets a reviewer unless the need says why not; total cost stays within
the task budget; no agent reviews or approves its own work.

```yaml
need:
  task: "Fix the failing login test and open a PR"
  type: builder
  skills: [python, pytest]
  tools: [git, shell]
  permission: workspace-write
  autonomy: L2
  data: internal
  budget: 0.50
  minimums: {ACC: 80, DISC: 75}
pick:
  card: login-fixer@2026.2
  score: 86.4
  runner_up: generalist-builder@2026.1 (82.1)
  why: "Only eligible card with pytest; CON 88 vs 79"
  filtered: {ui-specialist: "type", py-new: "New needs a gatekeeper"}
```

## 9. Portability and extensions

The card is meant to stand on its own as a standard, separate from any one app, runtime or
vendor.

**Portable**
- **Plain files.** A card is one YAML or JSON file; both are the same data. A **card bundle** is
  a folder: `roster.yaml` plus optional `icon.png`, `instructions.md` and referenced skill folders,
  so a card can be copied, zipped, shared or published.
- **Published schema.** A JSON Schema per standard version (`roster: 0.1`) so any tool can validate
  a card.
- **Runtime-neutral core.** Core fields describe the agent, not a framework. Runtime details go in
  `runtime` and in extensions.
- **Adapters, both ways.** Import from and export to A2A Agent Cards, Claude Code subagent files,
  Agent Skills, CrewAI, Oracle Agent Spec and OASF records (mapping in section 10). Import never
  invents values: anything the source doesn't have stays `none`.
- **Identity travels.** `id` plus `provenance.author` identifies a card wherever it goes; an
  optional signature (as in A2A `signatures`) shows it wasn't changed.

**Extensible**
- **Core is fixed per version.** New core fields only arrive with a new standard version.
- **Extensions are namespaced.** Anything else goes under `extensions`, keyed by a URI or a
  reverse-domain name, each with its own version:

  ```yaml
  extensions:
    org.example.opshub/v1:             # example namespace
      inventory_app: billing-service
      health_url: http://127.0.0.1:8003/health
    io.example.finance/v2:
      max_trade_usd: 0
  ```

- **Unknown extensions are kept, not dropped.** A tool that doesn't understand an extension
  ignores it and must preserve it when it rewrites the card.
- **Profiles.** A profile is a named set of extensions and extra required fields for one
  setting (for example a "claude-code" profile that requires `tools`, `engine` and
  `guardrails.permission` to map to `permissionMode`). Cards declare the profiles they meet.
- **Custom types and ratings.** The nine types and eight ratings are the shared core. Extra types
  or ratings live in extensions and never change the overall score.

**Versioning:** the standard uses semantic versions. Minor versions only add optional fields;
major versions may change the core. A card states the version it follows in `roster:`.

## 10. Mappings to existing standards

| Card field | A2A Agent Card | Agent Skills | Claude Code subagent | CrewAI | OASF |
|---|---|---|---|---|---|
| `id`, `name` | `name` | — | `name` | — | record name |
| `purpose` | `description` | — | `description` | `goal` (partly) | description |
| `version` | `version` | `metadata.version` | — | — | version |
| `app` | `provider.organization` | `metadata.author` | — | — | authors |
| `role`, `goals` | — | — | body of the file | `role`, `goal` | — |
| `persona` | — | — | body of the file | `backstory` | — |
| `instructions` | — | — | body of the file | — | — |
| `skills` | `skills[]` (`id`, `name`, `description`, `tags`) | skill `name` | `skills` | — | skills taxonomy |
| `tools` | — | `allowed-tools` | `tools`, `disallowedTools`, `mcpServers` | `tools` | modules |
| `engine` | — | — | `model`, `effort` | `llm` | — |
| `memory` | — | — | `memory` | `memory` | — |
| `guardrails` | `securitySchemes`, `securityRequirements` | — | `permissionMode`, `hooks`, `maxTurns`, `isolation` | `max_iter`, `allow_delegation` | — |
| `io` | `defaultInputModes`, `defaultOutputModes` | — | — | — | — |
| `icon` | `iconUrl` | — | `color` (partly) | — | — |
| `provenance` | `signatures` | `license` | — | — | signature |
| `type`, `ratings`, `stats`, `status`, `autonomy`, `handoffs`, `org`, `source` | not covered (could ride in an A2A extension) | not covered | not covered | not covered | not covered |

The last row is what this standard adds. Everything else maps to a field that already exists.

## 11. File format

One YAML file per card: `<id>.roster.yaml`. Rendered views (collection grid, org chart, terminal card,
A2A Agent Card, Claude Code subagent file) are generated from it. Examples: [`examples/`](../examples/).

```yaml
roster: 0.1                   # standard version
id: example-agent
name: Example Agent
app: none
type: builder                 # orchestrator assistant researcher builder specialist reviewer gatekeeper operator monitor
secondary: none
purpose: none
engine: {model: none, effort: none}
runtime: none
autonomy: L1
status: New
version: 2026.1
icon: none
ratings:                      # each: unrated | ~estimate | {value, test, date, tasks, tries}
  ACC: unrated
  CON: unrated
  TOOL: unrated
  PLAN: unrated
  DISC: unrated
  COMM: unrated
  SPD: unrated
  EFF: unrated
  overall: unrated
headline_stats: [runs, accepted_rate, cost_per_run]
role: none
goals: []
persona: none
instructions: none            # inline text or a path
skills: []                    # [{name, tag}]
tools: {allow: [], deny: [], mcp: []}
context: []
memory: {scope: none, where: none, retention: none}
guardrails:
  permission: read-only       # read-only | comment | workspace-write | approve | notify | act-external
  needs_approval: []
  forbidden: []
  data: public                # public | internal | confidential | secret
  limits: {turns: none, minutes: none, usd: none}
io: {in: [text], out: [text], report: none}
handoffs: {from: [], to: []}
org: {reports_to: none, group: none}
stats: {runs: 0, accepted: 0, reworked: 0, handoffs: 0, blocked: 0, caught: none, median_time: none, cost_per_run: none, last_run: none}
source: none
provenance: {author: none, created: none, changed: none, license: none, signature: none}
profiles: []
extensions: {}
```
