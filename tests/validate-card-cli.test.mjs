import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = "skills/agentroster/scripts/validate-card.mjs";
const example = "examples/fleet-scout.roster.json";

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), encoding: "utf8" });
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a valid example prints ok and exits 0", () => {
  const r = run([example]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `ok ${example}\n`);
});

test("a valid and an invalid file exit 1 with ok, fail and the error", () => {
  withTempDir((dir) => {
    const card = JSON.parse(fs.readFileSync(example, "utf8"));
    card.type = "robot";
    const bad = path.join(dir, "bad.roster.json");
    fs.writeFileSync(bad, JSON.stringify(card));
    const r = run([example, bad]);
    assert.equal(r.status, 1);
    const lines = r.stdout.split("\n");
    assert.equal(lines[0], `ok ${example}`);
    assert.equal(lines[1], `fail ${bad}`);
    assert.match(lines[2], /^  \/type: "robot" is not one of /);
  });
});

test("a missing file exits 2 with the error code", () => {
  const r = run(["no-such-file.roster.json"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^cannot read no-such-file\.roster\.json: ENOENT\n/);
});

test("invalid JSON exits 2", () => {
  withTempDir((dir) => {
    const f = path.join(dir, "broken.roster.json");
    fs.writeFileSync(f, "{ nope");
    const r = run([f]);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.startsWith(`not valid JSON: ${f}`));
  });
});

test("a valid card with a BOM passes", () => {
  withTempDir((dir) => {
    const f = path.join(dir, "bom.roster.json");
    fs.writeFileSync(f, "﻿" + fs.readFileSync(example, "utf8"));
    const r = run([f]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, `ok ${f}\n`);
  });
});

test("an error does not stop the other files", () => {
  const r = run(["no-such-file.roster.json", example]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, `ok ${example}\n`);
});

test("no arguments print usage and exit 2", () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, "usage: validate-card.mjs <card.roster.json> [...]\n");
});

test("running through a symlink still validates", () => {
  withTempDir((dir) => {
    const link = path.join(dir, "link.mjs");
    fs.symlinkSync(path.resolve(script), link);
    const ok = spawnSync(process.execPath, [link, example], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout, `ok ${example}\n`);
    const card = JSON.parse(fs.readFileSync(example, "utf8"));
    card.type = "robot";
    const bad = path.join(dir, "bad.roster.json");
    fs.writeFileSync(bad, JSON.stringify(card));
    const r = spawnSync(process.execPath, [link, bad], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^fail /);
  });
});

test("a directory argument exits 2 with EISDIR", () => {
  withTempDir((dir) => {
    const r = run([dir]);
    assert.equal(r.status, 2);
    assert.equal(r.stderr, `cannot read ${dir}: EISDIR\n`);
  });
});

test("an invalid card plus an unreadable file exits 2", () => {
  withTempDir((dir) => {
    const card = JSON.parse(fs.readFileSync(example, "utf8"));
    card.type = "robot";
    const bad = path.join(dir, "bad.roster.json");
    fs.writeFileSync(bad, JSON.stringify(card));
    const r = run([bad, "no-such-file.roster.json"]);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /^fail /);
    assert.match(r.stderr, /ENOENT/);
  });
});
