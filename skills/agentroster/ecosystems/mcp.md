# MCP: Model Context Protocol

MCP connects a model's host (Claude Code, Claude Desktop, an IDE, an agent built with an SDK) to
servers that offer tools, resources and prompts. In a map, MCP is mostly about tools: which
agent gets which server's tools.

## How to spot it

- **Client config** (which servers an agent can use):
  - `.mcp.json` at the project root (Claude Code), key `mcpServers`;
  - `.cursor/mcp.json` (key `mcpServers`), `.vscode/mcp.json` (key `servers`), and
    `claude_desktop_config.json`;
  - `mcpServers` in a Claude Code subagent's frontmatter, `mcp_servers` / `mcpServers` in Claude
    Agent SDK options, an `mcp_servers` parameter on an Anthropic API call, or a remote MCP tool
    in an OpenAI Responses call.
- **Server code** (the project offers tools to others):
  - Python: `from mcp.server.fastmcp import FastMCP` (or the separate `fastmcp` package), with
    functions marked `@mcp.tool()`, `@mcp.resource(...)`, `@mcp.prompt()`;
  - TypeScript: `@modelcontextprotocol/sdk`, `new McpServer(...)`, `server.tool(...)` or
    `server.registerTool(...)`.
- The script flags `.mcp.json` files only, as whole files. The other configs and server code are
  for you to find.

## Where things live

- **A server entry** in `mcpServers` has a name and either `command` with `args` (a local
  server) or `type` (`http`, `sse`) with `url` (a remote one). `env` and `headers` often hold
  tokens: never copy their values; record the variable names only.
- **The tools** a server gives are in its code (if it is in the repo) or not visible (a package or
  a remote URL). A server whose code is not in the repo gives tools you can't list: record an
  unknown (`outside-repo` for a package, `loaded-from-url` for a remote server) on the field
  `tools.mcp` of each agent that uses the server.
- **Tool names** as agents see them: `mcp__<server>__<tool>` in Claude Code and the Claude Agent
  SDK. A subagent's `tools` list or the SDK's `allowed_tools` may name them one by one.

## Agent or workflow

- **An MCP server is not an agent.** It is a tool provider. Its tools go on the cards of the
  agents that can use them.
- **A server that calls a model itself** is different. If its code calls a model SDK or asks the
  client's model through sampling (`ctx.session.create_message(...)` in Python, a
  `createMessage` request in TypeScript), that model step has its own job: card it, and decide
  its kind by the usual rule.
- **A config file alone** is not an agent; it adds tools to agents. Link it to the agents that load
  it (the main session card, subagents, SDK agents with `setting_sources` or `mcp_servers`
  pointing at it). If no carded agent loads it, the candidate is `no-agent` ("MCP config no
  carded agent uses").

## Traps

- **Which agents get the tools.** In Claude Code, project `.mcp.json` servers are open to the main
  session and to subagents that don't limit their tools. A subagent with a `tools` list gets
  only the MCP tools it names. Link by what the config and the tools lists show.
- **Approval is a machine setting, not part of the definition.** Claude Code asks before using
  project servers only in interactive sessions; `claude -p`, the Agent SDK and cloud sessions
  load them without asking. `enableAllProjectMcpServers` and `enabledMcpjsonServers` approve
  servers, and `disabledMcpjsonServers` rejects one. Keep the link from each agent that uses the
  server; note a setting that rejects it.
- **Secrets in config.** `env` blocks and `headers` (`Authorization`) often hold real keys, and
  `${VAR}` references point to env variables. Cite the file and line, never the value.
- **Prompts from a server** (`@mcp.prompt()`) are templates a person or host picks; they are not
  an agent's instructions unless an agent loads them.
- **A server package run with `npx` or `uvx`** has its code outside the repo. Don't fetch it.
