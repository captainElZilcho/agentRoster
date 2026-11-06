# LangGraph and LangChain

LangGraph builds graphs of steps; LangChain gives the model wrappers, prompts and tools they use.
Python packages `langgraph`, `langchain`, `langchain_core`, `langchain_community` and provider
packages such as `langchain_anthropic` and `langchain_openai`. JavaScript: `@langchain/langgraph`,
`langchain`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai`.

## How to spot it

- **Graphs:** `StateGraph(State)`, `graph.add_node(...)`, `add_edge(...)`,
  `add_conditional_edges(...)`, `START`, `END`, `.compile()`; the functional API
  (`@entrypoint`, `@task`); `langgraph.json` lists the graphs an app serves
  (`"graphs": {"name": "./path.py:graph"}`).
- **Prebuilt agents:** `create_react_agent` (`langgraph.prebuilt`, JS `createReactAgent`),
  `create_agent` (`langchain.agents`), older `AgentExecutor` with `create_tool_calling_agent`
  or `initialize_agent`. Multi-agent helpers: `langgraph_supervisor` (`create_supervisor`),
  `langgraph_swarm`.
- **Models:** `ChatAnthropic(model=...)`, `ChatOpenAI(model=...)`,
  `init_chat_model("provider:model")`, and other `Chat*` classes. Calls: `.invoke`, `.ainvoke`,
  `.stream`, `.batch`, or a chain `prompt | model | parser`.
- The script flags imports only. The places that matter are where a model is built, where a
  graph is compiled, and where an agent is created.

## Where things live

- **Prompt:** `ChatPromptTemplate.from_messages([("system", ...), ...])`, `SystemMessage(...)`,
  the `prompt=` or `system_prompt=` argument of a prebuilt agent, or a message list built inside
  a node function. `hub.pull("owner/name")` loads a prompt from the LangChain Hub: an unknown
  (`loaded-from-url`), never fetched.
- **Tools:** functions marked `@tool`, `StructuredTool`, `Tool(...)`, toolkits, the `tools=` list
  of a prebuilt agent, and `model.bind_tools([...])`. A `ToolNode(tools)` runs them in a graph.
- **Model:** the `Chat*` constructor or `init_chat_model` string; `with_structured_output(...)`
  makes a structured step.
- **Limits:** `recursion_limit` in the run config (graph-wide), `max_iterations` on an
  `AgentExecutor`, `max_tokens` on the model, timeouts and retries.
- **Memory:** a checkpointer (`MemorySaver`, `InMemorySaver`, `SqliteSaver`, `PostgresSaver`)
  saves graph state per `thread_id`; a `store` (`InMemoryStore`, a database store) keeps data
  across threads. It is memory only if the agent reads past runs back (the same thread id reused,
  or the store searched).

## Agent or workflow

- **Agent:** a model with tools in a loop: a prebuilt agent, or a graph where a model node goes to
  a `ToolNode` and back, routed by `tools_condition` or a function that checks the last message
  for `tool_calls`. Quote that edge or the prebuilt call. A supervisor whose model picks the next
  worker is an agent (orchestrator); each worker with its own prompt is its own card.
- **Workflow:** a graph whose edges the code fixes: `add_edge` chains, and conditional edges
  routed by a plain function on the state. Quote the edges. The compiled graph is the workflow
  card; each node that calls a model with its own job is a card that reports to it.
- A chain `prompt | model | parser` is one model step: one card.
- A whole graph used as a node in another graph (a subgraph) reports to the outer graph.

## Traps

- **Nodes that are plain code** (format, fetch, save, route) get no card, even inside a graph.
- **One model object, several nodes:** the model is not an agent. Each node with its own prompt
  is one card; the same node function added twice is one.
- **A router that asks the model** for a label, then a plain function maps the label to an edge:
  the router node is an agent card; the graph is a workflow.
- **Imports alone:** `langchain_core` message types, text splitters, document loaders or
  embeddings (`OpenAIEmbeddings`) are not agents. An unused import is `no-agent`.
- **Prompts in YAML or Python modules** imported by the graph file: follow them and record each
  as a prompt candidate.
- **`langgraph.json`** is config, not code; it tells you which graphs are entry points.
- **Env variables** such as `LANGSMITH_API_KEY` or `LANGCHAIN_API_KEY` turn on tracing; that is
  not memory and not an agent. Never record their values.
