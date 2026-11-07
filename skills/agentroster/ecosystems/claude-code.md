# Claude Code: subagents, skills and settings

Claude Code reads agent definitions from Markdown files. The model is run by Claude Code, not by
the project's code, so these files are the definition.

## How to spot it

- **Subagents:** `.claude/agents/<name>.md` in the project. Each file is one subagent: YAML
  frontmatter, then the body, which is its system prompt. The script flags only files directly
  in `.claude/agents/`; check its subfolders yourself.
- **Skills:** `.claude/skills/<name>/SKILL.md`, with optional files beside it (references,
  scripts). Skills can also live in other folders that a tool or plugin installs.
- **Plugins:** `.claude-plugin/plugin.json` at a plugin root, with `agents/`, `skills/`,
  `commands/`, `hooks/hooks.json` and `.mcp.json` beside it. Plugin subagents in `agents/*.md`
  are not under `.claude/`, so the script does not flag them: find them yourself.
- **Slash commands:** `.claude/commands/*.md`, prompts a person runs in the main session.
- **Settings:** `.claude/settings.json` (shared) and `.claude/settings.local.json` (personal,
  usually git-ignored). `CLAUDE.md` files hold project instructions for the main session.
- The script flags subagent files under `.claude/agents/` and every `SKILL.md`, as whole files.

## Where things live

Subagent frontmatter (read the file; only record keys that are there):

- `name`, `description` (when the main session should use it);
- `tools`: a comma-separated list of tool names (`Read, Grep, Bash`, `mcp__<server>__<tool>`,
  `Agent(<name>, …)` to limit which subagents it may start). No `tools` key means it inherits
  every tool available to subagents; record that as written, not as a list. The list goes in
  `tools.allow` (and `disallowedTools` in `tools.deny`), never in permission;
- `model`: `sonnet`, `opus`, `haiku`, `fable`, a full model id, or `inherit`;
- `permissionMode`: the declared permission setting, so it sets `guardrails.permission`. Values:
  `default` (`manual` is another name for it), `acceptEdits`, `auto`, `dontAsk`,
  `bypassPermissions`, `plan`. `plan` explores without making changes, so it maps to
  `read-only`;
- `omitClaudeMd: true` skips the `CLAUDE.md` files (see below);
- other keys that map to card fields, where the file has them: `skills` (skills loaded into
  it), `mcpServers` (tools), `hooks` (guardrails), `maxTurns` (limits), `memory`. There are more
  keys; record only what maps to a card field.

**Context.** Custom subagents get the user, project and local `CLAUDE.md` files by default. List
the project's `CLAUDE.md` under the card's `context`, unless the subagent sets
`omitClaudeMd: true`. (The built-in Explore and Plan agents skip it, but they are not project
files.)

Skill frontmatter: `name`, `description`, and optional keys such as `allowed-tools`, `model`,
`context: fork` (run in its own subagent), `agent`, `disable-model-invocation`. The body is the
skill's instructions.

Settings: in `permissions`, `defaultMode` is the declared permission mode (it sets
`guardrails.permission`); the `allow`, `deny` and `ask` rules list tools, so they go in
`tools.allow` / `tools.deny` (record `ask` rules as needing approval), never in permission. `hooks` run commands on events such as `PreToolUse`; record them as guardrails.
`model` sets the main session's model. `env` may hold values: never copy them.

## Agent or workflow

- **Each subagent file is an agent card,** kind agent: Claude Code runs it as a tool loop. Quote
  the frontmatter `name` line or the file.
- **The main session** gets its own card only when the project gives it a job of its own: a
  settings `agent` key or a script that starts Claude Code with a named agent, a prompt file
  passed as its system prompt, or instructions that make it the orchestrator that hands work to
  the subagents. A `CLAUDE.md` with only coding rules is project context, not an agent.
- **A skill is not a card by itself.** It belongs to the agents that load it: subagents that list
  it in `skills`, and the main-session card if there is one. If no carded agent loads it, the
  candidate is `no-agent` ("a skill no carded agent loads").
- **A skill with `context: fork`** runs in a subagent of its own with the skill as its prompt. If
  it has its own job, it is an agent card; quote the `context` line.
- **A hook of type `prompt` or `agent`** asks a model to decide. If it has its own job (for
  example a gate that approves or blocks), it gets a card: a `prompt` hook is one fixed call,
  kind `workflow`; an `agent` hook runs its own tool loop, kind `agent`.
- **Scripts that run `claude -p` in a fixed order** (in CI or shell scripts) are a workflow; each
  run with its own prompt is a card that reports to it.

## Traps

- **User-level files** (`~/.claude/agents/`, `~/.claude/skills/`, user settings) are outside the
  repo. Never read them for a project run; if the project relies on them, record an unknown
  (`outside-repo`).
- **The AgentRoster skill itself** may be installed in the project. Its `SKILL.md` is a
  candidate with outcome `no-agent` ("the AgentRoster skill").
- **Duplicate names:** a project subagent and a plugin subagent with the same `name` are two
  files; decide from the job whether they are one agent or two, and say why.
- **`description` is not the job's proof.** It says when to call the agent; the body says what
  it does. The job decides the type.
- **Skills appended to a prompt** are skills, not the agent's instructions.
- **Slash commands** are prompts a person runs in the main session. They are not agents unless
  they start a subagent or a forked context with its own job.
- **`settings.local.json`** is personal and often git-ignored; the script will not list it. Don't
  open it.
