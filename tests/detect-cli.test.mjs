import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = path.join(import.meta.dirname, "..", "skills", "agentroster", "scripts", "detect.mjs");
const USAGE = "usage: detect.mjs <project-dir> [--out <file>] [--exclude <dir>]...";
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

function project() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  fs.mkdirSync(path.join(d, "out"));
  fs.writeFileSync(path.join(d, "a.py"), "import anthropic\n");
  fs.writeFileSync(path.join(d, "out", "b.py"), "import openai\n");
  return d;
}

test("prints JSON with two-space indent and a final newline", () => {
  const d = project();
  const r = run(d);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.endsWith("}\n"));
  const doc = JSON.parse(r.stdout);
  assert.equal(r.stdout, JSON.stringify(doc, null, 2) + "\n");
  assert.equal(doc.detect, "0.1");
  assert.equal(doc.candidates.length, 2);
  fs.rmSync(d, { recursive: true, force: true });
});

test("--exclude skips a folder and counts it as run_folder", () => {
  const d = project();
  const doc = JSON.parse(run(d, "--exclude", "out").stdout);
  assert.deepEqual(doc.candidates.map((c) => c.file), ["a.py"]);
  assert.equal(doc.skipped.run_folder, 1);
  fs.rmSync(d, { recursive: true, force: true });
});

test("--out writes the same JSON as stdout", () => {
  const d = project();
  const f = path.join(d, "..", `${path.basename(d)}-detect.json`);
  const viaStdout = run(d).stdout;
  const r = run(d, "--out", f);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(fs.readFileSync(f, "utf8"), viaStdout);
  fs.rmSync(f, { force: true });
  fs.rmSync(d, { recursive: true, force: true });
});

test("two runs give byte-identical output", () => {
  const d = project();
  assert.equal(run(d).stdout, run(d).stdout);
  fs.rmSync(d, { recursive: true, force: true });
});

test("a missing folder exits 2 and names the reason", () => {
  const d = path.join(os.tmpdir(), "agentroster-does-not-exist");
  const r = run(d);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), `cannot read ${d} (not found)`);
  assert.equal(r.stdout, "");
});

test("no arguments, an unknown option or a missing value exit 2 with usage", () => {
  for (const args of [[], ["--bogus", "x"], ["a", "b"], [os.tmpdir(), "--out"], [os.tmpdir(), "--exclude"]]) {
    const r = run(...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.equal(r.stderr.trim(), USAGE);
  }
});
