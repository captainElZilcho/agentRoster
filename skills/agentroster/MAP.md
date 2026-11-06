# The map

How to find every agent and workflow in the project, decide what counts as one, and write
`map.md` and `coverage.json`. `SKILL.md` has the setup and the rules for the whole run; they all
apply here (read only, never fetch, never open secret files, never copy a secret).

The test of a good map: no agent that is clearly there is missed, and the inventory is right. One
agent is not split in two, two are not merged, plain code gets no card, and no agent is called a
workflow or the reverse.

## 1. Load the reference notes

Read `ecosystems/generic.md` always. Then read the note for each ecosystem in
`detect.json` `ecosystems`:

| Ecosystem | Note |
|---|---|
| `anthropic-sdk` | `ecosystems/anthropic-sdk.md` |
| `openai-sdk` | `ecosystems/openai-sdk.md` |
| `claude-agent-sdk` | `ecosystems/claude-agent-sdk.md` |
| `langgraph` (LangGraph and LangChain) | `ecosystems/langgraph.md` |
| `crewai` | `ecosystems/crewai.md` |
| `claude-code` (subagents and skills) | `ecosystems/claude-code.md` |
| `mcp` | `ecosystems/mcp.md` |
| `roster` (hand-written `*.roster.json` cards) | section 6 below |

If your own search finds one of these ecosystems that the script missed, load its note too.

## 2. The method

1. **Read every script candidate** in `detect.json` and the code around it: the whole function,
   the code that calls it, and the files it loads.
2. **Search for what text search can't see.** Do this in every mode, over the same files the
   script reads: skip git-ignored files, dependencies, build output and the run folder. Look
   for:
   - model calls over plain HTTP, and SDKs or frameworks not on the list (`generic.md`);
   - homemade wrappers around a model client, and every place that calls them;
   - model names in config files, and env variable names that pick a model or provider;
   - prompts built from several files or strings, and prompt or role files the code loads;
   - imports the script can't see (several modules on one line, imports inside functions,
     dynamic imports, other languages).
   Each new place is a candidate with `found_by: "agent"`.
3. **Follow the prompts** into the files the code loads, and make each loaded prompt file a
   candidate. A prompt from a database, a URL or an env variable is an unknown ("loaded from
   X"). Never fetch it.
4. **Decide the inventory** with the identity rule (section 3) and give each agent and workflow
   an id.
5. **Record what each one uses**, each with file and line: model, tools, prompts, skills, data it
   reads, trigger, whom it reports to, and how work flows between them.
6. **Anything you can't settle is needs checking.** Never drop it, never guess.
7. **Never open secret files.** If a secret-looking value turns up in a file you read, cite the
   file and line only.

## 3. What counts as one agent (the identity rule)

- **One card per model step with its own job:** its own prompt or role, and its own place in the
  flow.
- **The same agent called from several places is still one card.** Same prompt, same job, many
  call sites: one card, every call site as evidence.
- **A shared client or wrapper is never an agent.** The agents that call through it are.
- **A pipeline that runs several model steps along fixed paths gets its own `workflow` card,**
  and its steps report to it.
- **Plain code never gets a card,** even when it makes decisions (rules, routing tables, retries,
  parsing).

**Agent or workflow.** An agent lets the model choose its next step or tool: a tool loop, a model
that picks which helper runs next, a model that decides when it is done. A workflow runs model
calls along paths the code fixes: a chain, a fixed graph, a branch the code takes on the model's
answer. Quote the line that decided it (the tool loop's check, the edge list, the fixed call
order). A single model call that the code runs at a fixed point (no tool loop, the model picks
nothing) is kind `workflow`. It gets its own card when it has its own job, and that card reports
to the pipeline's workflow card when a pipeline runs it.

**Ids.** Lower case, words joined by hyphens, from the name the code or its prompt uses (a class,
function, file, `name` field or the role in the prompt), for example `ticket-triage`. Each id is
used once. If the previous run has the same agent, reuse its id. A hand card's id wins. The cards
phase keeps these ids.

## 4. General rules

These hold for any project.

- **A definition file that no code loads is not part of an agent.** It is a candidate with
  outcome `no-agent` (note: "no code loads this file").
- **Prose is never a candidate.** README files, docs and comments that mention a model or an
  agent are not candidates.
- **An SDK imported but never called** is a candidate with outcome `no-agent` (note: "imports the
  SDK but never calls it").
- **A shared client's provider lines** link only to the agents routed to that provider, when
  config or code makes the route clear. Otherwise they link to every agent that uses the client.
- **A trigger is not input.** A schedule, a webhook or an HTTP route that starts an agent belongs
  with how it runs, not with what it reads.
- **A handoff** is recorded only where one carded step passes work straight to another. Any plain
  code in between breaks the link.
- **Saving output is not memory.** Memory needs the agent to read its past runs back.
- **A run-wide budget belongs to the workflow.** A limit inside one agent's loop belongs to that
  agent.
- **A limit stated but not enforced in code** ("keep it under 5 steps" in a prompt) is recorded
  as stated, never as a limit.
- **Permission comes only from a declared setting** (a permission mode, an allow or deny list),
  never from what the tools happen to do.
- **The job decides the type,** not the agent's name for itself.
- **The main prompt is the agent's instructions.** A shared skill file appended to it is a skill.
- **A hand card's value wins** (section 6).

## 5. Candidates

A candidate is a place that might hold an agent or workflow. Every one is recorded, whether or
not it leads to a card.

- **Line-level or whole-file.** A signal on a line (an import, a call) gives one candidate for
  that line. A signal that is the whole file (a subagent file, a skill file, a prompt file, an
  MCP config, a hand card) gives one candidate with `line: null`. Each `file` and `line` pair
  appears once.
- **Add candidates, never remove the script's.** Every candidate in `detect.json` goes into
  `coverage.json` with its `file`, `line`, `signals` and `detail` unchanged. Drop its
  `ecosystems` field: the coverage format allows no extra fields. Add `status`, `reason`,
  `outcome`, `cards`, `note`, `found_by: "script"` and `validation`. If the script flagged a place that is not an agent, keep it and give it
  outcome `no-agent` with a note saying why. Places you find are added with
  `found_by: "agent"`, a `signals` list (`llm-import`, `llm-call`, `prompt-file`, `other`, …) and
  a short `detail`.
- **Status and outcome:**

| You… | `status` | `outcome` | `cards` | `note` / `reason` |
|---|---|---|---|---|
| read it, and it feeds agents or workflows | `read` | `cards` | their ids | `null` / `null` |
| read it, and it is not an agent | `read` | `no-agent` | `[]` | why / `null` |
| could not read it | `not-read` | `pending` | `[]` | `null` / why |
| read it, but could not tell | `not-understood` | `pending` | `[]` | `null` / why |

- An import line feeds the cards of the agents in that file (or behind that shared client) that
  use it.
- `validation` is `{"status": "validated" | "needs-checking", "rounds": 1–3}`, set by the checking
  loop (`VALIDATION.md`).

## 6. Hand-written roster cards

A `*.roster.json` file is a card someone wrote by hand. Read it (it may hold one card, or a
roster file with several).

- Use its `id` for that agent.
- Its values win over what the code shows. Where the code disagrees, say so in `map.md` under
  that agent, with both places.
- Its evidence comes first (`found_by: "hand"`), with the code evidence alongside.
- A hand card with no matching code still gets its id in the inventory. Its candidate (the
  `*.roster.json` file) has `outcome: "cards"`, `cards: [<its id>]` and
  `validation.status: "needs-checking"`, so the ids in `map.md` and `coverage.json` agree. Say
  "no code found for this card" under "Needs checking".

## 7. Unknowns

An unknown is a part of a definition the scan could not see. Record it as
`{card, field, reason, detail, evidence}`:

- `reason`: `loaded-from-database`, `loaded-from-url`, `loaded-from-env`, `outside-repo`,
  `unparsable`, `unsupported-framework` or `other`;
- `field`: the card field, for example `instructions` or `engine.model`;
- `evidence`: at least one `{file, line, quote, found_by}` pointing at the line that loads it.
  The quote is copied from the file, with any secret replaced by `[redacted]`.

Unknown is not missing. "We could not see it" and "it is not there" are different answers.

## 8. Write `coverage.json`

Format `"coverage": "0.2"` (schema: `schema/coverage-0.2.schema.json` in this folder). Five keys, all present:
`coverage`, `snapshot` (from `SKILL.md` step 1), `summary`, `candidates`, `unknowns`.

- Candidates sorted by `file`, then `line` (`null` first). Unknowns sorted by `card`, then
  `field`. Sort by plain character code, not by locale.
- The summary is counted from the lists: `candidates`, `read`, `not_read`, `not_understood`,
  `cards` (distinct ids), `no_agent`, `needs_checking`, `unknowns`.
- Paths are from the project root, with forward slashes, no leading `/`, no `..`.
- Empty values are `null` or `[]`, never the text "none".

## 9. Write `map.md`

Written for agents first (the cards phase reads it) and easy for people to read. It has exactly
these eight level-2 headings, in this order, and no others:

```
# Map

## Summary

Counts: agents, workflows, candidates (script and agent), no-agent, unknowns, needs checking,
skipped files. Ecosystems detected. The mode, and how the checks ran.

## Inventory

| id | kind | job | decided by |
|---|---|---|---|
| `ticket-triage` | agent | Sorts new tickets by urgency | `src/triage.py:42` loops while the model asks for a tool |
| `nightly-digest` | workflow | Summarises, then ranks, then emails | `jobs/digest.py:10` runs three calls in a fixed order |

## Agents and workflows

### `ticket-triage`

- Model: … (`file:line`)
- Tools: … (`file:line`)
- Prompts: … (`file:line`)
- Skills: …
- Data it reads: …
- Trigger: …
- Reports to: … or nobody

### `nightly-digest`

…

## Flow

How work moves between them, with `file:line`.

## Checked, not an agent

Each `no-agent` candidate and why.

## Unknowns

What couldn't be seen, and why.

## Needs checking

What the checks couldn't settle.

## Skipped

Files not read, counted by reason (from detect.json `skipped`).
```

- The inventory table header starts `| id | kind |`. Each id is in backticks, and kind is
  `agent` or `workflow`.
- Each id in the inventory has one level-3 heading ``### `id` `` under "Agents and workflows".
- The same ids appear in the inventory, under "Agents and workflows" and in `coverage.json`
  `cards`. Every unknown's `card` is in the inventory.
- A section with nothing in it says "None."
- Never paste code or file text beyond a short quote, and never a secret.

## 10. The order of checks

After the checking loop in `VALIDATION.md`, run these from the skill folder, in this order:

1. `node <skill>/scripts/validate-coverage.mjs <run>/coverage.json`: the format and the counts.
2. `node <skill>/scripts/check-map.mjs <run>`: the eight headings, the inventory, and the same ids
   in `map.md` and `coverage.json`.
3. `node <skill>/scripts/redact-check.mjs <run> --project <project>`: no secret-shaped text and no
   value from the project's `.env` files in the run folder. It prints only the file, line and
   kind of each hit, never the value.

A failure is fixed and the check run again, starting from the first. For a leak, replace the
value in the run file with `[redacted]`. If a check can't be made to pass, stop and tell the
user. The run never finishes with a known leak or an invalid file.

To test a run against a reviewed answer key, `scripts/match-golden.mjs` compares two run
folders. It is a tool for testing AgentRoster, not part of a user's run.
