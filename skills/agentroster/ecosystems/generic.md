# Generic: any model call (always loaded)

For what the script can't see: model calls over plain HTTP, SDKs and frameworks not on the list,
homemade wrappers, and model names in config. Apply the identity rule in `MAP.md` as usual.

## How to spot it

**HTTP calls to model APIs.** Look for these hosts and paths in any language (`fetch`, `axios`,
`requests`, `httpx`, `aiohttp`, `curl`, `net/http`, `HttpClient`, `Faraday`, `reqwest`):

- `api.anthropic.com/v1/messages` (headers `x-api-key`, `anthropic-version`);
- `api.openai.com/v1/chat/completions`, `/v1/responses`, `/v1/completions`;
- `*.openai.azure.com/openai/deployments/<name>/...` (Azure OpenAI);
- `generativelanguage.googleapis.com` and `aiplatform.googleapis.com` (Gemini, Vertex AI);
- `bedrock-runtime.<region>.amazonaws.com`, or the AWS SDK's Bedrock runtime client with
  `InvokeModel`, `Converse` or `ConverseStream`;
- `api.mistral.ai`, `api.cohere.com` or `api.cohere.ai`, `api.groq.com`, `api.together.xyz`,
  `api.deepseek.com`, `api.x.ai`, `openrouter.ai/api/v1`;
- local servers: `localhost:11434/api/chat` or `/api/generate` (Ollama), and any
  `/v1/chat/completions` on a local port (vLLM, LM Studio, llama.cpp server).

**Other SDKs and frameworks.** Imports such as `google.genai` or `google.generativeai`,
`@google/genai`, `mistralai`, `cohere`, `groq`, `ollama`, `litellm`, `boto3` with
`bedrock-runtime`, the Vercel AI SDK (`ai`, `@ai-sdk/*`), `pydantic_ai`, `llama_index`,
`haystack`, `autogen` or `autogen_agentchat`, `semantic_kernel`, `dspy`, `smolagents`,
`@mastra/core`, the OpenAI Agents SDK (`agents`, `@openai/agents`). In other languages: Go
modules such as `github.com/anthropics/anthropic-sdk-go` or `github.com/openai/openai-go`, Java
`com.anthropic` or Spring AI or LangChain4j, .NET `Anthropic`, `OpenAI` or `Azure.AI.OpenAI`
packages, Ruby `anthropic` or `ruby-openai` gems. The dependency files (`package.json`,
`pyproject.toml`, `requirements*.txt`, `go.mod`, `Gemfile`, `pom.xml`, `*.csproj`, `Cargo.toml`)
show which ones the project pulls in. A dependency alone is not a candidate; the code that uses
it is.

**Homemade wrappers.** A function or class that hides the client: `call_llm(prompt)`,
`ask_model(...)`, `LLMClient.complete(...)`, `ai.generate(...)`. Find the wrapper, then find
every place that calls it. The call sites are where the agents are.

**Model names and env variable names.** Model ids in code or config (`claude-…`, `gpt-…`,
`o1`, `o3`, `o4-mini`, `gemini-…`, `llama…`, `mistral-…`), and env variable names that pick a
model, provider or endpoint (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`LLM_MODEL`, `MODEL_NAME`, `*_MODEL`). Read the names where the code reads them
(`os.environ`, `os.getenv`, `process.env`, settings classes, `docker-compose.yml`, CI config).
Never open `.env` files, including `.env.example`.

**Prompt files.** Files the code reads and sends to a model: `prompts/`, `*.prompt`,
`*.prompty`, `*.txt`, `*.md`, `*.jinja`, `*.j2`, `*.hbs`, YAML or JSON with `system` or
`instructions` keys. Each loaded prompt file is a whole-file candidate with signal
`prompt-file`, except a shared skill file appended into prompts, which has signal
`skill-file` (`MAP.md`).

## Where things live

- **Prompt:** the system message (`system`, `role: "system"`, `instructions`), the template it
  is built from, and every file or string joined into it. A prompt built from several pieces is
  one prompt; list each piece with file and line.
- **Tools:** a tool or function list sent with the call (`tools`, `functions`), and the code that
  runs each tool.
- **Model:** the model id in the call, or the config value or env variable it comes from. A
  model named only by an env variable is an unknown (`loaded-from-env`); record the variable
  name, never a value.
- **Limits:** max tokens, max steps or turns, timeouts, retries, cost caps, enforced in code.
- **Trigger:** the route, schedule, queue consumer, CLI command or UI event that starts it.

## Agent or workflow

- **Agent:** the code loops, sends the model's tool requests to tools, sends the results back,
  and stops when the model stops asking (or a step limit hits). Or the model picks which helper
  runs next. Quote the loop's condition.
- **Workflow:** the code calls the model at fixed points: one call, then the next, or a branch the
  code takes on the model's answer. Several model steps in a fixed order make a workflow card;
  each step with its own job is a card that reports to it.
- A single call at a fixed point (one HTTP request or one SDK call, no tool loop) is kind
  `workflow`: the model picks nothing. It gets its own card when it has its own job.

## Traps

- **The wrapper is not an agent.** The wrapper file usually has the only import; the agents are
  in the files that call it. Card the callers, never the wrapper.
- **One prompt, many call sites** is one agent. Two prompts through the same wrapper are two.
- **Embeddings, moderation, speech, image and token-count calls** call a model but have no
  prompt with a job. They are not cards. Record them as data the agent uses, or as
  `no-agent` with a note.
- **OpenAI-compatible endpoints.** A client pointed at another host with a base URL (`base_url`,
  `baseURL`, `OPENAI_BASE_URL`) talks to that provider. Record the provider the config shows, or
  an unknown if it comes from an env variable.
- **Tests, mocks and examples.** Code under `tests/`, fixtures, stubs and `examples/` that a
  person runs by hand are not the product's agents. Record them as `no-agent` ("test code").
  If you are not sure whether the project ships them as agents (a template or demo repository),
  mark them `needs-checking` instead.
- **Unknown framework.** If you can't tell how a framework works, don't guess. Mark the
  candidate `not-understood` with the reason, record an unknown with reason
  `unsupported-framework`, and list it under "Needs checking".
- **Prompts from outside the repo.** A prompt from a database, a prompt hub, a URL or a remote
  config service is an unknown with the matching reason. Never fetch it.
