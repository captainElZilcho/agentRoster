# AgentRoster — agent instructions

AgentRoster is a standard (roster cards) plus a skill that maps the agents and workflows in a
project, writes a card for each, and assesses how well each one is defined.

## Start here (read in this order)

1. `README.md`: what it is.
2. `spec/`: the roster card standard (fields, types, ratings, org chart, portability and
   extensions, mappings).
3. `CLAUDE.local.md` and `.local/` if present (maintainer only, git-ignored, never committed):
   the internal docs in `.local/docs/`, read in this order:
   `roadmap.md` (done, **next step**, done-when) → `product-v0.2.md` (how it works) → the
   step's design (`design-stepN-*.md`) → `decisions.md` (ADR-001 onward) → `research.md`
   (standards and sources).

## How the project works

AgentRoster has two parts that ship together:

1. **The standard**: the roster card format (`spec/`) and its JSON Schemas (`schema/`). Cards are
   JSON, versioned (`"roster": "0.2"`); the core changes only with a new version, extras go in
   namespaced `extensions`.
2. **The skill** (`skills/agentroster/`), run by the user's own coding agent and model, installed
   with `npx skills add`:
   - **setup**: output folder (git-ignored), previous run, mode;
   - **map**: find every agent and workflow that calls a model, in any language → `map.md`,
     `coverage.json`;
   - **cards**: one roster card per agent or workflow, with evidence → `roster.json`;
   - **assess**: check packs → `findings.json` (what, why, impact, fix) and a 1–5 definition
     score with confidence;
   - **report**: `cards/<id>.md`, `assessment.md`, `assessment.html`.

   A run is an inventory plus a configuration review: each agent has its **definition** (the
   card) and its **result** (every check, passed or not). What the scan couldn't see is
   `unknown`, never `fail` or `pass`. The HTML report is a dashboard of card tiles, then the
   findings.

   Model-made output goes through a validation loop (a fresh validator checks it, up to three
   rounds). Scripts (Node.js 20+, no dependencies) do everything that needs no model: validate,
   rule checks, score, compare, render. A Claude Code plugin wraps the same skill later.

Work moves in this order: idea → design → decision (ADR) → plan → test-first build on a branch →
roadmap updated. Nothing is built without an approved design. While the product is being built,
the design, decisions, roadmap and plans are **internal** (maintainer only, `.local/docs/`); the
public repository holds the product.

## Where files go

Everything in the repository is **public**, and it holds the product only. Before saving a file,
ask: is it the product (standard, skill, examples, tests)? Or is it how we build it (design,
decisions, roadmap, plans, research), or does it contain personal data, local paths, private
project names, secrets or the maintainer's notes? Then it is internal and goes in
`CLAUDE.local.md` or `.local/` (both git-ignored, maintainer only).

| Kind of file | Location | Public |
|---|---|---|
| Card standard (versioned drafts) | `spec/roster-card-standard-vX.Y.md` | yes |
| Findings and coverage formats (versioned drafts) | `spec/findings-and-coverage-vX.Y.md` | yes |
| JSON Schemas | `schema/roster-card-X.Y.schema.json`, `schema/findings-X.Y.schema.json`, `schema/coverage-X.Y.schema.json` | yes |
| Example roster cards | `examples/*.roster.json` (generic agents only) | yes |
| Product design, step designs and research | `.local/docs/` (`product-vX.Y.md`, `design-stepN-<topic>.md`, `research.md`) | no (internal) |
| Decisions | `.local/docs/decisions.md` (new ADR, never delete) | no (internal) |
| Roadmap | `.local/docs/roadmap.md` | no (internal) |
| Implementation plans | `.local/plans/YYYY-MM-DD-<topic>-plan.md` | no (internal) |
| The skill (the product) | `skills/agentroster/`: `SKILL.md`, phase files, `checks/<pack>/` (`CHECKS.md`, `checks.json`), `schema/` (copies), `scripts/*.mjs`, `templates/`, `references/` | yes |
| Package file | `package.json` (no runtime dependencies) | yes |
| Tests and golden fixtures | `tests/`, `tests/fixtures/` (synthetic projects only; no real configs, no secrets) | yes |
| Generated output, run folders | `out/`, `.agentroster/` | no (git-ignored) |
| Project subagents and dev skills for working on this repo | `.claude/agents/`, `.claude/skills/` (generic, no private context) | yes |
| Shared Claude Code settings | `.claude/settings.json` | yes |
| Personal Claude Code settings | `.claude/settings.local.json` | no (git-ignored) |
| Maintainer's working notes, preferences, memory | `CLAUDE.local.md` | no (git-ignored) |
| Private history, references, scratch notes | `.local/` (see `.local/README.md`) | no (git-ignored) |

If a file belongs in a public location but needs a private detail, keep the public file generic
and put the detail in `CLAUDE.local.md` or `.local/`.

## Rules

- **Reuse before inventing.** Where A2A, Agent Skills, MCP or Claude Code already define a field,
  map to it (spec section 10). New core fields only come with a new standard version; anything
  else goes under namespaced `extensions`.
- **Discovery is read-only.** Never run discovered agents, never edit their files, never copy
  secrets, tokens or `.env` values into cards, reports or test fixtures. Redact them.
- **Nothing invented.** A field the source doesn't have is `null`. A rating without evidence is
  `unrated`.
- **Assessment output is the findings format only.** Every finding has evidence and four parts
  (what, why, impact, fix or decision); the fix names the exact change and is never applied
  automatically.
- **Shipped scripts have no dependencies** (Node.js 20+, plain JavaScript, `node --test`).
- **Specs are drafts** until the maintainer approves them; change them by new version.
- **Decisions** go in `.local/docs/decisions.md` as a new ADR; never delete one, supersede it.
- **Roadmap**: update `.local/docs/roadmap.md` when a step is done or scope changes.
- **Public files never link to internal docs.**
- **Test-first** for code. Reports (HTML) work offline with no external requests.
- **Ask before committing or pushing.** The repository is public: no personal data, local paths
  or private project names in committed files.
- **Only public paths are committed:** `README.md`, `LICENSE`, `CONTRIBUTING.md`, `AGENTS.md`,
  `CLAUDE.md`, `.gitignore`, `package.json`, `spec/`, `schema/`, `skills/`, `examples/`,
  `tests/`, generic `.claude/` files. Before each commit, list the staged files and check every
  one against this list; anything else stops the commit.
- **AgentRoster stands alone.** Design it for any developer's project; it depends on no other
  project, and apps use it only through its public files.

## Writing style

Plain language, short sentences, sentence case. Name things by what users understand. Say what
is done and what isn't; never overclaim.
