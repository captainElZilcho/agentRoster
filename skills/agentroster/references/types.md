# Agent types (from the roster card standard v0.2)

A copy of section 1 of `spec/roster-card-standard-v0.2.md`, so the skill has it when installed on
its own. A test keeps it identical to the standard. Choose a card's `type` by its job (`CARDS.md`).

## 1. Agent types

A fixed list of types, so a collection can be grouped and filtered the same way across apps.
Each card has one primary type and at most one secondary. The type also sets the **permission
ceiling**: the most an agent of that type should ever be allowed to change.

| Code | Type | What it does | Permission ceiling |
|---|---|---|---|
| `orchestrator` | Orchestrator | Plans a task, picks and hands work to other agents, collects results | Delegate; read |
| `assistant` | Assistant | Talks with a person and answers or helps directly (chat, briefing) | Read; actions only through other agents or with approval |
| `researcher` | Researcher | Finds and summarises information: code, web, documents, data | Read only |
| `builder` | Builder | Produces a work product: code, document, analysis, plan | Write inside its workspace |
| `specialist` | Specialist | Builder for one narrow area (SQL, one API, one language) | Write inside its workspace, own area |
| `reviewer` | Reviewer | Checks work: code review, tests, fact check, security review | Read; comment; run tests |
| `gatekeeper` | Gatekeeper | Approves or blocks actions against policy before they leave the workspace | Approve / deny |
| `operator` | Operator | Acts on the world: deploys, restarts, sends messages, places orders | Act outside the workspace, within guardrails |
| `monitor` | Monitor | Watches something on a schedule or on events and raises alerts | Read; notify |

Types apply to both kinds of card (`agent` and `workflow`, section 2), and so does the permission
ceiling.

**Separation of duties:** a reviewer or gatekeeper never reviews or approves output from its own
card.

