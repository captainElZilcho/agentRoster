import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detect, loadPatterns } from "../skills/agentroster/scripts/detect.mjs";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "detect");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
}
function put(root, rel, text = "x\n") {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

for (const f of fs.readdirSync(FIXTURES).filter((n) => n.endsWith(".expected.json")).sort()) {
  const name = f.replace(/\.expected\.json$/, "");
  test(`fixture ${name} gives exactly the expected candidates`, () => {
    const expected = JSON.parse(fs.readFileSync(path.join(FIXTURES, f), "utf8"));
    const r = detect(path.join(FIXTURES, name));
    assert.deepEqual({ ecosystems: r.ecosystems, candidates: r.candidates }, expected);
  });
}

test("result shape and skipped keys", () => {
  const r = detect(path.join(FIXTURES, "negatives"));
  assert.deepEqual(Object.keys(r), ["detect", "ecosystems", "candidates", "skipped"]);
  assert.equal(r.detect, "0.1");
  assert.deepEqual(Object.keys(r.skipped), [
    "ignored", "dependencies", "build_output", "run_folder", "secret_file", "link", "binary", "too_large", "unreadable", "submodule",
  ]);
});

test("CRLF and a BOM keep the line number", () => {
  const d = tmp();
  put(d, "a.py", "﻿import os\r\n\r\nimport anthropic\r\n");
  const r = detect(d);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].line, 3);
  fs.rmSync(d, { recursive: true, force: true });
});

test("a file with a NUL byte is binary, a 2 MiB file is too large", () => {
  const d = tmp();
  put(d, "bin.py", "import anthropic\n\0\n");
  put(d, "big.py", "import anthropic\n" + "#".repeat(2 * 1024 * 1024));
  const r = detect(d);
  assert.deepEqual(r.candidates, []);
  assert.equal(r.skipped.binary, 1);
  assert.equal(r.skipped.too_large, 1);
  fs.rmSync(d, { recursive: true, force: true });
});

test("a file that cannot be opened is unreadable", { skip: process.getuid?.() === 0 }, () => {
  const d = tmp();
  put(d, "a.py", "import anthropic\n");
  fs.chmodSync(path.join(d, "a.py"), 0o000);
  const r = detect(d);
  assert.deepEqual(r.candidates, []);
  assert.equal(r.skipped.unreadable, 1);
  fs.rmSync(d, { recursive: true, force: true });
});

test("two patterns on one line give one candidate", () => {
  const d = tmp();
  put(d, "a.py", "import anthropic\n");
  const patterns = [
    { ecosystem: "openai-sdk", signal: "other", files: "**/*.py", line: "^import", detail: "second" },
    { ecosystem: "anthropic-sdk", signal: "llm-import", files: "**/*.py", line: "^import", detail: "first" },
  ];
  const r = detect(d, patterns);
  assert.deepEqual(r.candidates, [{
    file: "a.py", line: 1, signals: ["llm-import", "other"], detail: "second; first",
    ecosystems: ["anthropic-sdk", "openai-sdk"],
  }]);
  fs.rmSync(d, { recursive: true, force: true });
});

test("candidates sort by file, then line with null first", () => {
  const d = tmp();
  put(d, "b.py", "import openai\n");
  put(d, "a.py", "x = 1\nimport anthropic\nimport openai\n");
  put(d, "a.roster.json", "{}");
  const r = detect(d);
  assert.deepEqual(r.candidates.map((c) => [c.file, c.line]), [["a.py", 2], ["a.py", 3], ["a.roster.json", null], ["b.py", 1]]);
  assert.deepEqual(r.candidates[2].signals, ["roster-card"]);
  assert.deepEqual(r.ecosystems, ["anthropic-sdk", "openai-sdk", "roster"]);
  fs.rmSync(d, { recursive: true, force: true });
});

test("file text never reaches the output", () => {
  const d = tmp();
  put(d, "a.py", 'import anthropic\nKEY = "sk-FAKE-detect-0001"\nclient.messages.create(api_key="sk-FAKE-detect-0001")\n');
  const out = JSON.stringify(detect(d));
  assert.ok(out.includes("imports anthropic"));
  assert.ok(!out.includes("sk-FAKE-detect-0001"));
  fs.rmSync(d, { recursive: true, force: true });
});

test("exclude skips a folder and counts it as run_folder", () => {
  const d = tmp();
  put(d, "a.py", "import anthropic\n");
  put(d, "out/b.py", "import openai\n");
  put(d, "outside/c.py", "import openai\n");
  const r = detect(d, undefined, { exclude: ["out/"] });
  assert.deepEqual(r.candidates.map((c) => c.file), ["a.py", "outside/c.py"]);
  assert.equal(r.skipped.run_folder, 1);
  fs.rmSync(d, { recursive: true, force: true });
});

test("glob rules: ** matches zero or more folders, * stays in a folder, braces and ?", () => {
  const d = tmp();
  const pats = (files) => [{ ecosystem: "mcp", signal: "other", files, line: null, detail: "d" }];
  for (const f of ["x.ts", "src/y.ts", "src/deep/z.tsx", "w.js"]) put(d, f);
  const hits = (g) => detect(d, pats(g)).candidates.map((c) => c.file);
  assert.deepEqual(hits("**/*.ts"), ["src/y.ts", "x.ts"]);
  assert.deepEqual(hits("*.ts"), ["x.ts"]);
  assert.deepEqual(hits("src/*.ts"), ["src/y.ts"]);
  assert.deepEqual(hits("**/*.{ts,tsx}"), ["src/deep/z.tsx", "src/y.ts", "x.ts"]);
  assert.deepEqual(hits("?.js"), ["w.js"]);
  assert.deepEqual(hits("src/**"), ["src/deep/z.tsx", "src/y.ts"]);
  fs.rmSync(d, { recursive: true, force: true });
});

test("loadPatterns returns the shipped patterns", () => {
  const list = loadPatterns();
  assert.ok(list.length > 10);
  assert.ok(list.every((p) => typeof p.detail === "string" && "line" in p));
});

test("loadPatterns names the bad entry", () => {
  const d = tmp();
  const f = path.join(d, "p.json");
  fs.writeFileSync(f, JSON.stringify({ patterns_file: "0.1", patterns: [
    { ecosystem: "mcp", files: "**/*", line: null, detail: "x" },
  ] }));
  assert.throws(() => loadPatterns(f), /entry 0.*signal/);
  fs.writeFileSync(f, JSON.stringify({ patterns_file: "0.1", patterns: [
    { ecosystem: "mcp", signal: "other", files: "**/*", line: null, detail: "x" },
    { ecosystem: "mcp", signal: "other", files: "**/*", line: "(", detail: "x" },
  ] }));
  assert.throws(() => loadPatterns(f), /entry 1.*line/);
  fs.writeFileSync(f, "{}");
  assert.throws(() => loadPatterns(f), /patterns/);
  fs.rmSync(d, { recursive: true, force: true });
});

test("a call line without the SDK import in the same file is not a candidate", () => {
  const d = tmp();
  put(d, "twilio_app.py", 'from twilio.rest import Client\nclient = Client()\nclient.messages.create(body="hi")\n');
  put(d, "wrong.py", 'import openai\nclient.messages.create(body="hi")\n');
  put(d, "other.py", 'import anthropic\n');
  const r = detect(d);
  assert.deepEqual(r.candidates.map((c) => [c.file, c.line, c.signals[0]]), [["other.py", 1, "llm-import"], ["wrong.py", 1, "llm-import"]]);
  fs.rmSync(d, { recursive: true, force: true });
});

test("loadPatterns checks requires", () => {
  const d = tmp();
  const f = path.join(d, "p.json");
  const base = { ecosystem: "mcp", signal: "llm-call", files: "**/*", line: "x", detail: "x" };
  fs.writeFileSync(f, JSON.stringify({ patterns: [base] }));
  assert.throws(() => loadPatterns(f), /entry 0.*requires/);
  fs.writeFileSync(f, JSON.stringify({ patterns: [{ ...base, requires: "nope" }] }));
  assert.throws(() => loadPatterns(f), /entry 0.*requires/);
  fs.writeFileSync(f, JSON.stringify({ patterns: [{ ...base, signal: "other", requires: "openai-sdk" }] }));
  assert.throws(() => loadPatterns(f), /entry 0.*requires/);
  fs.writeFileSync(f, JSON.stringify({ patterns: [{ ...base, requires: "openai-sdk" }] }));
  assert.equal(loadPatterns(f).length, 1);
  fs.rmSync(d, { recursive: true, force: true });
});
