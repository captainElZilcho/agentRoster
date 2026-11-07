# Claude Agent SDK

The SDK that runs the Claude Code agent loop inside an app: `claude_agent_sdk` (Python) and
`@anthropic-ai/claude-agent-sdk` (TypeScript). Older code may use the earlier names
`claude_code_sdk` and `@anthropic-ai/claude-code`; the script does not flag those, so look for
them.

## How to spot it

- Python: `from claude_agent_sdk import query, ClaudeAgentOptions, ClaudeSDKClient`, and helpers
  such as `tool`, `create_sdk_mcp_server`, `AgentDefinition`, `HookMatcher`.
- TypeScript: `import { query } from "@anthropic-ai/claude-agent-sdk"`, with helpers such as
  `tool` and `createSdkMcpServer`.
- Runs: `query(prompt=..., options=...)` (one task), or a `ClaudeSDKClient` session with
  `client.query(...)` and `client.receive_response()`.
- The script flags the import only. Find the `query` call or client session, and the options
  object it gets, which may be built elsewhere.

## Where things live

All in the options (`ClaudeAgentOptions` in Python, an `options` object in TypeScript; Python
uses snake_case, TypeScript camelCase):

- **Prompt:** `system_prompt` / `systemPrompt`: a string, or the Claude Code preset
  (`{"type": "preset", "preset": "claude_code"}`) with an `append` text. The task itself is the
  `prompt` passed to `query`.
- **Tools:** `allowed_tools` / `allowedTools` and `disallowed_tools` / `disallowedTools` (tool
  names such as `Read`, `Bash`, `mcp__<server>__<tool>`), plus `mcp_servers` / `mcpServers`
  (including in-process servers made with `create_sdk_mcp_server` and functions marked `@tool`).
  Record `allowedTools` under `tools.allow` (the tools it is set up with) and `disallowedTools`
  under `tools.deny`, never in permission. `allowedTools` only approves the listed tools without
  asking; tools not on it still go through `permissionMode` and `canUseTool`, so it is not a
  limit by itself. `disallowedTools` blocks.
- **Model:** `model`. If it is not set, the docs name no SDK default (the CLI's default depends
  on the account): record the model as unknown (`other`), not a guess.
- **Limits:** `max_turns` / `maxTurns`, and any budget or cost cap the options set.
- **Permission:** `permission_mode` / `permissionMode` (`default`, with `manual` as another name
  for it, `acceptEdits`, `auto`, `dontAsk`, `plan`, `bypassPermissions`) is the declared
  permission setting, so it sets `guardrails.permission`. A `can_use_tool` / `canUseTool`
  callback is code that approves tool use; it runs only when the permission flow would otherwise
  ask. Record it as a guardrail with file and line, not as the permission.
- **Hooks:** `hooks` run code before or after tool use; record them as guardrails with file and
  line.
- **Subagents:** `agents`, a map of name to a definition (`AgentDefinition` in Python) with
  `description`, `prompt`, `tools` and `model`.
- **Files from disk:** `setting_sources` / `settingSources` (`"user"`, `"project"`, `"local"`)
  loads `.claude/` settings, `CLAUDE.md`, subagent files and skills from disk. When it is not
  set, it takes the CLI defaults (all sources). Note which sources apply; `"user"` points
  outside the repo.

## Agent or workflow

- **One `query` call or client session is an agent:** the model runs its own tool loop. Quote
  the `query(...)` call or the options that give it tools.
- **Each entry in `agents`** with its own prompt is its own agent card, kind agent, and reports
  to the agent whose options list it.
- **Code that runs several `query` calls in a fixed order,** with different prompts or options,
  is a workflow. Each `query` with its own job is an agent card that reports to it.

## Traps

- **Filesystem agents load by default.** When `setting_sources` is not set, the project's
  `.claude/agents/*.md` and skills are part of this agent. Only an explicit list without
  `"project"` leaves them out; then those files are not this agent's, though they may still be
  Claude Code's own (see `claude-code.md`).
- **`"user"` settings** live outside the repo: record what they would add as an unknown
  (`outside-repo`).
- **The `prompt` passed to `query`** is the task, often built from user input. The system prompt
  is the instructions.
- **The same options object** reused by several `query` calls with the same job is one agent.
- **`bypassPermissions`** is a declared setting worth recording as is; don't infer permission from
  the tool list.
