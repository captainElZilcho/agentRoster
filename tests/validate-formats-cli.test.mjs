import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = "skills/agentroster/scripts/validate-findings.mjs";
const good = "tests/fixtures/findings/valid/first-run.json";

function run(args, file = script) {
  return spawnSync(process.execPath, [file, ...args], { cwd: process.cwd(), encoding: "utf8" });
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const badDoc = () => {
  const doc = JSON.parse(fs.readFileSync(good, "utf8"));
  doc.entries[0].fix = null;
  doc.entries[0].decide = null;
  return doc;
};

test("findings: a valid file prints ok and exits 0", () => {
  const r = run([good]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `ok ${good}\n`);
});

test("findings: valid and invalid files exit 1 with ok, fail and the error", () => {
  withTempDir((dir) => {
    const bad = path.join(dir, "bad.json");
    const doc = JSON.parse(fs.readFileSync(good, "utf8"));
    doc.entries[0].fix = null;
    fs.writeFileSync(bad, JSON.stringify(doc));
    const r = run([good, bad]);
    assert.equal(r.status, 1);
    const lines = r.stdout.split("\n");
    assert.equal(lines[0], `ok ${good}`);
    assert.equal(lines[1], `fail ${bad}`);
    assert.match(lines[2], /^ {2}\/entries\/0: needs a fix or a decide when result is "fail"$/);
  });
});

test("findings: a missing file exits 2", () => {
  const r = run(["no-such-file.json"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^cannot read no-such-file\.json: ENOENT\n/);
});

test("findings: invalid JSON exits 2", () => {
  withTempDir((dir) => {
    const f = path.join(dir, "broken.json");
    fs.writeFileSync(f, "{ nope");
    const r = run([f]);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.startsWith(`not valid JSON: ${f}`));
  });
});

test("findings: no arguments print usage and exit 2", () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, "usage: validate-findings.mjs <findings.json> [...]\n");
});

test("findings: a file with a BOM passes", () => {
  withTempDir((dir) => {
    const f = path.join(dir, "bom.json");
    fs.writeFileSync(f, "﻿" + fs.readFileSync(good, "utf8"));
    const r = run([f]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, `ok ${f}\n`);
  });
});

test("findings: running through a symlink still validates", () => {
  withTempDir((dir) => {
    const link = path.join(dir, "link.mjs");
    fs.symlinkSync(path.resolve(script), link);
    const ok = run([good], link);
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout, `ok ${good}\n`);
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, JSON.stringify(badDoc()));
    assert.equal(run([bad], link).status, 1);
  });
});

// validate-coverage

const covScript = "skills/agentroster/scripts/validate-coverage.mjs";
const covGood = "tests/fixtures/coverage/valid/typical.json";

const covBadDoc = () => {
  const doc = JSON.parse(fs.readFileSync(covGood, "utf8"));
  doc.candidates[0].reason = "Looked odd.";
  return doc;
};

test("coverage: a valid file prints ok and exits 0", () => {
  const r = run([covGood], covScript);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `ok ${covGood}\n`);
});

test("coverage: valid and invalid files exit 1 with ok, fail and the error", () => {
  withTempDir((dir) => {
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, JSON.stringify(covBadDoc()));
    const r = run([covGood, bad], covScript);
    assert.equal(r.status, 1);
    const lines = r.stdout.split("\n");
    assert.equal(lines[0], `ok ${covGood}`);
    assert.equal(lines[1], `fail ${bad}`);
    assert.match(lines[2], /^ {2}\/candidates\/0\/reason: must be null when status is "read"$/);
  });
});

test("coverage: a missing file exits 2", () => {
  const r = run(["no-such-file.json"], covScript);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^cannot read no-such-file\.json: ENOENT\n/);
});

test("coverage: invalid JSON exits 2", () => {
  withTempDir((dir) => {
    const f = path.join(dir, "broken.json");
    fs.writeFileSync(f, "{ nope");
    const r = run([f], covScript);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.startsWith(`not valid JSON: ${f}`));
  });
});

test("coverage: no arguments print usage and exit 2", () => {
  const r = run([], covScript);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, "usage: validate-coverage.mjs <coverage.json> [...]\n");
});

test("coverage: a file with a BOM passes", () => {
  withTempDir((dir) => {
    const f = path.join(dir, "bom.json");
    fs.writeFileSync(f, "﻿" + fs.readFileSync(covGood, "utf8"));
    const r = run([f], covScript);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, `ok ${f}\n`);
  });
});

test("coverage: running through a symlink still validates", () => {
  withTempDir((dir) => {
    const link = path.join(dir, "link.mjs");
    fs.symlinkSync(path.resolve(covScript), link);
    const ok = run([covGood], link);
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout, `ok ${covGood}\n`);
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, JSON.stringify(covBadDoc()));
    assert.equal(run([bad], link).status, 1);
  });
});
