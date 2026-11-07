# The checking loop

Every phase that a model writes goes through this loop before its output counts: a fresh
validator checks it, the finder fixes what fails, up to three rounds. The map is the first phase
that uses it. The cards and assess phases will add their own checklists here when they are
built.

## 1. Two roles

- **The finder** wrote the output (for the map: `map.md` and `coverage.json`).
- **The validator** checks it. It starts fresh and gets only:
  - the output files in the run folder (for the map: `detect.json`, `map.md`, `coverage.json`);
  - the project, to read;
  - this file and the phase's method (for the map: `MAP.md` and the ecosystem notes).

  It never gets the finder's notes, reasoning or chat. It checks what is written against what
  the project shows.

**How to run the validator.** If you can start helper agents (subagents), start one for each
validator task and give it only the inputs above, as file paths. If you can't, run a separate
pass yourself: set your earlier reasoning aside, re-read the files from disk, and follow the
checklist as if you had not seen the project before. Even then, run the missed-agent hunt
(task B) as its own step: re-read the project from the file list (`detect.json` and the files
git lists), not from your own notes. Say which way it ran in the `map.md` summary.

The validator only reports. It never edits the output or the project. It follows the same rules
as the finder: read only, never fetch, never open secret files, never copy a secret.

## 2. What the validator checks (the map)

Task A: **check what is there.**

1. **Evidence.** Each candidate is at that file and line, and the line shows what `signals` and
   `detail` say. Each quote in an unknown is really in that file at that line.
2. **Outcome.** Each `cards` candidate really feeds those ids. Each `no-agent` note is true. Each
   `pending` candidate has a reason.
3. **The inventory follows the identity rule** (`MAP.md` section 3): no agent split in two, no two
   merged, no shared client or wrapper carded, no plain code carded, a pipeline of several model
   steps has its own workflow card.
4. **The kind is right.** The "decided by" line really shows the model choosing its next step or
   tool (agent), or the code fixing the path (workflow).
5. **The general rules** (`MAP.md` section 4) are followed, and every script candidate from
   `detect.json` is still in `coverage.json`.

Task B: **hunt for anything both searches missed.** This is its own task, done apart from
task A (its own helper agent, or its own pass). Search the project for model calls, wrappers,
prompt files, agent definitions and frameworks that are not in `coverage.json`. Use the
"what text search can't see" list in `MAP.md` and the notes in `ecosystems/`. Report each find
with file and line, and say whether its file already has a candidate: a find in such a file is
card evidence, not a new candidate (`MAP.md` section 5, "When the agent search adds a
candidate").

The validator's report is a list. For each problem: where (file and line, or the id), what is
wrong, and what the project shows instead. An empty list means it agrees.

## 3. Rounds

1. The validator checks and reports (round 1).
2. The finder fixes each problem it agrees with, and answers each problem it doesn't agree
   with, with evidence. A missed find in a file with no candidate yet becomes a new candidate
   (`found_by: "agent"`); a missed find in a file that already has a candidate is added as
   evidence on the card (`MAP.md` section 5).
3. A fresh validator checks again (round 2), then again if needed (round 3). Each round checks
   the fixes, the new candidates, and the answers.
4. After the last round, what still fails, and any find from the last round that no later round
   could check, is `needs-checking`. It stays in the output and is listed under "Needs checking"
   in `map.md` with what was in dispute. It is never dropped.

## 4. Modes

The mode changes only the checking, never the search.

| Mode | Rounds | The missed-agent hunt |
|---|---|---|
| `quick` | 1 | once |
| `standard` (default) | up to 3 | once per round |
| `thorough` | up to 3 | three times per round, each by a fresh validator; every find from any of them is kept |

In `quick` mode, a problem found in round 1 is fixed if it can be, but nothing checks the fix,
so it is `needs-checking`.

For the map, more finds are safer, so `thorough` keeps a find that any one hunt reported. (For
findings, the assess phase will keep only what all three agree on.)

## 5. What to record

- `snapshot.mode` in `coverage.json` is the mode that ran.
- Each candidate's `validation`:
  - `status`: `validated` when a validator agreed with it, `needs-checking` when the rounds ended
    without agreement;
  - `rounds`: the last round that checked it, from 1 to 3. A candidate agreed in round 1 has
    `rounds: 1`. A candidate the hunt found in round 1, added by the finder and agreed in
    round 2 has `rounds: 2`. A candidate still in dispute after round 3 has `rounds: 3`.
- `summary.needs_checking` counts the candidates with `needs-checking`.
- The `map.md` summary says the mode, how the validator ran (helper agents or separate passes)
  and how many rounds were used.
