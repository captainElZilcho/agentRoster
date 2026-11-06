import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findLeaks, readEnvValues } from "../skills/agentroster/scripts/redact-check.mjs";

const script = "skills/agentroster/scripts/redact-check.mjs";
const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), encoding: "utf8" });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
const put = (root, rel, text) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

// Secret-shaped values are built at run time so no literal secret sits in this file.
const shapes = {
  "sk-": "sk-FAKE-redact-0001-abcdefgh",
  ghp_: "ghp_" + "FAKE".repeat(9),
  github_pat_: "github_pat_" + "FAKE_redact_0001_abcdef",
  AKIA: "AKIA" + "FAKEFAKE" + "12345678",
  xox: "xoxb-" + "FAKE-redact-0001",
  AIza: "AIza" + "FAKE".repeat(8) + "abc",
  pem: "-----BEGIN " + "RSA PRIVATE KEY-----",
};

for (const [name, value] of Object.entries(shapes)) {
  test(`finds the ${name} shape on the right line`, () => {
    const leaks = findLeaks([{ path: "a.md", text: `one\ntwo ${value} end\nthree` }], []);
    assert.deepEqual(leaks, [{ file: "a.md", line: 2, kind: "secret-shaped" }]);
    assert.ok(!JSON.stringify(leaks).includes(value));
  });
}

test("no secrets gives an empty list", () => {
  assert.deepEqual(findLeaks([{ path: "a.md", text: "just words\nsk-short" }], []), []);
});

test("a .env value in text is found as value from .env", () => {
  const value = "hunter-FAKE-value-99";
  const leaks = findLeaks([{ path: "map.md", text: `x\nuses ${value} here` }], [value]);
  assert.deepEqual(leaks, [{ file: "map.md", line: 2, kind: "value from .env" }]);
});

test("short env values are ignored", () => {
  assert.deepEqual(findLeaks([{ path: "m.md", text: "DEBUG=1 and 1234567" }], ["1", "1234567"]), []);
});

test("leaks are sorted by file then line", () => {
  const v = shapes["sk-"];
  const leaks = findLeaks(
    [{ path: "b.md", text: v }, { path: "a.md", text: `x\n${v}\n${v}` }],
    [],
  );
  assert.deepEqual(leaks.map((l) => `${l.file}:${l.line}`), ["a.md:2", "a.md:3", "b.md:1"]);
});

test("readEnvValues reads .env and .env.* below the root, skips junk folders and links", () => {
  const root = tmp();
  put(root, ".env", 'A=FAKE-value-one\nB="FAKE-value-two"\nC=short\n# D=FAKE-comment-value\nexport E=\'FAKE-value-three\'\n');
  put(root, "sub/.ENV.local", "F=FAKE-value-four\n");
  put(root, "node_modules/x/.env", "G=FAKE-skipped-value\n");
  put(root, ".agentroster/r/.env", "H=FAKE-skipped-value2\n");
  const outside = tmp();
  put(outside, ".env", "I=FAKE-outside-value\n");
  fs.symlinkSync(outside, path.join(root, "linked"));
  fs.symlinkSync(path.join(outside, ".env"), path.join(root, "sub", ".env.link"));
  const values = readEnvValues(root).sort();
  assert.deepEqual(values, ["FAKE-value-four", "FAKE-value-one", "FAKE-value-three", "FAKE-value-two"]);
});

test("readEnvValues gives [] when there is no .env", () => {
  assert.deepEqual(readEnvValues(tmp()), []);
});

test("CLI: a leak gives exit 1 and never prints the value", () => {
  const dir = tmp();
  const value = shapes["sk-"];
  put(dir, "map.md", `ok\nkey ${value}\n`);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: map.md:2 (secret-shaped)\nleaks: 1\n");
  assert.ok(!r.stdout.includes(value) && !r.stderr.includes(value));
});

test("CLI: clean run gives exit 0", () => {
  const dir = tmp();
  put(dir, "map.md", "nothing here\n");
  put(dir, "cards/a.md", "nor here\n");
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "clean: 2 files\n");
});

test("CLI: --project compares against .env values without printing them", () => {
  const dir = tmp();
  const project = tmp();
  const value = "hunter-FAKE-value-99";
  put(project, ".env", `TOKEN=${value}\n`);
  put(dir, "map.md", `uses ${value}\n`);
  const r = run(dir, "--project", project);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: map.md:1 (value from .env)\nleaks: 1\n");
  assert.ok(!r.stdout.includes(value) && !r.stderr.includes(value));
});

test("CLI: missing run folder gives exit 2", () => {
  const dir = path.join(tmp(), "nope");
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), `cannot read ${dir} (not found)`);
});

test("CLI: a file given as the run folder gives exit 2", () => {
  const dir = tmp();
  put(dir, "f.md", "x");
  const r = run(path.join(dir, "f.md"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read .*f\.md \(is not a folder\)/);
});

test("CLI: usage error gives exit 2", () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: redact-check\.mjs/);
});

test("CLI: symbolic links in the run folder are not followed", () => {
  const dir = tmp();
  const outside = tmp();
  put(outside, "leak.md", shapes["sk-"]);
  put(dir, "map.md", "fine\n");
  fs.symlinkSync(outside, path.join(dir, "linkdir"));
  fs.symlinkSync(path.join(outside, "leak.md"), path.join(dir, "linkfile.md"));
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "clean: 1 files\n");
});

test("CLI: files named like secrets and git-ignored run folders are still scanned", () => {
  const project = tmp();
  spawnSync("git", ["init", "-q"], { cwd: project });
  put(project, ".gitignore", ".agentroster/\n");
  const dir = path.join(project, ".agentroster", "run-1");
  put(dir, "secrets.md", `key ${shapes.ghp_}\n`);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: secrets.md:1 (secret-shaped)\nleaks: 1\n");
});

test("CLI: binary files are skipped without error", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "x.bin"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(shapes["sk-"])]));
  put(dir, "map.md", "fine\n");
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "clean: 2 files\n");
});
