# CrewAI

A Python framework for role-based agents that work through tasks as a crew. Package `crewai`,
with tools in `crewai_tools` or `crewai.tools`.

## How to spot it

- `from crewai import Agent, Task, Crew, Process, LLM`.
- Projects made with the CrewAI template have `src/<name>/crew.py` with a class marked
  `@CrewBase`, methods marked `@agent`, `@task` and `@crew`, and YAML files
  `config/agents.yaml` and `config/tasks.yaml`. `main.py` calls `crew().kickoff(inputs={...})`.
- Flows: `from crewai.flow.flow import Flow, start, listen, router`, a class that extends `Flow`
  with methods marked `@start()`, `@listen(...)` and `@router(...)`.
- The script flags imports only. The YAML files are not flagged; read them when `crew.py`
  loads them.

## Where things live

- **Prompt:** an agent's `role`, `goal` and `backstory` (in the `Agent(...)` call or under the
  agent's key in `agents.yaml`). Together these are its instructions. A task's `description` and
  `expected_output` (in `Task(...)` or `tasks.yaml`) are the job it is given. `{topic}`-style
  placeholders are filled from `kickoff(inputs=...)`.
- **Tools:** `tools=[...]` on an agent or a task. Tools come from `crewai_tools` (for example
  search or file tools), from classes extending `BaseTool`, or functions marked `@tool`.
- **Model:** `llm=` on the agent (a model string or `LLM(model="provider/model", ...)`),
  `manager_llm` on a hierarchical crew. If no model is set, CrewAI picks one from env variables
  such as `MODEL` or `OPENAI_MODEL_NAME`, or its own default: record an unknown
  (`loaded-from-env`), never a guess.
- **Limits:** `max_iter`, `max_rpm`, `max_execution_time` and `max_retry_limit` on an agent;
  `max_rpm` on the crew (crew-wide, so it belongs to the workflow).
- **Delegation:** `allow_delegation=True` lets an agent hand work to other agents in the crew.
- **Memory:** `memory=True` on the crew turns on CrewAI's memory, which is read back on later
  runs. Record it with file and line. Task `output_file` only saves output; it is not memory.
- **Guardrails:** a task `guardrail` function, `human_input=True` (a person approves the output).

## Agent or workflow

- **Each `Agent(...)` (or `@agent` method) is an agent card,** kind agent: it runs its own tool
  loop for each task. Quote the `Agent(` line or the `@agent` method.
- **A crew with `process=Process.sequential`** (the default) runs tasks in a fixed order: the
  crew is a workflow card, and its agents report to it. Quote the `process=` line, or the `Crew(`
  call if it is left out.
- **A crew with `process=Process.hierarchical`** has a manager model that picks who does what:
  the manager is an agent (orchestrator). If the code gives only `manager_llm`, the manager is
  still a model step with its own job; card it and say its prompt is CrewAI's built-in one
  (unknown, `other`). If it gives `manager_agent`, that agent is the manager.
- **A Flow** runs steps along fixed paths: a workflow card. A `@router` that returns a label
  from plain code is part of the flow; a method that calls a model or kicks off a crew is a step.

## Traps

- **One agent, many tasks** is one card. Tasks are the jobs, not cards.
- **An agent in `agents.yaml` that no `@agent` method or crew uses** is a definition no code loads:
  `no-agent`.
- **`@agent` methods read `self.agents_config["name"]`:** the YAML key ties the method to its
  prompt. Cite both the method and the YAML lines.
- **`context=[other_task]`** passes one task's output to another; that is a handoff between the
  agents only when the tasks belong to different carded agents and no plain code sits between.
- **Planning** (`planning=True`) adds a planning model step to the crew; record it on the crew.
- **Env files hold the keys and often the model name.** Never open `.env`; record the variable
  names the code reads.
