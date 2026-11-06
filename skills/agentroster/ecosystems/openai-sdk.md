# OpenAI SDK

The OpenAI client libraries: `openai` (Python, and the npm package `openai`), including Azure
OpenAI. The OpenAI Agents SDK is a separate package; see the end of this note.

## How to spot it

- Python: `import openai`, `from openai import OpenAI, AsyncOpenAI, AzureOpenAI`.
- TypeScript and JavaScript: `import OpenAI from "openai"`, `import { AzureOpenAI } from
  "openai"`.
- Calls: `client.chat.completions.create(...)`, `client.responses.create(...)`, the `.parse(...)`
  and `.stream(...)` forms of both, and the older Assistants API
  (`client.beta.assistants.create(...)`, `client.beta.threads.runs.create(...)`).
- The script flags imports and `.chat.completions.create(` and `.responses.create(` lines in
  files that import the SDK. The `.parse` and `.stream` forms, the Assistants API, and calls in
  files that get the client from elsewhere are for you to find.

## Where things live

- **Prompt:** Chat Completions: the message with `role: "system"` (or `"developer"`) in
  `messages`. Responses: `instructions=`, plus messages in `input`. Assistants: `instructions=`
  on the assistant.
- **Stored prompts:** the Responses API can take `prompt={"id": "pmpt_…"}`, and the Assistants
  API can name an assistant by id (`asst_…`). The text lives on OpenAI's side: record an unknown
  (`loaded-from-url`, detail "stored prompt"), never fetch it.
- **Tools:** `tools=[...]`. Chat Completions uses `{"type": "function", "function": {...}}`;
  Responses also has built-in tools (web search, file search, code interpreter, computer use,
  remote MCP). `tool_choice` can force or forbid tools. `parallel_tool_calls` lets the model ask
  for several at once.
- **Model:** `model=`. On Azure it is the deployment name, not the model's name; record what the
  code shows.
- **Limits:** `max_tokens` or `max_completion_tokens` (Chat Completions), `max_output_tokens`
  (Responses), the client's `timeout` and `max_retries`, and any step counter in the code's loop.
- **Memory:** `previous_response_id` or a stored conversation carries context between calls. It
  is memory only if the code reads past runs back.

## Agent or workflow

- **Agent:** a loop that checks for `tool_calls` on the message (or function call items in a
  response), runs them, sends the results back, and calls again until the model answers without
  a tool call. Quote that check.
- **Workflow:** calls with different prompts in a fixed order, or a branch the code takes on the
  answer. Each call with its own job is a card that reports to the workflow card.
- A call with `response_format` or `.parse` and no tools is a single structured step: a card,
  kind agent, that chooses nothing.

## Traps

- **`base_url` or `OPENAI_BASE_URL`** points the client at another provider (OpenRouter, Groq,
  Together, Ollama, vLLM, LM Studio). Record the provider the config shows.
- **Embeddings, moderation, audio, images and files** (`client.embeddings.create`,
  `client.moderations.create`, …) are not agent steps.
- **LangChain's `ChatOpenAI`** imports `langchain_openai`, not `openai`; see `langgraph.md`.
- **A shared client module** is not an agent. Card the callers.
- **`OPENAI_API_KEY`** is read from the environment. Never record its value.

## The OpenAI Agents SDK

- Python package `openai-agents`, imported as `agents`: `from agents import Agent, Runner,
  function_tool, handoff`. TypeScript: `@openai/agents`. The script does not flag these; find
  them yourself.
- `Agent(name=..., instructions=..., model=..., tools=[...], handoffs=[...], output_type=...,
  input_guardrails=[...], output_guardrails=[...], model_settings=...)`. `instructions` can be a
  function that builds the prompt.
- Each `Agent(...)` with its own instructions is an agent card. `Runner.run(...)` (or
  `run_sync`, `run_streamed`) runs the tool loop; `max_turns` is its limit.
- `handoffs=[other_agent]` is a handoff the model chooses. `other_agent.as_tool(...)` makes one
  agent a tool of another: the caller is the orchestrator, the tool agent reports to it.
- Code that runs several `Runner.run` calls in a fixed order is a workflow.
