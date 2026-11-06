import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkMap, MAP_SECTIONS } from "../skills/agentroster/scripts/check-map.mjs";

const script = "skills/agentroster/scripts/check-map.mjs";
const fixture = (name) => ({
  map: fs.readFileSync(`tests/fixtures/map/${name}/map.md`, "utf8"),
  coverage: JSON.parse(fs.readFileSync(`tests/fixtures/map/${name}/coverage.json`, "utf8")),
});
const check = (name, edit = (m) => m) => {
  const f = fixture(name);
  return checkMap(edit(f.map), f.coverage);
};
const run = (dir) => spawnSync(process.execPath, [script, dir], { cwd: process.cwd(), encoding: "utf8" });

test("MAP_SECTIONS lists the eight headings in order", () => {
  assert.deepEqual(MAP_SECTIONS, [
    "Summary", "Inventory", "Agents and workflows", "Flow",
    "Checked, not an agent", "Unknowns", "Needs checking", "Skipped",
  ]);
});

test("ok fixture is valid (a heading inside a code fence is ignored)", () => {
  assert.deepEqual(check("ok"), { valid: true, errors: [] });
});

test("sections out of order", () => {
  assert.deepEqual(check("bad-order").errors, [
    'section "Flow" is out of order (expected after "Agents and workflows")',
  ]);
});

test("missing section", () => {
  const r = check("ok", (m) => m.replace(/## Unknowns\n\nNone\.\n\n/, ""));
  assert.deepEqual(r.errors, ['missing section "Unknowns"']);
});

test("extra level-2 heading", () => {
  const r = check("ok", (m) => m + "\n## Extras\n");
  assert.deepEqual(r.errors, ['unexpected section "Extras"']);
});

test("level-3 headings under sections are allowed", () => {
  assert.equal(check("ok", (m) => m.replace("## Flow\n", "## Flow\n\n### Detail\n")).valid, true);
});

test("id mismatch with coverage.json", () => {
  assert.deepEqual(check("id-mismatch").errors, [
    'id "ranker" is in the inventory but not in coverage.json',
    'id "critic" is in coverage.json but not in the inventory',
  ]);
});

test("bad kind", () => {
  const r = check("ok", (m) => m.replace("| `scout` | agent |", "| `scout` | tool |"));
  assert.deepEqual(r.errors, ['id "scout": kind must be "agent" or "workflow"']);
});

test("duplicate id in the inventory", () => {
  const r = check("ok", (m) => m.replace("| `ranker` | agent | agents/ranker.py |", "| `scout` | agent | agents/ranker.py |"));
  assert.ok(r.errors.includes('id "scout" is listed twice in the inventory'));
});

test("inventory id without a heading, and heading without an inventory id", () => {
  const r = check("ok", (m) => m.replace("### `ranker`", "### `judge`"));
  assert.deepEqual(r.errors, [
    'id "ranker" is in the inventory but has no heading under "Agents and workflows"',
    'id "judge" has a heading under "Agents and workflows" but is not in the inventory',
  ]);
});

test("missing inventory table", () => {
  const r = check("ok", (m) => m.replace(/\| id \| kind[^\n]*\n/, ""));
  assert.ok(r.errors.includes('section "Inventory" has no table with the header "| id | kind |"'));
});

test("unknown whose card is not in the inventory", () => {
  const f = fixture("ok");
  f.coverage.unknowns = [{ card: "ghost", field: "tools", reason: "x", detail: "x", evidence: [] }];
  assert.deepEqual(checkMap(f.map, f.coverage).errors, ['unknown "ghost.tools": card "ghost" is not in the inventory']);
});

test("CLI exit codes", () => {
  assert.equal(run("tests/fixtures/map/ok").status, 0);
  const bad = run("tests/fixtures/map/bad-order");
  assert.equal(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /section "Flow" is out of order/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    const missing = run(dir);
    assert.equal(missing.status, 2);
    assert.equal(missing.stderr.trim(), `cannot read ${path.join(dir, "map.md")} (not found)`);
    fs.copyFileSync("tests/fixtures/map/ok/map.md", path.join(dir, "map.md"));
    fs.writeFileSync(path.join(dir, "coverage.json"), '{"coverage":"0.2"}');
    const invalid = run(dir);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /coverage\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(spawnSync(process.execPath, [script], { encoding: "utf8" }).status, 2);
});
