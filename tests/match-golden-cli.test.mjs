import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = "skills/agentroster/scripts/match-golden.mjs";
const expected = "tests/fixtures/match/expected";
const FAKE = "sk-FAKE-match-0000";

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

const copyRun = (from, to) => fs.cpSync(from, to, { recursive: true });

test("match: a matching run exits 0 and prints the summary", () => {
  const r = run([expected, "tests/fixtures/match/run-ok"]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "match: 3 cards, 4 candidates, 0 unknowns\n");
  assert.equal(r.stderr, "");
});

test("match: a differing run exits 1 and never prints the forbidden string", () => {
  const r = run([expected, "tests/fixtures/match/run-diff"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /file map\.md: contains a forbidden string/);
  assert.match(r.stdout, /card fleet-scout: kind: expected "agent", got "workflow"/);
  assert.match(r.stdout, /candidate scripts\/helper\.py:2: missing candidate/);
  assert.ok(r.stdout.endsWith("differences: 3\n"));
  assert.ok(!r.stdout.includes(FAKE));
  assert.ok(!r.stderr.includes(FAKE));
});

test("match: a run folder without coverage.json exits 2 with one line", () => {
  withTempDir((dir) => {
    fs.copyFileSync("tests/fixtures/match/run-ok/roster.json", path.join(dir, "roster.json"));
    const r = run([expected, dir]);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    const lines = r.stderr.trimEnd().split("\n");
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^cannot read /);
    assert.ok(!/\n\s+at /.test(r.stderr));
  });
});

test("match: an invalid run card exits 2", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/run-ok", dir);
    const f = path.join(dir, "roster.json");
    const doc = JSON.parse(fs.readFileSync(f, "utf8"));
    delete doc.cards[0].purpose;
    fs.writeFileSync(f, JSON.stringify(doc));
    const r = run([expected, dir]);
    assert.equal(r.status, 2);
    assert.equal(r.stderr, "invalid run roster.json: run validate-card / validate-coverage for details\n");
  });
});

test("match: an invalid expected coverage exits 2", () => {
  withTempDir((dir) => {
    copyRun(expected, dir);
    fs.writeFileSync(path.join(dir, "coverage.json"), "{}");
    const r = run([dir, "tests/fixtures/match/run-ok"]);
    assert.equal(r.status, 2);
    assert.equal(r.stderr, "invalid expected coverage.json: run validate-card / validate-coverage for details\n");
  });
});

test("match: a bad expect.json exits 2", () => {
  withTempDir((dir) => {
    copyRun(expected, dir);
    for (const body of ['{"forbidden_strings":[]}', '{"forbidden_strings":"x","notes":[]}', '{"forbidden_strings":[1],"notes":[]}', "[]"]) {
      fs.writeFileSync(path.join(dir, "expect.json"), body);
      const r = run([dir, "tests/fixtures/match/run-ok"]);
      assert.equal(r.status, 2, body);
      assert.equal(r.stderr, "expect.json: must have forbidden_strings and notes lists\n");
    }
  });
});

test("match: expect.json is optional", () => {
  withTempDir((dir) => {
    copyRun(expected, dir);
    fs.rmSync(path.join(dir, "expect.json"));
    const r = run([dir, "tests/fixtures/match/run-diff"]);
    assert.equal(r.status, 1);
    assert.ok(r.stdout.endsWith("differences: 2\n"));
  });
});

test("match: no arguments print usage and exit 2", () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, "usage: match-golden.mjs [--only coverage] <expected-dir> <run-dir>\n");
  assert.equal(run(["a"]).status, 2);
  assert.equal(run(["a", "b", "c"]).status, 2);
});

test("match: files in sub-folders are scanned; symlinks are skipped", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/run-ok", dir);
    fs.mkdirSync(path.join(dir, "notes"));
    fs.writeFileSync(path.join(dir, "notes", "a.txt"), `x ${FAKE}`);
    const r = run([expected, dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /file notes\/a\.txt: contains a forbidden string/);
    fs.rmSync(path.join(dir, "notes"), { recursive: true });
    const outside = path.join(dir, "..", `outside-${path.basename(dir)}.txt`);
    fs.writeFileSync(outside, FAKE);
    try {
      fs.symlinkSync(outside, path.join(dir, "link.txt"));
      assert.equal(run([expected, dir]).status, 0);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

test("match: running through a symlink gives the same result", () => {
  withTempDir((dir) => {
    const link = path.join(dir, "link.mjs");
    fs.symlinkSync(path.resolve(script), link);
    const r = run([expected, "tests/fixtures/match/run-ok"], link);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "match: 3 cards, 4 candidates, 0 unknowns\n");
  });
});

test("match: forbidden strings in run values are never printed", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/run-ok", dir);
    const f = path.join(dir, "roster.json");
    const doc = JSON.parse(fs.readFileSync(f, "utf8"));
    doc.cards[0].engine = { ...(doc.cards[0].engine ?? {}), model: FAKE };
    doc.cards[0].tools = { ...(doc.cards[0].tools ?? {}), allow: [FAKE] };
    fs.writeFileSync(f, JSON.stringify(doc));
    const cf = path.join(dir, "coverage.json");
    const cov = JSON.parse(fs.readFileSync(cf, "utf8"));
    cov.candidates[cov.candidates.length - 1].file += `.${FAKE}`;
    fs.writeFileSync(cf, JSON.stringify(cov));
    const r = run([expected, dir]);
    assert.equal(r.status, 1);
    assert.ok(!r.stdout.includes(FAKE));
    assert.ok(!r.stderr.includes(FAKE));
    assert.match(r.stdout, /\[forbidden string\]/);
    assert.match(r.stdout, /file roster\.json: contains a forbidden string/);
  });
});

test("match: a symlinked roster.json is still scanned", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/run-ok", dir);
    const real = path.join(dir, "real-roster.txt");
    const doc = JSON.parse(fs.readFileSync(path.join(dir, "roster.json"), "utf8"));
    doc.cards[0].purpose = `${doc.cards[0].purpose} ${FAKE}`;
    fs.writeFileSync(real, JSON.stringify(doc));
    fs.rmSync(path.join(dir, "roster.json"));
    fs.symlinkSync(real, path.join(dir, "roster.json"));
    const r = run([expected, dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /file roster\.json: contains a forbidden string/);
    assert.ok(!r.stdout.includes(FAKE));
    assert.ok(!r.stderr.includes(FAKE));
  });
});

test("match: a BOM-prefixed roster.json still matches", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/run-ok", dir);
    const f = path.join(dir, "roster.json");
    fs.writeFileSync(f, "\uFEFF" + fs.readFileSync(f, "utf8"));
    assert.equal(run([expected, dir]).status, 0);
  });
});

test("match: a non-JSON roster.json exits 2 with one line", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/run-ok", dir);
    fs.writeFileSync(path.join(dir, "roster.json"), "not json");
    const r = run([expected, dir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^not valid JSON: .*roster\.json\n$/);
  });
});

test("match: a missing expected folder exits 2 with (not found)", () => {
  const r = run(["tests/fixtures/match/no-such-folder", "tests/fixtures/match/run-ok"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^cannot read .*roster\.json \(not found\)\n$/);
});

test("match: an unreadable run folder names the path", { skip: process.getuid?.() === 0 }, () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/run-ok", dir);
    const sub = path.join(dir, "locked");
    fs.mkdirSync(sub);
    fs.chmodSync(sub, 0o000);
    try {
      const r = run([expected, dir]);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /^cannot read .*locked \(no permission\)\n$/);
    } finally {
      fs.chmodSync(sub, 0o755);
    }
  });
});

test("match: a forbidden string with quote and backslash is never printed, raw or escaped", () => {
  withTempDir((dir) => {
    const F = 'sk-FAKE"q\\z';
    const exp = path.join(dir, "expected");
    const got = path.join(dir, "got");
    copyRun(expected, exp);
    copyRun("tests/fixtures/match/run-ok", got);
    fs.writeFileSync(path.join(exp, "expect.json"), JSON.stringify({ forbidden_strings: [F], notes: [] }));
    const f = path.join(got, "roster.json");
    const doc = JSON.parse(fs.readFileSync(f, "utf8"));
    doc.cards[0].engine = { ...(doc.cards[0].engine ?? {}), model: F };
    fs.writeFileSync(f, JSON.stringify(doc));
    const r = run([exp, got]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\[forbidden string\]/);
    for (const bad of ["sk-FAKE", '"q\\z', '\\"q\\\\z']) {
      assert.ok(!r.stdout.includes(bad), bad);
      assert.ok(!r.stderr.includes(bad), bad);
    }
  });
});

const covExpected = "tests/fixtures/match/coverage-only/expected";
const USAGE_LINE = "usage: match-golden.mjs [--only coverage] <expected-dir> <run-dir>\n";

test("only coverage: a matching run exits 0 with the short summary", () => {
  const r = run(["--only", "coverage", covExpected, "tests/fixtures/match/coverage-only/run-ok"]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "match: 3 candidates, 1 unknown\n");
  assert.equal(r.stderr, "");
});

test("only coverage: a differing run lists differences and hides the forbidden string", () => {
  const r = run(["--only", "coverage", covExpected, "tests/fixtures/match/coverage-only/run-diff"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /file map\.md: contains a forbidden string/);
  assert.match(r.stdout, /candidate services\/llm_client\.py:2: missing candidate/);
  assert.match(r.stdout, /candidate agents\/gate\.md:\*: signals: /);
  assert.ok(r.stdout.endsWith("differences: 3\n"));
  assert.ok(!r.stdout.includes(FAKE));
});

test("only coverage: roster.json is not needed on either side", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/coverage-only/run-ok", dir);
    assert.ok(!fs.existsSync(path.join(dir, "roster.json")));
    assert.equal(run(["--only", "coverage", covExpected, dir]).status, 0);
  });
});

test("only coverage: a forbidden string in map.md is reported", () => {
  withTempDir((dir) => {
    copyRun("tests/fixtures/match/coverage-only/run-ok", dir);
    fs.writeFileSync(path.join(dir, "map.md"), `x ${FAKE}`);
    const r = run(["--only", "coverage", covExpected, dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /file map\.md: contains a forbidden string/);
    assert.ok(!r.stdout.includes(FAKE));
  });
});

test("only coverage: a bad flag or a misplaced flag prints usage and exits 2", () => {
  const ok = "tests/fixtures/match/coverage-only/run-ok";
  for (const args of [["--only", "cards", covExpected, ok], ["--only"], ["--only", covExpected, ok],
    [covExpected, "--only", "coverage", ok], [covExpected, ok, "--only", "coverage"]]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(" "));
    assert.equal(r.stderr, USAGE_LINE);
  }
});

test("only coverage: a 0.1 expected coverage matches a 0.2 run coverage", () => {
  withTempDir((dir) => {
    const exp = path.join(dir, "exp");
    const act = path.join(dir, "act");
    fs.mkdirSync(exp);
    fs.mkdirSync(act);
    const v01 = JSON.parse(fs.readFileSync(path.join(expected, "coverage.json"), "utf8"));
    assert.equal(v01.coverage, "0.1");
    fs.copyFileSync(path.join(expected, "coverage.json"), path.join(exp, "coverage.json"));
    const v02 = structuredClone(v01);
    v02.coverage = "0.2";
    v02.summary.needs_checking = 0;
    for (const c of v02.candidates) { c.found_by = "script"; c.validation = { status: "validated", rounds: 1 }; }
    fs.writeFileSync(path.join(act, "coverage.json"), JSON.stringify(v02));
    const r = run(["--only", "coverage", exp, act]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});

test("match: a 0.1 expected coverage matches a 0.2 run coverage without --only", () => {
  withTempDir((dir) => {
    const exp = path.join(dir, "exp");
    const act = path.join(dir, "act");
    fs.mkdirSync(exp);
    fs.mkdirSync(act);
    for (const d of [exp, act]) fs.copyFileSync(path.join(expected, "roster.json"), path.join(d, "roster.json"));
    fs.copyFileSync(path.join(expected, "coverage.json"), path.join(exp, "coverage.json"));
    const v02 = JSON.parse(fs.readFileSync(path.join(expected, "coverage.json"), "utf8"));
    v02.coverage = "0.2";
    v02.summary.needs_checking = 0;
    for (const c of v02.candidates) { c.found_by = "script"; c.validation = { status: "validated", rounds: 1 }; }
    fs.writeFileSync(path.join(act, "coverage.json"), JSON.stringify(v02));
    const r = run([exp, act]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});
