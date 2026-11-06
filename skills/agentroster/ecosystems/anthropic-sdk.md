# Anthropic SDK

The Claude API client libraries: `anthropic` (Python) and `@anthropic-ai/sdk` (TypeScript and
JavaScript), plus the Bedrock and Vertex variants.

## How to spot it

- Python: `import anthropic`, `from anthropic import Anthropic, AsyncAnthropic`,
  `AnthropicBedrock`, `AnthropicVertex`.
- TypeScript and JavaScript: `import Anthropic from "@anthropic-ai/sdk"`,
  `@anthropic-ai/bedrock-sdk`, `@anthropic-ai/vertex-sdk`.
- Other languages have their own SDKs (Go, Java, C#, Ruby, PHP); see `generic.md`.
- Calls: `client.messages.create(...)`, `client.messages.stream(...)`,
  `client.beta.messages.create(...)`, `client.messages.batches.create(...)` (a batch of
  requests, each with its own `params`), and the beta tool runner
  (`client.beta.messages.tool_runner(...)` in Python, `client.beta.messages.toolRunner(...)` in
  TypeScript).
- The script flags imports and `.messages.create(` and `.messages.stream(` lines in files that
  import the SDK. Batches, the tool runner, and calls in files that get the client from
  elsewhere are for you to find.

## Where things live

- **Prompt:** `system=` (a string, or a list of text blocks, often with `cache_control`). The
  first `user` message often holds instructions too, built from a template.
- **Tools:** `tools=[...]`, each with `name`, `description` and `input_schema`. Server tools have
  a `type` such as a web search, web fetch or code execution tool. With the tool runner, tools
  are functions marked `@beta_tool` (Python) or built with a helper such as `betaZodTool`
  (TypeScript). `tool_choice` can force one tool or none. An `mcp_servers` parameter (beta) gives
  the call tools from remote MCP servers.
- **Model:** `model=` on each call, for example `"claude-…"`. Often a constant or a setting.
- **Limits:** `max_tokens` (required on every call), `stop_sequences`, the `thinking` budget, the
  client's `timeout` and `max_retries`, and any step counter in the code's own loop. With the
  tool runner, look for a maximum iterations setting.
- **Structured output:** a forced tool whose input schema is the answer, or a JSON schema output
  setting.

## Agent or workflow

- **Agent:** a loop that checks `stop_reason == "tool_use"` (`=== "tool_use"` in TypeScript), runs
  the tools the model asked for, sends `tool_result` blocks back and calls again. The tool runner
  is the same loop inside the SDK. Quote the loop condition or the tool runner call.
- **Workflow:** several `messages.create` calls with different prompts in a fixed order, or a
  branch the code takes on one call's answer. Each call with its own job is a card that reports to
  the workflow card.
- **One `messages.create` call with no tool loop** (including one that forces a single tool with
  `tool_choice` to get structured output) is kind `workflow`: the model chooses nothing. It is
  its own card when it has its own job.

## Traps

- **A shared client module** (`llm.py`, `client.ts`) that builds `Anthropic()` and exports it or
  a helper is not an agent. Card the callers.
- **`messages.count_tokens`** counts tokens; it is not a model step.
- **Batches:** the prompts are in each request's `params`; the same prompt over many items is
  one agent.
- **Prompt caching** splits the system prompt into blocks; they are still one prompt.
- **Bedrock and Vertex** clients take a region or project; the model id format differs
  (`anthropic.claude-…` on Bedrock). It is still this ecosystem.
- **`ANTHROPIC_API_KEY`** is read by the client from the environment. Never record its value.
- **`max_tokens` is a limit on output length,** not a run budget.
