import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MAP_SECTIONS } from "../skills/agentroster/scripts/check-map.mjs";
import { gitInvocation } from "../skills/agentroster/scripts/detect.mjs";

const skill = "skills/agentroster";
const read = (rel) => fs.readFileSync(path.join(skill, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(skill, rel));

/** Every Markdown file in the skill folder, as paths relative to it. */
function markdownFiles(dir = skill) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return markdownFiles(full);
    return e.name.endsWith(".md") ? [path.relative(skill, full)] : [];
  });
}

/** Script paths (`scripts/<name>.mjs`) named in a text. */
const scriptsNamed = (text) => [...new Set([...text.matchAll(/scripts\/([\w-]+\.mjs)/g)].map((m) => m[1]))];

/** Ecosystem notes (`ecosystems/<name>.md`) named in a text. */
const notesNamed = (text) => [...new Set([...text.matchAll(/ecosystems\/([\w-]+\.md)/g)].map((m) => m[1]))];

test("SKILL.md has the Agent Skills frontmatter", () => {
  const text = read("SKILL.md");
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  assert.ok(fm, "SKILL.md starts with a frontmatter block");
  assert.match(fm[1], /^name: agentroster$/m);
  const desc = /^description: (.+)$/m.exec(fm[1]);
  assert.ok(desc, "frontmatter has a one-line description");
  const value = desc[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  assert.ok(value.length >= 1 && value.length <= 1024, `description is ${value.length} characters`);
});

test("SKILL.md names the four scripts a map run uses", () => {
  const named = scriptsNamed(read("SKILL.md"));
  for (const s of ["detect.mjs", "validate-coverage.mjs", "check-map.mjs", "redact-check.mjs"]) {
    assert.ok(named.includes(s), `SKILL.md names scripts/${s}`);
  }
});

test("every script named in SKILL.md, MAP.md and VALIDATION.md exists", () => {
  for (const file of ["SKILL.md", "MAP.md", "VALIDATION.md"]) {
    const named = scriptsNamed(read(file));
    if (file !== "VALIDATION.md") assert.ok(named.length > 0, `${file} names at least one script`);
    for (const s of named) assert.ok(exists(`scripts/${s}`), `${file} names scripts/${s}, which does not exist`);
  }
});

test("every ecosystem note named in MAP.md exists, and generic.md is named", () => {
  const named = notesNamed(read("MAP.md"));
  assert.ok(named.includes("generic.md"), "MAP.md names ecosystems/generic.md");
  for (const n of named) assert.ok(exists(`ecosystems/${n}`), `MAP.md names ecosystems/${n}, which does not exist`);
});

test("every ecosystem in patterns.json has a note (hand cards are covered in MAP.md)", () => {
  const patterns = JSON.parse(read("ecosystems/patterns.json")).patterns;
  const ecosystems = [...new Set(patterns.map((p) => p.ecosystem))].filter((e) => e !== "roster");
  assert.ok(ecosystems.length > 0);
  const named = notesNamed(read("MAP.md"));
  for (const e of ecosystems) {
    assert.ok(exists(`ecosystems/${e}.md`), `no note for ecosystem "${e}"`);
    assert.ok(named.includes(`${e}.md`), `MAP.md does not name ecosystems/${e}.md`);
  }
  assert.match(read("MAP.md"), /\.roster\.json/, "MAP.md covers hand-written roster cards");
});

test("each ecosystem note is under 150 lines and has the four parts", () => {
  const notes = fs.readdirSync(path.join(skill, "ecosystems")).filter((n) => n.endsWith(".md"));
  assert.ok(notes.includes("generic.md"));
  for (const n of notes) {
    const text = read(`ecosystems/${n}`);
    const lines = text.split("\n").length;
    assert.ok(lines < 150, `${n} has ${lines} lines`);
    for (const part of [/^## How to spot it/m, /^## Where things live/m, /^## Agent or workflow/m, /^## Traps/m]) {
      assert.match(text, part, `${n} is missing ${part}`);
    }
  }
});

test("MAP.md shows the eight map.md headings in the order check-map.mjs expects", () => {
  const text = read("MAP.md");
  const fenced = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    const h2 = inFence ? /^## (.+?)\s*$/.exec(line) : null;
    if (h2) fenced.push(h2[1]);
  }
  assert.deepEqual(fenced, MAP_SECTIONS);
});

test("MAP.md gives the order of checks after writing", () => {
  const text = read("MAP.md");
  const at = (s) => text.indexOf(`scripts/${s}`);
  assert.ok(at("validate-coverage.mjs") >= 0 && at("check-map.mjs") >= 0 && at("redact-check.mjs") >= 0);
  assert.ok(at("validate-coverage.mjs") < at("check-map.mjs"), "validate-coverage before check-map");
  assert.ok(at("check-map.mjs") < at("redact-check.mjs"), "check-map before redact-check");
});

test("no skill file links into the internal folder", () => {
  for (const f of markdownFiles()) {
    assert.doesNotMatch(read(f), /\.local\//, `${f} names .local/`);
  }
});

test("SKILL.md's secret file list matches what detect.mjs never opens", () => {
  const text = read("SKILL.md");
  const names = [
    ".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "*.kdbx",
    "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa",
    ".netrc", ".npmrc", ".pypirc", ".pgpass", ".ssh/", '"secret"', '"credential"',
  ];
  for (const n of names) assert.ok(text.includes(n), `SKILL.md does not list ${n}`);
});

test("the CrewAI note makes an agent with no tools a workflow", () => {
  assert.match(read("ecosystems/crewai.md"), /no tools and no delegation[\s\S]{0,120}kind\s+`workflow`/);
});

test("the Claude Code note lists CLAUDE.md as context unless omitClaudeMd is set", () => {
  assert.match(read("ecosystems/claude-code.md"), /omitClaudeMd: true/);
});

test("MAP.md gives the id order, starting from a hand card's id", () => {
  assert.match(read("MAP.md"), /1\. a hand card's `id`;\s+2\. a `name` field/);
});

test("no note calls a single fixed model call an agent", () => {
  for (const f of markdownFiles()) {
    assert.doesNotMatch(read(f), /even with no tools|kind agent\), but the model chooses nothing|kind agent, that chooses nothing/, f);
  }
});

test("SKILL.md's git-ignore check cannot run the project's git hooks or fsmonitor", () => {
  const text = read("SKILL.md");
  const lines = text.split(/\r?\n/).filter((l) => /check-ignore/.test(l));
  assert.ok(lines.length > 0, "SKILL.md has a check-ignore line");
  const joined = text.replace(/\s*\n\s*/g, " ");
  const cmd = /`(git [^`]*check-ignore[^`]*)`/.exec(joined);
  assert.ok(cmd, "the check-ignore command is in backticks");
  assert.match(cmd[1], /-c core\.fsmonitor=false/);
  assert.match(cmd[1], /-c core\.hooksPath=\/dev\/null/);
  assert.match(cmd[1], /--no-index/);
  // The same git settings as the scripts use (detect.mjs gitInvocation).
  const { args } = gitInvocation("/x", []);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c") assert.ok(cmd[1].includes(`-c ${args[i + 1]}`), `SKILL.md check-ignore has -c ${args[i + 1]}`);
  }
  // No other git command on the scanned project.
  const others = [...joined.matchAll(/`(git [^`]*)`/g)].map((m) => m[1]).filter((c) => c !== cmd[1]);
  assert.deepEqual(others, [], "SKILL.md runs no other git command");
});

test("SKILL.md lists every skip reason detect.mjs counts, and MAP.md covers submodules", async () => {
  const { listFiles } = await import("../skills/agentroster/scripts/detect.mjs");
  const keys = Object.keys(listFiles(path.join(skill, "ecosystems")).skipped);
  const text = read("SKILL.md");
  for (const k of keys) assert.ok(text.includes(`\`${k}\``), `SKILL.md does not list ${k}`);
  assert.match(read("MAP.md"), /`submodule`[\s\S]{0,200}"Skipped"[\s\S]{0,200}"Needs\s+checking"/);
});

test("MAP.md and VALIDATION.md point the agent search at the section 5 rule", () => {
  const map = read("MAP.md");
  const val = read("VALIDATION.md");
  assert.doesNotMatch(map, /Each new place is a candidate|every place that calls them/);
  assert.doesNotMatch(val, /adds each missed find as a new candidate/);
  for (const [name, text] of [["MAP.md", map], ["VALIDATION.md", val]]) {
    const n = (text.match(/When the\s+agent\s+search\s+adds\s+a\s+candidate/g) ?? []).length;
    assert.ok(n >= (name === "MAP.md" ? 3 : 1), `${name} names the rule ${n} times`);
  }
  assert.match(map, /value from config/, "MAP.md says redact-check compares config values");
});

test("README does not claim the skill never copies a secret", () => {
  assert.doesNotMatch(fs.readFileSync("README.md", "utf8"), /never copies a secret/);
});

test("CARDS.md exists and every script it names exists", () => {
  assert.ok(exists("CARDS.md"));
  for (const s of scriptsNamed(read("CARDS.md"))) assert.ok(exists(`scripts/${s}`), `scripts/${s} exists`);
  for (const n of notesNamed(read("CARDS.md"))) assert.ok(exists(`ecosystems/${n}`), `ecosystems/${n} exists`);
});

test("CARDS.md names the card-view extension exactly as check-cards.mjs exports it", async () => {
  const { CARD_VIEW_NS } = await import("../skills/agentroster/scripts/check-cards.mjs");
  assert.ok(read("CARDS.md").includes(CARD_VIEW_NS));
});

test("SKILL.md says the cards phase is built and names its scripts", () => {
  const text = read("SKILL.md");
  assert.match(text, /^\| Cards \|[^\n]*\| yes \|$/m);
  for (const s of ["validate-card.mjs", "check-cards.mjs", "render-cards.mjs"]) {
    assert.ok(scriptsNamed(text).includes(s), `SKILL.md names scripts/${s}`);
  }
  assert.doesNotMatch(text, /Stop after the map and say so/);
});

test("VALIDATION.md says what the validator checks for cards", () => {
  assert.match(read("VALIDATION.md"), /^## [0-9]+\. What the validator checks \(cards\)$/m);
});

test("CARDS.md never tells the agent to use per-item evidence keys like goals.0", () => {
  assert.doesNotMatch(read("CARDS.md"), /goals\.0/);
});

test("MAP.md puts the prompt's role text before the file name in the id order", () => {
  const text = read("MAP.md");
  assert.match(text, /4\. the role the prompt gives the agent[^\n]*\n(?:[^\n]*\n)*?5\. (?:only then, )?the file name/);
});

test("references/types.md holds the standard's agent types section, word for word", () => {
  const section = (text) => {
    const start = text.indexOf("## 1. Agent types");
    assert.ok(start >= 0, "has the Agent types heading");
    const end = text.indexOf("\n## 2.", start);
    return (end === -1 ? text.slice(start) : text.slice(start, end)).trim();
  };
  const spec = fs.readFileSync("spec/roster-card-standard-v0.2.md", "utf8");
  assert.equal(section(read("references/types.md")), section(spec));
});

test("CARDS.md points to references/types.md where the type is chosen", () => {
  assert.match(read("CARDS.md"), /references\/types\.md/);
});

test("CARDS.md says what role holds for an agent and for a workflow", () => {
  const text = read("CARDS.md");
  const at = text.indexOf("**`role`");
  assert.ok(at >= 0, "CARDS.md has a bullet about role");
  const bullet = text.slice(at, text.indexOf("\n- **", at + 1));
  assert.match(bullet, /For an agent/);
  assert.match(bullet, /For a workflow/);
  assert.match(bullet, /plain code/);
});

test("CARDS.md says io holds media types, as A2A does", () => {
  const text = read("CARDS.md");
  const at = text.indexOf("**`io.in` and `io.out`");
  assert.ok(at >= 0, "CARDS.md has a bullet about io");
  const bullet = text.slice(at, text.indexOf("\n- **", at + 1));
  assert.match(bullet, /text\/plain/);
  assert.match(bullet, /application\/json/);
  assert.match(bullet, /trigger/);
});

test("CARDS.md asks for evidence for the name", () => {
  assert.match(read("CARDS.md"), /\*\*`name`\*\*[\s\S]{0,200}evidence/);
});

test("CARDS.md says which files are source files", () => {
  const text = read("CARDS.md");
  const at = text.indexOf("**`source.files`");
  assert.ok(at >= 0, "CARDS.md has a bullet about source.files");
  const bullet = text.slice(at, text.indexOf("\n- **", at + 1));
  assert.match(bullet, /built/);
  assert.match(bullet, /prompt/);
  assert.match(bullet.replace(/\s+/g, " "), /starts? (it|a workflow)/);
  assert.match(bullet, /shared/);
  assert.match(bullet, /package\.json/);
});

test("the MCP and Claude Code notes say MCP tools go in tools.mcp only", () => {
  for (const file of ["ecosystems/mcp.md", "ecosystems/claude-code.md", "ecosystems/claude-agent-sdk.md"]) {
    const text = read(file);
    assert.match(text, /`tools\.mcp`[^\n]*(\n[^\n]*){0,3}tool names/, file);
    assert.match(text, /not (also )?in `tools\.allow`/, file);
    assert.match(text, /server name/, file);
  }
});

test("the example cards keep MCP tools out of tools.allow", () => {
  const doc = JSON.parse(fs.readFileSync(new URL("../examples/roster.example.json", import.meta.url), "utf8"));
  for (const c of doc.cards) assert.ok(!c.tools.allow.some((t) => t.startsWith("mcp__")), c.id);
});

test("no skill file sends the model to spec/ or examples/, which are not installed with the skill", () => {
  const files = fs.readdirSync(skill, { recursive: true }).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const lines = read(f).split("\n").filter((l) => /`(spec|examples)\/[^`]+\.(md|json)`/.test(l));
    const allowed = f === path.join("references", "types.md") ? lines.filter((l) => !/^A copy of/.test(l)) : lines;
    assert.deepEqual(allowed, [], f);
  }
});

test("MAP.md id order: a function counts only when it builds and returns the agent", () => {
  const text = read("MAP.md");
  assert.match(text, /builds and returns it/);
  assert.match(text, /only runs the agent/);
  assert.match(text, /`build_help_desk_crew\(\)` gives\s+`help-desk-crew`/);
});

test("Agent SDK notes: user settings load by default, so an app agent gets unknowns on skills and context", () => {
  const text = read("ecosystems/claude-agent-sdk.md").replace(/\s+/g, " ");
  assert.match(text, /not set,? it loads the user, project and local/);
  assert.match(text, /together/);
  assert.match(text, /unknowns? on `skills` and `context`/);
  assert.match(text, /without `"user"`[^.]*no unknown/);
});

test("Claude Code notes: a developer's own user settings are a one-line note in map.md, not an unknown per card", () => {
  const text = read("ecosystems/claude-code.md").replace(/\s+/g, " ");
  assert.match(text, /user-level settings/);
  assert.match(text, /not an unknown on each card/);
  assert.match(text, /Summary/);
});

test("CARDS.md says purpose is one sentence written from every line that states the job", () => {
  const text = read("CARDS.md");
  const at = text.indexOf("**`purpose`");
  assert.ok(at >= 0, "CARDS.md has a bullet about purpose");
  const bullet = text.slice(at, text.indexOf("\n- **", at + 1)).replace(/\s+/g, " ");
  assert.match(bullet, /one sentence/);
  assert.match(bullet, /description/);
  assert.match(bullet, /docstring/);
  assert.match(bullet, /every line/);
  assert.match(bullet, /`goals`/);
});

test("CARDS.md: steps and plain_steps are for workflows, starts for any top-level card", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  assert.match(text, /`steps` and `plain_steps` are for workflows only/);
  assert.match(text, /`starts` goes on any top-level card/);
});

test("SKILL.md takes the run folder's date and taken_at from one clock reading", () => {
  assert.match(read("SKILL.md").replace(/\s+/g, " "), /one clock reading/);
});

test("CARDS.md says memory.scope is none only from a declared setting", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  const at = text.indexOf("**`memory.scope`");
  assert.ok(at >= 0, "CARDS.md has a bullet about memory.scope");
  const bullet = text.slice(at, at + 700);
  assert.match(bullet, /declared setting/);
  assert.match(bullet, /memory=False/);
  assert.match(bullet, /no memory code[^.]*`null`/i);
});

test("CARDS.md says how prompt-stated bans fill guardrails.forbidden", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  const at = text.indexOf("**`guardrails.forbidden`");
  assert.ok(at >= 0, "CARDS.md has a bullet about guardrails.forbidden");
  const bullet = text.slice(at, at + 900);
  assert.match(bullet, /one item per ban/);
  assert.match(bullet, /lower case/);
  assert.match(bullet, /"only[^"]*"[^.]*not a ban/i);
  assert.match(bullet, /never in `stated_only`/);
});

test("CARDS.md says what runtime holds, with an example", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  const at = text.indexOf("**`runtime`");
  assert.ok(at >= 0, "CARDS.md has a bullet about runtime");
  const bullet = text.slice(at, at + 700);
  assert.match(bullet, /Example:/);
  assert.match(bullet, /`runtime_name`/);
});

test("CARDS.md says where io.report comes from, with an example", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  const at = text.indexOf("**`io.report`");
  assert.ok(at >= 0, "CARDS.md has a bullet about io.report");
  const bullet = text.slice(at, at + 700);
  assert.match(bullet, /expected_output/);
  assert.match(bullet, /top-level workflow/);
  assert.match(bullet, /Example:/);
  assert.doesNotMatch(text, /apart from the goal/);
});

test("CARDS.md says what context holds, with an example", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  const at = text.indexOf("**`context`");
  assert.ok(at >= 0, "CARDS.md has a bullet about context");
  const bullet = text.slice(at, at + 600);
  assert.match(bullet, /before it begins/);
  assert.match(bullet, /tool reads during the run is not context/);
  assert.match(bullet, /Example:/);
});

test("CARDS.md says goals come only from lines marked as goals, with an example", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  const at = text.indexOf("**`goals`");
  assert.ok(at >= 0, "CARDS.md has a bullet about goals");
  const bullet = text.slice(at, at + 700);
  assert.match(bullet, /marked as goals/);
  assert.match(bullet, /goal=/);
  assert.match(bullet, /Example:/);
});

test("mcp.md says an npx or uvx server gets an unknown on tools.mcp even when tools are named", () => {
  const text = read("ecosystems/mcp.md").replace(/\s+/g, " ");
  const at = text.indexOf("**A server run with `npx` or `uvx`**");
  assert.ok(at >= 0, "mcp.md has the npx/uvx rule");
  const rule = text.slice(at, at + 600);
  assert.match(rule, /`outside-repo` unknown on `tools\.mcp`/);
  assert.match(rule, /even when the agent names its tools/);
  assert.match(rule, /Example:/);
});

test("CARDS.md says a hand card's source.files wins as written, with an example", () => {
  const text = read("CARDS.md").replace(/\s+/g, " ");
  const at = text.indexOf("## 3. Hand-written cards win");
  const section = text.slice(at, text.indexOf("## 4.", at));
  assert.match(section, /`source\.files` included/);
  assert.match(section, /Example:/);
});

// Ask, then remember (agentroster.json)

const flat = (file) => read(file).replace(/\s+/g, " ");
const repoFlat = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8").replace(/\s+/g, " ");

test("SKILL.md setup reads and validates agentroster.json; an invalid file stops the run", () => {
  const t = flat("SKILL.md");
  const setup = t.slice(t.indexOf("## Step 1: setup"), t.indexOf("## Step 2"));
  assert.match(setup, /agentroster\.json/);
  assert.match(setup, /validate-answers\.mjs/);
  assert.match(setup, /invalid[^.]*stop/i);
});

test("SKILL.md has an ask step after the cards with the save question and when not to ask", () => {
  const t = flat("SKILL.md");
  const at = t.indexOf("## Step 6: ask");
  assert.ok(at > t.indexOf("## Step 5: the cards"), "an ask step comes after the cards");
  const step = t.slice(at, t.indexOf("## Step 7"));
  assert.match(step, /below `high`/);
  assert.match(step, /runner-up/);
  assert.match(step, /Save these answers to `agentroster\.json`/);
  assert.match(step, /only (on|after) (a|the user's) yes/i);
  assert.match(step, /said not to ask/);
  assert.match(step, /no person/);
  assert.match(step, /Example:/);
});

test("SKILL.md says the only project write is agentroster.json, and how to change an answer", () => {
  const t = flat("SKILL.md");
  assert.match(t, /The only file you write in the project is `agentroster\.json`, and only after the user says yes/);
  assert.match(t, /edit `agentroster\.json`|edit the file/i);
  assert.match(t, /asked, answered, saved and still to confirm/);
});

test("SKILL.md lists validate-answers.mjs among the scripts", () => {
  assert.match(read("SKILL.md"), /node <skill>\/scripts\/validate-answers\.mjs <project>\/agentroster\.json/);
});

test("CARDS.md says how to record the judgement and how to apply stored answers", () => {
  const t = flat("CARDS.md");
  const j = t.slice(t.indexOf("**`judgement`"));
  assert.ok(t.includes("**`judgement`"), "CARDS.md has a judgement bullet");
  assert.match(j.slice(0, 900), /`high`[^.]*one type fits/);
  assert.match(j.slice(0, 900), /Example:/);
  const a = t.slice(t.indexOf("**Stored answers"));
  assert.ok(t.includes("**Stored answers"), "CARDS.md has a stored answers bullet");
  assert.match(a.slice(0, 900), /`"value"` line/);
  assert.match(a.slice(0, 900), /hand card wins/i);
  assert.match(a.slice(0, 900), /Example:/);
  assert.match(t, /### Stored answers/);
  assert.match(t, /### To confirm/);
  assert.match(t, /under "Needs checking"/);
});

test("VALIDATION.md's cards checklist covers stored answers and the judgement", () => {
  const t = flat("VALIDATION.md");
  const cards = t.slice(t.indexOf("## 3. What the validator checks (cards)"), t.indexOf("## 4."));
  assert.match(cards, /agentroster\.json/);
  assert.match(cards, /judgement/);
});

test("README, CLAUDE.md and CONTRIBUTING name agentroster.json as the one file written in a project", () => {
  for (const file of ["README.md", "CLAUDE.md", "CONTRIBUTING.md"]) {
    assert.match(repoFlat(file), /agentroster\.json/, file);
  }
  assert.doesNotMatch(repoFlat("README.md"), /never edits your files\./);
});

test("CARDS.md says a goal line is not an output format", () => {
  const t = read("CARDS.md").replace(/\s+/g, " ");
  const bullet = t.slice(t.indexOf("**`io.report`"), t.indexOf("**`io.report`") + 900);
  assert.match(bullet, /A goal line is not a format/);
});

test("SKILL.md's ask step applies every saved answer, kept or changed, after saving", () => {
  const t = read("SKILL.md").replace(/\s+/g, " ");
  const step = t.slice(t.indexOf("## Step 6: ask"), t.indexOf("## Step 7"));
  assert.match(step, /apply every saved answer, kept or changed/i);
  assert.ok(step.indexOf("Save these answers") < step.indexOf("apply every saved answer"), "apply comes after the save question");
});

test("SKILL.md's ask step asks again about a stale stored answer, with the old value as default", () => {
  const t = read("SKILL.md").replace(/\s+/g, " ");
  const step = t.slice(t.indexOf("## Step 6: ask"), t.indexOf("## Step 7"));
  assert.match(step, /stale stored answer/);
  assert.match(step, /stored value as the default/);
});

test("CARDS.md and the answers spec say a card keeps the answer a hand card overrides", () => {
  const cards = read("CARDS.md").replace(/\s+/g, " ");
  assert.match(cards, /A hand card wins over an answer; the card still lists the answer's `"value"` line in its type evidence, after the hand card/);
  const spec = fs.readFileSync(path.join(process.cwd(), "spec/answers-file-v0.1.md"), "utf8").replace(/\s+/g, " ");
  assert.match(spec, /the card still records the answer/);
});
