import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { checkCards, checkQuotes, CARD_VIEW_NS } from "../skills/agentroster/scripts/check-cards.mjs";
import { inventoryIds } from "../skills/agentroster/scripts/check-map.mjs";

const dir = (name) => new URL(`./fixtures/cards-check/${name}/`, import.meta.url);
const load = (name) => ({
  roster: JSON.parse(readFileSync(new URL("roster.json", dir(name)), "utf8")),
  coverage: JSON.parse(readFileSync(new URL("coverage.json", dir(name)), "utf8")),
  map: readFileSync(new URL("map.md", dir(name)), "utf8"),
});
const run = (f) => checkCards(f.roster, f.coverage, f.map);
const has = (result, message) =>
  assert.ok(result.errors.includes(message), `expected "${message}"\ngot ${JSON.stringify(result.errors, null, 1)}`);
const card = (f, id) => f.roster.cards.find((c) => c.id === id);
const PROJECT = new URL("./fixtures/cards-check/ok-project/", import.meta.url).pathname;
const readProject = (rel) => { try { return readFileSync(path.join(PROJECT, rel), "utf8"); } catch { return null; } };
const quotes = (f) => checkQuotes(f.roster, f.coverage, readProject).errors;
const SCRIPT = new URL("../skills/agentroster/scripts/check-cards.mjs", import.meta.url).pathname;

test("the namespace constant is the card-view extension name", () => {
  assert.equal(CARD_VIEW_NS, "io.github.captainelzilcho.agentroster.card-view/v1");
});

test("inventoryIds reads the ids from map.md's inventory table", () => {
  assert.deepEqual(inventoryIds(load("ok").map), ["daily-digest", "fetcher"]);
});

test("the ok fixture passes", () => {
  assert.deepEqual(run(load("ok")), { valid: true, errors: [] });
});

test("a run with no agents anywhere passes", () => {
  assert.deepEqual(run(load("empty")), { valid: true, errors: [] });
});

test("an id in the roster but not in the map or coverage is reported", () => {
  const f = load("ok");
  card(f, "fetcher").id = "fetch-notes";
  card(f, "daily-digest").extensions[CARD_VIEW_NS].steps = ["fetch-notes"];
  const r = run(f);
  assert.equal(r.valid, false);
  has(r, 'id "fetch-notes" is in roster.json but not in map.md');
  has(r, 'id "fetch-notes" is in roster.json but not in coverage.json');
  has(r, 'id "fetcher" is in map.md but not in roster.json');
  has(r, 'id "fetcher" is in coverage.json but not in roster.json');
});

test("a filled field with no evidence is reported", () => {
  const f = load("ok");
  delete card(f, "fetcher").evidence["guardrails.limits.turns"];
  has(run(f), 'card "fetcher": guardrails.limits.turns is filled but has no evidence');
});

test("evidence under a parent or child path counts", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.evidence["guardrails.limits"] = c.evidence["guardrails.limits.turns"];
  delete c.evidence["guardrails.limits.turns"];
  assert.equal(run(f).valid, true);
});

test("an evidence key that is not a field on the card is reported", () => {
  const f = load("ok");
  card(f, "fetcher").evidence["guardrails.speed"] = card(f, "fetcher").evidence.purpose;
  has(run(f), 'card "fetcher": evidence key "guardrails.speed" is not a field on the card');
});

test("an evidence path that is absolute, uses backslashes or climbs out is reported", () => {
  for (const file of ["/app/fetcher.py", "app\\fetcher.py", "../app/fetcher.py"]) {
    const f = load("ok");
    card(f, "fetcher").evidence.purpose[0].file = file;
    has(run(f), `card "fetcher": evidence path "${file}" must be relative with forward slashes`);
  }
});

test("a field with an unknown in coverage must stay empty on its card", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.instructions = "prompts/fetcher.md";
  c.evidence.instructions = c.evidence.purpose;
  has(run(f), 'card "fetcher": instructions has an unknown in coverage.json but is filled');
});

test("a step in the card-view extension must report to that workflow", () => {
  const f = load("ok");
  card(f, "daily-digest").extensions[CARD_VIEW_NS].steps = ["fetcher", "daily-digest"];
  has(run(f), 'card "daily-digest": step "daily-digest" does not report to it');
});

test("a filled card-view field needs evidence inside the extension", () => {
  const f = load("ok");
  delete card(f, "daily-digest").extensions[CARD_VIEW_NS].evidence.starts;
  has(run(f), `card "daily-digest": extensions.${CARD_VIEW_NS}.starts is filled but has no evidence`);
});

test("errors come out sorted and without duplicates", () => {
  const f = load("ok");
  delete card(f, "fetcher").evidence.purpose;
  delete card(f, "daily-digest").evidence.purpose;
  const r = run(f);
  assert.deepEqual(r.errors, [...new Set(r.errors)].sort());
});

function cli(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("CLI: ok exits 0", () => {
  const r = cli([dir("ok").pathname, "--project", PROJECT]);
  assert.equal(r.code, 0, r.out + r.err);
});

test("CLI: problems exit 1 with one line each on stdout", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    cpSync(dir("ok").pathname, tmp, { recursive: true });
    const p = path.join(tmp, "roster.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    delete doc.cards[1].evidence["engine.model"];
    writeFileSync(p, JSON.stringify(doc));
    const r = cli([tmp, "--project", PROJECT]);
    assert.equal(r.code, 1);
    assert.match(r.out, /card "fetcher": engine\.model is filled but has no evidence/);
    assert.equal(r.err, "");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI: a missing file exits 2 in plain words", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    const r = cli([tmp, "--project", PROJECT]);
    assert.equal(r.code, 2);
    assert.equal(r.err.trim(), `cannot read ${path.join(tmp, "roster.json")} (not found)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI: an invalid roster exits 2", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    cpSync(dir("ok").pathname, tmp, { recursive: true });
    writeFileSync(path.join(tmp, "roster.json"), JSON.stringify({ roster_file: "0.1" }));
    const r = cli([tmp, "--project", PROJECT]);
    assert.equal(r.code, 2);
    assert.match(r.err, /invalid roster\.json/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI: no argument prints the usage line and exits 2", () => {
  const r = cli([]);
  assert.equal(r.code, 2);
  assert.equal(r.err.trim(), "usage: check-cards.mjs <run-dir> --project <dir>");
  assert.equal(cli([dir("ok").pathname]).code, 2);
});

test("an unknown on a list field allows the known items (the list may be incomplete)", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.tools.mcp = ["mcp__notes__search"];
  c.evidence["tools.mcp"] = c.evidence["tools.allow"];
  f.coverage.unknowns.push({ card: "fetcher", field: "tools.mcp", reason: "outside-repo", detail: "The server is a package.", evidence: c.evidence["tools.allow"] });
  f.coverage.summary.unknowns = 2;
  assert.deepEqual(run(f).errors, []);
});

test("io values must be media types like text/plain", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.io.in = ["text"];
  c.io.out = ["application/json"];
  c.evidence["io.in"] = c.evidence.role;
  c.evidence["io.out"] = c.evidence.role;
  const r = run(f);
  has(r, 'card "fetcher": io.in "text" is not a media type like "text/plain"');
  assert.ok(!r.errors.some((e) => e.includes("io.out")));
});

test("the name needs evidence like any other filled value", () => {
  const f = load("ok");
  delete card(f, "fetcher").evidence.name;
  has(run(f), 'card "fetcher": name is filled but has no evidence');
});

test("a file that starts a workflow must be in its source files", () => {
  const f = load("ok");
  const ext = card(f, "daily-digest").extensions[CARD_VIEW_NS];
  ext.evidence.starts = [{ file: "app/scheduler.py", line: 9, quote: 'add_job(run, "cron", hour=7)', found_by: "agent" }];
  has(run(f), 'card "daily-digest": app/scheduler.py starts it but is not in source.files');
  card(f, "daily-digest").source.files.push({ path: "app/scheduler.py", line: 9 });
  assert.ok(!run(f).errors.some((e) => e.includes("source.files")));
});

test("an MCP tool name in tools.allow is reported; it belongs in tools.mcp", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.tools.allow = [...c.tools.allow, "mcp__issues__get_issue"];
  c.evidence["tools.allow"] = c.evidence["tools.allow"] ?? c.evidence.role;
  has(run(f), 'card "fetcher": tools.allow has the MCP tool "mcp__issues__get_issue"; put it in tools.mcp');
});

test("every quote in the ok fixture is on its cited line", () => {
  assert.deepEqual(quotes(load("ok")), []);
});

test("a quote that is not on its cited line is reported", () => {
  const f = load("ok");
  card(f, "fetcher").evidence.purpose[0].line = 3;
  assert.deepEqual(quotes(f), ['card "fetcher": purpose evidence: app/fetcher.py:3 does not contain "\"\"\"Fetcher: finds today\'s notes.\"\"\""']);
});

test("a quote may be part of the line, with spaces collapsed", () => {
  const f = load("ok");
  card(f, "fetcher").evidence.name[0].quote = "fetcher   =";
  assert.deepEqual(quotes(f), []);
});

test("a quote with [redacted] matches the pieces around it, in order", () => {
  const f = load("ok");
  const e = card(f, "fetcher").evidence["engine.model"][0];
  e.quote = 'MODEL = "[redacted]"';
  assert.deepEqual(quotes(f), []);
  e.quote = '"[redacted]" MODEL =';
  assert.equal(quotes(f).length, 1);
});

test("a missing file and a line past the end are reported; a whole-file item needs only the file", () => {
  const f = load("ok");
  const ev = card(f, "fetcher").evidence;
  ev.purpose[0] = { ...ev.purpose[0], file: "app/gone.py" };
  ev.name[0] = { ...ev.name[0], line: 99 };
  ev.role.push({ file: "app/digest.py", line: null, quote: "digest.py", found_by: "agent" });
  assert.deepEqual(quotes(f), [
    'card "fetcher": name evidence: app/fetcher.py:99 is past the end of the file',
    'card "fetcher": purpose evidence: app/gone.py is not in the project',
  ]);
});

test("card-view evidence and coverage unknowns are checked too", () => {
  const f = load("ok");
  card(f, "daily-digest").extensions[CARD_VIEW_NS].evidence.starts[0].line = 4;
  f.coverage.unknowns[0].evidence[0].line = 11;
  assert.deepEqual(quotes(f), [
    'card "daily-digest": card view starts evidence: app/digest.py:4 does not contain "# run by cron at 07:00"',
    'unknown "fetcher" instructions: evidence: app/fetcher.py:11 does not contain "system = load_prompt(\"fetcher\")"',
  ]);
});

test("an unsafe evidence path is never read", () => {
  const f = load("ok");
  card(f, "fetcher").evidence.purpose[0].file = "../secrets.txt";
  const seen = [];
  checkQuotes(f.roster, f.coverage, (rel) => { seen.push(rel); return null; });
  assert.ok(!seen.includes("../secrets.txt"));
});

test("CLI: a wrong line exits 1; a missing project folder exits 2", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    cpSync(dir("ok").pathname, tmp, { recursive: true });
    const p = path.join(tmp, "roster.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    doc.cards.find((c) => c.id === "fetcher").evidence.purpose[0].line = 3;
    writeFileSync(p, JSON.stringify(doc));
    const r = cli([tmp, "--project", PROJECT]);
    assert.equal(r.code, 1);
    assert.match(r.out, /purpose evidence: app\/fetcher\.py:3 does not contain/);
    const m = cli([tmp, "--project", path.join(tmp, "no-such-project")]);
    assert.equal(m.code, 2);
    assert.match(m.err, /project folder .*\(not found\)/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("steps and plain_steps are for workflows only", () => {
  const f = load("ok");
  card(f, "fetcher").extensions[CARD_VIEW_NS] = { plain_steps: 0, steps: [], evidence: { plain_steps: card(f, "fetcher").evidence.role } };
  has(run(f), `card "fetcher": extensions.${CARD_VIEW_NS}.plain_steps is for workflows only`);
});

test("starts goes only on a top-level card; a card that reports to another is started by it", () => {
  const f = load("ok");
  card(f, "fetcher").extensions[CARD_VIEW_NS] = { starts: ["on demand"], evidence: { starts: [{ file: "app/fetcher.py", line: 12, quote: "fetcher = Agent(", found_by: "agent" }] } };
  has(run(f), 'card "fetcher": starts is only for a top-level card; it reports to "daily-digest"');
  card(f, "fetcher").org.reports_to = null;
  assert.ok(!run(f).errors.some((e) => e.includes("top-level")));
});

test("roster.json's snapshot must equal coverage.json's", () => {
  const f = load("ok");
  f.roster.snapshot = { ...f.roster.snapshot, taken_at: "2026-11-08T01:00:00Z" };
  has(run(f), "roster.json's snapshot differs from coverage.json's: copy it from coverage.json");
});
