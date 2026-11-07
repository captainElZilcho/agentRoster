---
name: agentroster
description: Map every AI agent and model workflow in a project, in any language, and record what each one uses (model, prompts, tools, skills, data, trigger) with file and line. Use when the user asks to map, list, inventory or audit the agents, LLM calls, subagents or AI workflows in a codebase, or to make roster cards for them. Reads the project without running it, checks its output for secrets, and writes map.md and coverage.json to a git-ignored run folder.
---

# AgentRoster

AgentRoster finds every agent and workflow in a project that calls a model, and writes a map of
them. Later phases turn the map into roster cards and check how well each one is defined.

You read the project; you never run it. Follow this file from top to bottom. The method for the
map is in `MAP.md`, and the checking loop is in `VALIDATION.md`, both in this folder.

## What is built

| Phase | What it makes | Built |
|---|---|---|
| Setup | the run folder, the run id, the mode | yes |
| Map | `detect.json`, `map.md`, `coverage.json` | yes |
| Cards | one roster card per agent and workflow, `roster.json` | not yet |
| Assess | `findings.json` and a definition score | not yet |
| Report | `cards/<id>.md`, `assessment.md`, `assessment.html` | not yet |

**Stop after the map and say so.** Tell the user that the cards, assess and report phases are
not built yet. Do not write cards, findings or reports by hand.

## Rules for the whole run

- **Read only.** Never run, build, test or install the project. Never edit, move or delete its
  files. The only files you write are in the run folder.
- **Never fetch.** A prompt or setting that comes from a database, a URL, an API or an
  environment variable is recorded as unknown ("loaded from X"). Never fetch it.
- **Never open secret files:** `.env` and `.env.*` (including `.env.example`), `*.pem`, `*.key`,
  `*.p12`, `*.pfx`, `*.kdbx`, SSH keys (`id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` and files
  starting with those names), `.netrc`, `.npmrc`, `.pypirc`, `.pgpass`, anything in `.ssh/`, and
  any file whose name has "secret" or "credential" in it.
- **Never copy a secret.** If a key, token or password turns up in a file you read, cite the file
  and line only. Write `[redacted]` in any quote that would hold it. Env variable names are fine;
  their values never are.
- **Nothing invented.** A thing the code doesn't show is left empty or recorded as unknown. A
  place you can't settle is marked needs checking, never dropped and never guessed.
- **Never commit** anything, and never change `.gitignore` yourself.
- **No git commands on the project** other than the git-ignore check in step 1 (no status, diff,
  log or any other). A project's git config can name commands that git runs for you.

## Paths

`<skill>` is the folder this file is in. `<project>` is the project root. Run the scripts with
Node.js 20 or later, using paths relative to `<skill>`:

```
node <skill>/scripts/detect.mjs <scope> --out <run>/detect.json --exclude <output folder>
node <skill>/scripts/validate-coverage.mjs <run>/coverage.json
node <skill>/scripts/check-map.mjs <run>
node <skill>/scripts/redact-check.mjs <run> --project <project>
```

Exit codes: `0` ok and `2` a file or folder could not be used, for all four. `1` (problems
found, listed on screen) comes only from `validate-coverage.mjs`, `check-map.mjs` and
`redact-check.mjs`; `detect.mjs` exits `0` or `2`. If `node --version` is missing or below 20, stop and tell the user.

## Step 1: setup

1. **Project root.** The folder the user names is the project. When they name none, it is the
   nearest folder, from the current one upward, that holds a `.git` entry; else the current
   folder.
2. **Scope.** The whole project, unless the user names a folder. If they do, the scope is that
   folder. Paths in the output are always from the project root.
3. **Output folder.** `.agentroster/` at the project root, unless the user names another one.
   The run folder inside it is `run-YYYY-MM-DD-N` (today's date in UTC; `N` counts up from 1
   within a day, so take the next free number).
4. **Git-ignore check.** In a git repository, when the output folder is inside the project, run
   exactly `git -c core.fsmonitor=false -c core.hooksPath=/dev/null check-ignore --no-index -q <run>/map.md`
   from the output folder's parent folder (the two settings stop git from running a command the
   project's own config names). Exit code
   `0` means git ignores it. Anything else means it
   does not: **stop and ask the user** to add the output folder to `.gitignore` (for example a
   line `.agentroster/`) or to pick another folder. Do not go on until the check passes. If the
   project is not a git repository, say so to the user and go on.
5. **Previous run.** If the output folder already holds `run-*` folders, the newest one (latest
   date, then highest `N`) is the previous run. Note its id. Read its `map.md` only to reuse the
   same ids for the same agents; never copy its findings into this run.
6. **Mode.** `standard` unless the user asks for `quick` or `thorough`. The mode changes only
   the checking (see `VALIDATION.md`), never the search.
7. Create the run folder. It holds only the files this run writes.

The snapshot in `coverage.json` comes from this step:

| Field | Value |
|---|---|
| `id` | the run folder name, for example `run-2026-11-05-1` |
| `taken_at` | the time the run started, in UTC, from the system clock (for example `date -u +%Y-%m-%dT%H:%M:%SZ`); if no clock is available, say so in the `map.md` summary |
| `project` | the project's name (folder or package name), never a path |
| `standard` | `"0.2"` |
| `packs` | `[]` (no check packs run in the map phase) |
| `mode` | `standard`, `quick` or `thorough` |
| `previous` | the previous run's id, or `null` |

## Step 2: the script search

Run `detect.mjs` on the scope:

```
node <skill>/scripts/detect.mjs <scope> --out <run>/detect.json --exclude <output folder>
```

Add `--exclude <output folder>` (a path relative to the scope) whenever the output folder is
inside the scope; leave it out otherwise. The script reads files without running them, never
opens secret files, and never copies a line's text. It writes:

- `ecosystems`: which reference notes to load;
- `candidates`: each `{file, line, signals, detail, ecosystems}`; `line` is `null` for a whole
  file;
- `skipped`: how many files it did not read, by reason: `ignored`, `dependencies`,
  `build_output`, `run_folder`, `secret_file`, `link`, `binary`, `too_large`, `unreadable`,
  `submodule` (a git submodule or nested repository, counted once; see `MAP.md` section 9).

**If the script read no files** (`candidates` is empty and every file in the scope is counted
in `skipped`, or the scope has no files), tell the user before going on, with the counts from
`skipped`. For example: "No files were read: 40 git-ignored, 3 dependencies."

The script is the floor. It finds the common, obvious signs, not everything. If the scope is a
folder, its paths are relative to that folder: put the folder path in front of each one when you
write `coverage.json`.

## Step 3: the map

Follow `MAP.md`. It says how to read the candidates, search for what the script can't see,
decide the inventory, and write `map.md` and `coverage.json` in the run folder.

## Step 4: check

1. Follow `VALIDATION.md`: a fresh validator checks the map and hunts for missed agents, up to
   three rounds.
2. Then run the three scripts, in this order, as listed in `MAP.md`: `validate-coverage.mjs`,
   `check-map.mjs`, `redact-check.mjs`.
3. A failed script is fixed and run again. If you can't fix it, stop and tell the user what
   failed. A run never finishes with a known leak or an invalid file.

## Step 5: tell the user

Say, in a few short lines:

- where the run folder is;
- how many agents and workflows were found, and how many candidates were checked;
- what is unknown and what needs checking, if anything;
- how many files were skipped, and why;
- that the cards, assess and report phases are not built yet, so the run stops after the map.
