# AgentRoster card standard — v0.2 (draft)

> **Name:** AgentRoster, chosen so it can't be confused with A2A's "Agent
> Card". One card in this standard is a **roster card**; a set of them is a **roster**.

**Status:** draft for discussion · **Date:** 2026-11-04 · **Project:** [AgentRoster](../README.md)
· **Replaces:** [v0.1](roster-card-standard-v0.1.md) (kept for history)

One standard way to describe any agent or workflow, in any app, so that every one can be listed,
compared and displayed the same way: as a card in a collection, like sports cards. Every card has
the same fields. A field that doesn't apply is written as `null` (or `[]` for a list), never
left out, so cards line up side by side.

Where an existing standard already defines something (skills, tools, discovery, runtime
settings), the card **references or compiles to** it instead of inventing a new shape.

Contents: 1 Agent types · 2 The card (fields) · 3 Ratings and definition score · 4 Usage stats ·
5 Status, versions and autonomy · 6 The collection view · 7 The org chart · 8 Drafting an agent · 9 Portability and
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

Types apply to both kinds of card (`agent` and `workflow`, section 2), and so does the permission
ceiling.

**Separation of duties:** a reviewer or gatekeeper never reviews or approves output from its own
card.

## 2. The card (fields)

**Empty values.** Every field is always present. A scalar with no value is `null`. A list with
no items is `[]`. An object field is always an object with all its keys present, except `stats`
and `definition`, which are `null` or a full object. The text "none" is never an empty value.
The one exception is `memory.scope`, where `"none"` is a real value meaning "remembers nothing"
(different from `null`, which means "not known").

**Kinds.** `kind` is `agent` or `workflow`:
- an **agent** lets the model decide its next step or tool;
- a **workflow** runs model calls along paths fixed in code.

`type` (section 1) and its permission ceiling apply to both.

**Fixed field order.** Spec, examples and reports all use this order:

`roster, id, name, kind, app, type, secondary, status, purpose, engine, runtime, autonomy,
version, icon, definition, ratings, headline_stats, role, goals, persona, instructions, skills,
tools, context, memory, guardrails, io, handoffs, org, stats, source, evidence, provenance,
profiles, extensions`

The order is a writing rule for people and tools that write cards. Validation does not check it.

### Front: what you see in the collection

| Field | Meaning | Example |
|---|---|---|
| `id` | Stable, unique, kebab-case | `fleet-scout` |
| `name` | Display name | Fleet Scout |
| `kind` | `agent` or `workflow` (see above) | `agent` |
| `app` | The app it belongs to (the "team" on the card) | Ops Hub |
| `type` | Agent type code (section 1), plus optional `secondary` | `researcher` |
| `purpose` | One sentence: what it is for | Answers "what's running and what's wrong" from the ops hub's data |
| `engine` | Model and effort | `claude-haiku-5-5`, effort low |
| `runtime` | Where and how it runs | Claude Code subagent; Python service; Agent SDK; scheduled job |
| `autonomy` | L0–L3 (section 5), or `null` (not known) | L3 |
| `status` | `active`, `new`, `broken`, `retired`, `external`, or `null` (not known) | `active` |
| `definition` | Definition score 1–5 with confidence, set by an assessment (section 3b) | Definition 4/5 |
| `ratings` | Eight ratings, 0–99, plus overall (section 3) | ACC 88 · CON 81 … OVR 84 |
| `headline_stats` | Three stat names to show from real use (section 4) | 412 runs · 96% accepted · $0.04/run |
| `version` | Card version, a string `YYYY.N` (section 5) | `"2026.2"` |
| `icon` | Image path or emoji for the card, or `null` | 🔭 |

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
| `memory` | Whether it remembers between runs, scope (`none`, `run`, `project`, `local`, `user`), where, retention | Runtime memory settings |
| `guardrails` | Permission granted (≤ the type ceiling); actions needing approval; forbidden actions; data it may see; limits (turns, time, spend) | OWASP least agency |
| `io` | Input and output modes and the shape of its final report | A2A input/output modes |
| `handoffs` | Agents, types or people it takes work from and passes work to (section 7) | — |
| `org` | Where it sits in the org chart: `reports_to` (a card ID, or `null` for the app), `group` (team or department inside the app) | Section 7 |
| `stats` | Usage stats (section 4); `null` until a runtime fills them | Logged by the runtime |
| `source` | Where the definition lives: `{files: [{path, line}], found_by}`, so the card can be checked against it. `found_by` is `script`, `agent` or `hand` | — |
| `evidence` | Proof for filled fields, keyed by field path (for example `"guardrails.permission"`). Each entry is a list of `{file, line, quote, found_by}`; `found_by` is `script`, `agent` or `hand` | — |
| `provenance` | Author, created, last changed, licence, signature (each can be `null`) | A2A `signatures` |
| `profiles` | Names of the profiles the card meets (section 9) | — |
| `extensions` | Extra fields under a namespace, never mixed into the core (section 9) | A2A `AgentExtension` idea |

## 3. Ratings and definition score

### 3a. Ratings

Eight ratings, always the same eight, on a 0–99 scale. **No evidence, no number:** each rating
names the test it came from, the date, and how many tasks and tries. A rating without evidence is
`unrated`. A self-reported estimate may be shown with a `~` (for example `~75`) and is never used
to meet a minimum when drafting. A measured rating is an object
`{value, test, date, tasks, tries}`; `overall` is `unrated` or an integer 0–99.

| Code | Rating | What it measures | How |
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

#### Overall (weighted by type)

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

### 3b. Definition score

The **definition score** says how well a card is specified to do its job. It is a different
thing from the ratings: ratings (0–99) say how an agent tested, and stay `unrated` until tests
exist. The definition score (1–5) can be set from the definition alone. The card shows it as
"Definition 4/5", never as a bare number, so it is not confused with a 0–99 rating.

It is **set by an assessment, never by hand**. The card field `definition` is `null` or:

```json
{
  "score": 4,
  "confidence": "medium",
  "areas": {"completeness": 4, "depth": 4, "fit": 5, "least_agency": 3},
  "run": "assessment-run-id",
  "packs": ["assess-definition@0.1"]
}
```

- `score`: integer 1–5. The word is not stored; it comes from the table below when shown.
- `confidence`: `high`, `medium` or `low`.
- `areas`: the four areas the score is built from, each 1–5, or `null` if that area was not
  assessed.
- `run`: the ID of the assessment run that set it.
- `packs`: the assessment packs used, each as `name@version`.

| Score | Word | What it looks like |
|---|---|---|
| 1 | Undefined | You can't tell what it is for or what it may do; most core fields are missing |
| 2 | Sketched | A purpose exists, but guardrails, context or tool limits are missing or vague |
| 3 | Defined | Every core field is present, but some are thin ("be careful", no limits); use with supervision |
| 4 | Ready | Every field is specific: forbidden actions and limits named, tools match the purpose, context files exist, there is a stopping rule; no high or critical findings |
| 5 | Exemplary | Ready, and it also covers the hard cases: untrusted input, clear handoffs, checks on output; ratings measured, not guessed |

**Confidence** says how far to trust the score: `high` when coverage is complete and most
findings were decided by rules; `medium` when some areas rest on judgement alone; `low` when parts
of the definition were not found or judgement tries disagreed. The card shows it as
"Definition 3/5 · medium confidence".

## 4. Usage stats

Counted from real use, not tests. Ratings say how it tested; stats say how it works in practice.

The whole `stats` section is `null` or a full object. Only a runtime fills it, and it states
where the numbers came from (`source`) and the date they cover up to (`as_of`). A scan never
fills it. The card front shows stats only when they are present.

| Stat | Meaning |
|---|---|
| `runs` | Times it was invoked |
| `accepted` | Runs whose output was accepted without rework |
| `reworked` | Runs whose output was redone or reverted |
| `handoffs` | Handoffs it made that led to accepted work |
| `blocked` | Guardrail violations and blocked actions, each logged with the rule |
| `caught` | Reviewers and gatekeepers: real problems caught ÷ real problems that reached them |
| `median_time` | Median time per run, as a number of seconds |
| `cost_per_run` | Mean cost per run |
| `last_run` | When it last ran |
| `source` | Where the numbers come from (for example the name of the runtime or log) |
| `as_of` | The date the numbers were counted |

**Accepted rate** is `accepted ÷ runs`. It is worked out when shown and never stored.

The card front shows three of them (`headline_stats`, a list of three stat names); by default
`runs`, `accepted_rate` and `cost_per_run`. A **drift flag** shows when the last 20 runs disagree with the ratings (for example the
accepted rate falling while `ACC` is high).

## 5. Status, versions and autonomy

| Status | Meaning |
|---|---|
| `active` | In use and healthy |
| `new` | Fewer than six ratings measured; use with supervision |
| `broken` | A tool, credential, MCP server or model it needs is failing or revoked |
| `retired` | Replaced by another card; kept for its history |
| `external` | An agent from outside your apps, found through its A2A Agent Card; untrusted until reviewed |

**Versions.** Both `roster` and `version` are strings (`"0.2"`, `"2026.1"`), because as numbers
`2026.10` would read as `2026.1`. Changing the model, instructions, tools, skills or guardrails makes a new card
version (pattern `YYYY.N`). The previous version's ratings stay on the card marked **stale** until the
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

- **Card front in the grid:** icon, name, kind, app, type badge, status, purpose, the definition
  score and confidence (for example "Definition 4/5"), and the top gaps. When present, also the
  ratings (overall score and band, the eight ratings as a compact block) and the headline stats.
- **Flip or open for the back:** the full spec in the fixed order of section 2.
- **Group by** app (each app is a "set"), type, or status. **Filter** by app, kind, type, status,
  autonomy, model, skill, tool. **Sort** by overall, a single rating, cost or last run.
- **Same look for every card** regardless of the app or framework the agent comes from; the type
  sets the badge colour and the band sets the score colour.
- **Compare:** pick two to four cards to see them side by side, field by field.
- **Gaps are visible:** an agent with missing fields, stale ratings or a broken status shows
  that on the front, not hidden on the back.

Cards come from `*.roster.json` files, or are generated from an agent's own definition (a Claude
Code subagent file, an A2A Agent Card) with the gaps left `null` or `[]` until someone fills them.

## 7. The org chart

Cards together describe an organisation of agents. The org chart is **derived** from the cards,
not drawn by hand, so it stays true when agents change.

- **Top:** the owner (a person or organisation, from `provenance.author` or the collection's
  owner).
- **Next level:** apps, like departments (`app`). Inside an app, optional `org.group` sub-teams.
- **Reporting lines:** `org.reports_to` is a card ID, or `null`, which means the card reports to
  its app. Orchestrators usually sit above the agents they hand work to.
- **Dotted lines:** `handoffs` that cross the reporting line (for example a researcher that
  feeds an orchestrator it does not report to).
- **Links stay within one roster.** Each handoff in `from` and `to` is exactly one of
  `{"card": "<id>"}` (a specific card), `{"type": "<type>"}` (any card of that type) or
  `{"person": "<role>"}` (a person, by role). Links across rosters are not part of v0.2.
- **Shown on each box:** the card front in miniature (icon, name, type badge, status, overall).
- **Checks the chart makes visible:** agents nobody reports to or hands work to (orphans), cycles
  in `reports_to`, operators with no gatekeeper above or beside them, and handoffs to agents that
  are `broken` or `retired`.

## 8. Drafting an agent

Because every card has the same fields, an orchestrator (or a person) can pick the best agent
for a job from the collection.

1. **Need:** type, required skills and tools, the permission and autonomy needed, data
   sensitivity, budget, minimum ratings, and optional weight shifts (±10 per rating).
2. **Filter out** any card that is not `active` (`new` only at L0–L1 with a gatekeeper involved),
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
  filtered: {ui-specialist: "type", py-new: "new needs a gatekeeper"}
```

## 9. Portability and extensions

The card is meant to stand on its own as a standard, separate from any one app, runtime or
vendor.

**Portable**
- **Plain files.** A card is one JSON file. YAML may return later as a second way to write the
  same data. A **card bundle** is a folder: `<id>.roster.json` plus optional `icon.png`, `instructions.md` and referenced skill folders,
  so a card can be copied, zipped, shared or published.
- **Published schema.** A JSON Schema per standard version (`"roster": "0.2"`) so any tool can validate
  a card.
- **Runtime-neutral core.** Core fields describe the agent, not a framework. Runtime details go in
  `runtime` and in extensions.
- **Adapters, both ways.** Import from and export to A2A Agent Cards, Claude Code subagent files,
  Agent Skills, CrewAI, Oracle Agent Spec and OASF records (mapping in section 10). Import never
  invents values: anything the source doesn't have stays `null` or `[]`.
- **Identity travels.** `id` plus `provenance.author` identifies a card wherever it goes; an
  optional signature (as in A2A `signatures`) shows it wasn't changed.

**Extensible**
- **Core is fixed per version.** New core fields only arrive with a new standard version.
- **Extensions are namespaced.** Anything else goes under `extensions`, keyed by a URI or a
  reverse-domain name, each with its own version:

  ```json
  "extensions": {
    "org.example.opshub/v1": {
      "inventory_app": "billing-service",
      "health_url": "https://ops.example.com/health"
    },
    "io.example.finance/v2": {
      "max_trade_usd": 0
    }
  }
  ```

- **Unknown extensions are kept, not dropped.** A tool that doesn't understand an extension
  ignores it and must preserve it when it rewrites the card.
- **Profiles.** A profile is a named set of extensions and extra required fields for one
  setting (for example a "claude-code" profile that requires `tools`, `engine` and
  `guardrails.permission` to map to `permissionMode`). Cards declare the profiles they meet.
- **Custom types and ratings.** The nine types and eight ratings are the shared core. A custom
  type lives in an extension, and the card's `type` names the closest core type. Tools must keep
  cards with types they don't know. Extra ratings live in extensions and never change the overall
  score.

**Versioning:** the standard uses semantic versions. Minor versions only add optional fields;
major versions may change the core. A card states the version it follows in `roster`.

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
| `kind`, `type`, `definition`, `ratings`, `stats`, `status`, `autonomy`, `handoffs`, `org`, `source`, `evidence` | not covered (could ride in an A2A extension) | not covered | not covered | not covered | not covered |

The last row is what this standard adds. Everything else maps to a field that already exists.

## 11. File format

One JSON file per card: `<id>.roster.json`. Rendered views (collection grid, org chart, terminal
card, A2A Agent Card, Claude Code subagent file) are generated from it. Examples:
[`examples/`](../examples/).

The template below has every field in the fixed order (section 2), with `null` and `[]` for
empty values. `stats` and `definition` are `null` until a runtime or an assessment fills them.
`roster.json` holds a JSON array of cards; its format is defined in a later version, and `validate-card` checks single card files.

```json
{
  "roster": "0.2",
  "id": "example-agent",
  "name": "Example Agent",
  "kind": "agent",
  "app": null,
  "type": "builder",
  "secondary": null,
  "status": "new",
  "purpose": null,
  "engine": {"model": null, "effort": null},
  "runtime": null,
  "autonomy": null,
  "version": "2026.1",
  "icon": null,
  "definition": null,
  "ratings": {
    "ACC": "unrated",
    "CON": "unrated",
    "TOOL": "unrated",
    "PLAN": "unrated",
    "DISC": "unrated",
    "COMM": "unrated",
    "SPD": "unrated",
    "EFF": "unrated",
    "overall": "unrated"
  },
  "headline_stats": ["runs", "accepted_rate", "cost_per_run"],
  "role": null,
  "goals": [],
  "persona": null,
  "instructions": null,
  "skills": [],
  "tools": {"allow": [], "deny": [], "mcp": []},
  "context": [],
  "memory": {"scope": null, "where": null, "retention": null},
  "guardrails": {
    "permission": null,
    "needs_approval": [],
    "forbidden": [],
    "data": null,
    "limits": {"turns": null, "minutes": null, "usd": null}
  },
  "io": {"in": [], "out": [], "report": null},
  "handoffs": {"from": [], "to": []},
  "org": {"reports_to": null, "group": null},
  "stats": null,
  "source": {"files": [], "found_by": "hand"},
  "evidence": {},
  "provenance": {"author": null, "created": null, "changed": null, "license": null, "signature": null},
  "profiles": [],
  "extensions": {}
}
```

**Allowed values**

| Field | Values |
|---|---|
| `kind` | `agent`, `workflow` |
| `type`, `secondary` | `orchestrator`, `assistant`, `researcher`, `builder`, `specialist`, `reviewer`, `gatekeeper`, `operator`, `monitor` (`secondary` can be `null`) |
| `status` | `active`, `new`, `broken`, `retired`, `external`, or `null` (not known) |
| `autonomy` | `L0`, `L1`, `L2`, `L3`, or `null` (not known) |
| `ratings.*` | `unrated`, `"~NN"` (an estimate), or `{value, test, date, tasks, tries}`; `overall` is `unrated` or an integer 0–99 |
| `memory.scope` | `none` (remembers nothing), `run`, `project`, `local`, `user`, or `null` (not known) |
| `guardrails.permission` | `read-only`, `comment`, `workspace-write`, `approve`, `notify`, `act-external`, or `null` (not known) |
| `guardrails.data` | `public`, `internal`, `confidential`, `secret`, or `null` (not known) |
| `definition.confidence` | `high`, `medium`, `low` |
| `source.found_by`, `evidence[].found_by` | `script`, `agent`, `hand` |
| `version` | A string matching `YYYY.N`, for example `"2026.1"` |
