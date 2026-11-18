# Cards: one roster card per agent and workflow

This file is the method for the cards phase. Read `SKILL.md` first; it says when to come here.
The map is done: `map.md` and `coverage.json` are in the run folder and passed their checks.

You write `roster.json`, a roster file (format 0.1, `schema/roster-file-0.1.schema.json` in this
skill folder) that holds one standard v0.2 card per agent and workflow
(`schema/roster-card-0.2.schema.json`). Then the scripts
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
  `type` is a judgement: read the nine types in `references/types.md` (in this skill folder) and
  choose by the job, not by the name the agent gives itself, and quote
  the line that decided it under `evidence.type`. When two types fit, pick by the job and note the
  other in `map.md` under that agent.
- **Ids** come from the map; the order for choosing them is in `MAP.md`.
- **`name`** is the agent's name as the code or its prompt gives it (or the id in words), with
  evidence like any value: the line it came from (a `name` field, the variable, the prompt's role).
- **`runtime` (where and how it runs)** is one line: framework or SDK and language, where it
  sits, and for a top-level card what starts it. Evidence: the import or build line, and the
  start line. The card-view `runtime_name` is only the short name; fill both.
  Example: `graph.add_node("scout", scout.run)` in a LangGraph app gives `"Node in the
  daily_advisor LangGraph graph (Python)"`; `runtime_name` is `"LangGraph"`.
- **`purpose` (the card's sub-line)** is one sentence on what it is for, starting with a verb
  ("Finds new items worth reading…"). Write it from every line that states the agent's job: a
  declared description (frontmatter `description:`, a `description=` argument, an A2A card), a
  docstring or header comment, a role card, the prompt's role sentence or goal. A declared
  description leads; the others may add to it. Evidence lists every line you drew on. A goal
  copied word for word is not a purpose: it goes in `goals`. When nothing states the job, write
  it from what the code does and cite those lines.
- **`goals` (what it aims for)** come only from lines marked as goals: a `Goal:` line in a
  prompt, a framework's `goal=` field, or a `goal:` on a role card. One item per goal, copied as
  written, capital first letter. The prompt's opening job sentence is the purpose, not a goal.
  With no such line, `[]`.
  Example: `goal="Find the help articles that answer the customer's question."` gives
  `["Find the help articles that answer the customer's question."]`; `You are a notes
  assistant. Find what the user wrote…` gives `[]`.
- **`role` (the card's job)** is a few plain lines on what it does and doesn't do; fill it on
  every card. For an agent: what it takes in, what it does (and whether the model picks its own
  tools or steps), what it hands on, and one thing it does not do. For a workflow: its steps in
  order, which steps are plain code, and any checks or loops between steps (a gate and its
  threshold, a retry, a revise loop and its limit). Evidence is the lines that show it: the loop,
  the graph edges, the calls.
- **`io.in` and `io.out` (what it takes and returns)** hold media types, as A2A agent cards do:
  `text/plain`, `application/json`, `text/markdown`, `image/png` and so on. `io.in` is what the
  model is given: a user or task message is `text/plain`; images, files or structured data take
  their own type. A schedule or an HTTP trigger alone is not input (it goes with the runtime).
  `io.out` is how the reply is used: parsed as JSON, or a prompt that says "Return JSON", is
  `application/json`; files the agent writes take the files' type (`text/x-python`,
  `text/markdown`); plain prose is `text/plain`. Evidence is the line that builds the message and
  the line that parses or uses the reply.
- **`io.report` (the shape of its final output)** comes from a line that states it: a format in
  the prompt or role card (even inside the task sentence), a CrewAI `expected_output`, or for a
  top-level workflow the line that returns or prints its result. A goal line is not a format
  ("Goal: give a short answer" stays in `goals`). Without such a line, `null`.
  Example: `system: "Summarize the text in three short bullet points."` gives `"Three short
  bullet points."`; `return {"run_id": …, "ranking": …}` gives `"JSON with run_id and ranking"`.
- **`context` (what it loads at start)** lists files put into the model's context before it
  begins: instruction files (`CLAUDE.md`, `AGENTS.md`) or a document read into the prompt. Data
  a tool reads during the run is not context; the tool shows it. The prompt itself is
  `instructions`.
  Example: a Claude Code subagent gives `["CLAUDE.md"]`; `notes =
  json.loads(Path("notes.json").read_text())` inside a search tool gives nothing.
- **`source.files` (where it is defined)** lists, in this order: the line where it is built (the
  constructor, the `StateGraph(...)` or `Agent(...)` call, not a later `compile`); its own prompt
  or definition file, as a whole file (`line: null`); and for a top-level card, each file that
  starts it (an entry point, an HTTP endpoint, a schedule, or a command in a package file such as
  a `package.json` script or a `pyproject.toml` `[project.scripts]` line), at the line that
  starts it. Every file in the card-view extension's `starts` evidence is in `source.files` (the check
  enforces it). Leave out shared files several agents use (a shared skill file, a common helper,
  config); they belong to their own field (`skills`, `context`) with evidence there.
- **What you could not see stays empty.** A field whose value lives outside the code (a prompt in a
  database, a model left to an SDK's default) is `null` on the card and has an unknown in
  `coverage.json` (`card`, `field`, `reason`, `detail`, `evidence`). Cite the line where the value
  would be set. For a list, keep the items the code does show and add the unknown to say the list
  may be incomplete (for example an MCP server whose tools live in a package).
- **A stated limit is not a limit.** A limit written in a prompt ("keep it under 5 steps") but not
  enforced by code is never put in `guardrails.limits`. Record where it is stated in the role or
  details, and list the field it would fill under the card-view extension's `stated_only` (below).
- **`guardrails.forbidden` holds what it is told never to do:** each action the prompt, a role
  card or config bans ("never", "do not", "must not"), one item per ban, written as the bare
  action in lower case without the "never" ("Never edit files." gives `"edit files"`). Evidence
  is the line that states it. An "only do X" instruction is not a ban; it goes in `role` or
  `goals`. Bans are forbidden actions, not limits, so `guardrails.forbidden` is never in
  `stated_only`. When the code also blocks the action (a tool left off the list), keep the
  prompt line as evidence; the tools show on the card.
- **Permission comes only from a declared setting:** a permission mode (Claude Code's
  `permissionMode`, the Agent SDK's `permission_mode`) or a hand card's value. A list of tools is
  `tools.allow` / `tools.deny`, never permission.
- **`memory.scope` is `"none"` only from a declared setting** that turns memory off (CrewAI's
  `memory=False`, a stateless option, a hand card's `"scope": "none"`), with that line as
  evidence. When the project has no memory code at all, the scope stays `null`: the card says it
  is not known, since nothing in the code says so.
- **The general rules in `MAP.md` section 4 apply to every card**, for example: saving output is
  not memory; a trigger is not input; a handoff is recorded only where one carded step passes work
  straight to another; a run-wide budget belongs to the workflow and a limit inside one agent's
  loop belongs to that agent; the main prompt is `instructions` and a shared skill file appended
  to it is a skill; `io.report` comes only from a line that states the output (above); `instructions` is a path when the prompt lives in a file and the text when
  it lives in code; a check the pipeline runs between steps belongs to the pipeline's card.
- **Do not fill** `ratings` (all `"unrated"`), `definition` (`null`), `stats` (`null`),
  `headline_stats` (`[]`) or `status` (`null`). The assessment sets them later.

## 3. Hand-written cards win

A developer may keep `<id>.roster.json` beside an agent.

- **Its values replace scanned ones.** Use them as written, with the hand card as the first
  evidence item (`found_by: "hand"`). When the code shows the same field, add the code evidence
  after it.
- **Every field it sets wins, `source.files` included:** use its list as written, even when the
  recipe in section 2 would give another. The hand card file itself shows through evidence, not
  in `source.files`, since the agent never loads it.
  Example: a hand card with `"files": [{"path": "filer.py", "line": null}]` gives exactly that
  list, not `filer.py:38` plus `filer.roster.json`.
- **Fields it leaves empty are filled from the code**, with code evidence.
- **When it disagrees with the code** (for example `permission: read-only` while a tool writes
  files), keep the hand value, add the code evidence beside it, and leave the gap for the
  assessment to report. Never "fix" a hand card.
- **Stored answers** (`agentroster.json` at the project root, the user's answers to step 6 of
  `SKILL.md`) apply like hand-card values: the `type` as written, with the answer's `"value"`
  line as the first evidence (`found_by: "hand"`), then the code evidence. A hand card wins
  over an answer. List them in `map.md` under "Needs checking" as `### Stored answers` (applied,
  stale per `check-cards.mjs`'s `note:` lines, or overridden by a hand card), and the types
  still to ask about as `### To confirm`.
  Example: line 6 `"value": "researcher",` gives `evidence.type[0]` = `{"file":
  "agentroster.json", "line": 6, "quote": "\"value\": \"researcher\",", "found_by": "hand"}`.
- **A hand card with no matching code** keeps its id and card; its candidate in `coverage.json` has
  `validation.status: "needs-checking"`.
- **A file name that doesn't match its `id`** (`a.roster.json` with `"id": "b"`): use the `id`, and
  say so in your final message as a warning.

## 4. The card-view extension

Some things the card shows have no core field: the short runtime name, the language, what starts
a top-level agent or workflow, its steps in flow order, how many of its steps are plain code, and which limits are
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
- `steps` and `plain_steps` are for workflows only: they are its fixed order. An agent chooses
  its own path; what it may do is already on the card (`tools`, `skills`, `handoffs`).
- `steps` lists the ids of the cards that report to this workflow, in the order the code runs them.
- `starts` goes on any top-level card, agent or workflow (one that reports to no other card): what
  starts it from outside, such as a schedule, a command, an HTTP endpoint or a chat. A card that
  reports to another is started by it, so it has no `starts`.
- **`judgement`** says how sure you are of the card's `type`, with the runner-up: `high` when
  one type fits the job and no other is close; `medium` when another fits but yours is better;
  `low` when two fit about equally. `runner_up` is `null` only when `high`; `why` cites the
  deciding line. Leave it out when a hand card or a stored answer set the type. It needs no
  `evidence` entry.
  Example: `"judgement": {"type": {"confidence": "medium", "runner_up": "builder", "why": "Its
  output is the reply the customer reads (crew_desk/main.py:13)."}}`.
- `stated_only` lists card field paths (such as `"guardrails.limits.turns"`) whose value is only
  stated in a prompt.
- Evidence for these values goes in the extension's own `evidence` map, one key per field, same
  item shape as the card's evidence. Every filled value here needs it.

## 5. Check, then draw

Run these from the skill folder, in this order, after writing `roster.json`:

```
node <skill>/scripts/validate-card.mjs <run>/roster.json
node <skill>/scripts/check-cards.mjs <run> --project <project>
```

Then follow `VALIDATION.md` (the validator checks each card against the code), then:

```
node <skill>/scripts/redact-check.mjs <run> --project <project>
node <skill>/scripts/render-cards.mjs <run>
```

`check-cards.mjs` checks that the cards, the map and the coverage name the same agents; that every
filled value has evidence; that every evidence key is a real field; that evidence paths are
relative with forward slashes; that a field with an unknown is empty; that a workflow's
`steps` report to it; and, in the project, that each quote is on the line it cites (spaces
collapsed, part of a line is fine). A wrong line is fixed by reading the file again, never by
changing the quote to fit. A failed check is fixed and run again; a run never ends with a known leak or
an invalid file. `render-cards.mjs` writes `cards/<id>.md` and `cards.html` in the run folder.
