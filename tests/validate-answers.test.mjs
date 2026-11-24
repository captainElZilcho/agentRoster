import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateAnswers } from "../skills/agentroster/scripts/validate-answers.mjs";

const load = () => JSON.parse(readFileSync(new URL("./fixtures/answers/valid/typical.json", import.meta.url), "utf8"));
const schemaText = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const script = new URL("../skills/agentroster/scripts/validate-answers.mjs", import.meta.url).pathname;

const fails = (doc, path, pattern) => {
  const r = validateAnswers(doc);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.path === path && pattern.test(e.message)),
    `expected ${path} ~ ${pattern}\ngot ${JSON.stringify(r.errors)}`,
  );
};

test("a typical answers file is valid", () => {
  assert.deepEqual(validateAnswers(load()), { valid: true, errors: [] });
});

test("another version is an error", () => {
  const d = load();
  d.agentroster = "0.2";
  fails(d, "/agentroster", /0\.1/);
});

test("only the type field may be answered", () => {
  const d = load();
  d.answers[0].field = "kind";
  fails(d, "/answers/0/field", /type/);
});

test("a value that is not a type code is an error", () => {
  const d = load();
  d.answers[0].value = "coach";
  fails(d, "/answers/0/value", /.+/);
});

test("two answers for one card and field are an error", () => {
  const d = load();
  d.answers[1].card = "responder";
  fails(d, "/answers", /two answers for responder\.type/);
});

test("answers out of order are an error", () => {
  const d = load();
  d.answers.reverse();
  fails(d, "/answers", /sorted by card, then field/);
});

test("an unknown top-level key is an error", () => {
  const d = load();
  d.mode = "quick";
  fails(d, "/", /mode/);
});

test("a date not in YYYY-MM-DD form is an error", () => {
  const d = load();
  d.answers[0].date = "18 Nov";
  fails(d, "/answers/0/date", /.+/);
});

test("based_on is optional, but needs a quote when present", () => {
  const d = load();
  delete d.answers[1].based_on;
  assert.equal(validateAnswers(d).valid, true);
  delete d.answers[0].based_on.quote;
  fails(d, "/answers/0/based_on", /quote/);
});

test("the answers schema lists exactly the card standard's type codes", () => {
  const answers = JSON.parse(schemaText("../schema/answers-file-0.1.schema.json"));
  const card = JSON.parse(schemaText("../schema/roster-card-0.2.schema.json"));
  assert.deepEqual(answers.$defs.type.enum, card.$defs.type.enum);
});

test("shipped answers schema copy is byte-identical to the published schema", () => {
  assert.equal(
    schemaText("../skills/agentroster/schema/answers-file-0.1.schema.json"),
    schemaText("../schema/answers-file-0.1.schema.json"),
  );
});

test("the CLI prints ok for a valid file and exits 0", () => {
  const file = new URL("./fixtures/answers/valid/typical.json", import.meta.url).pathname;
  const r = spawnSync(process.execPath, [script, file], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^ok /);
});

test("an empty based_on quote is an error", () => {
  const d = load();
  d.answers[0].based_on.quote = "";
  fails(d, "/answers/0/based_on/quote", /.+/);
});

test("the CLI refuses a linked file and never reads its target", async () => {
  const { mkdtempSync, writeFileSync, symlinkSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    const secret = path.join(dir, "secret.txt");
    writeFileSync(secret, "FAKE-TOKEN-1234\n");
    const link = path.join(dir, "agentroster.json");
    symlinkSync(secret, link);
    const r = spawnSync(process.execPath, [script, link], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.equal(r.stderr, `cannot read ${link}: is a link\n`);
    assert.ok(!(r.stdout + r.stderr).includes("FAKE-TOKEN"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a file that is not JSON is reported without quoting its text", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    const f = path.join(dir, "agentroster.json");
    writeFileSync(f, "FAKE-TOKEN-1234\n");
    const r = spawnSync(process.execPath, [script, f], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.equal(r.stderr, `not valid JSON: ${f}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI refuses a file over the size cap without reading it", async () => {
  const { mkdtempSync, rmSync, truncateSync, writeFileSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { MAX_FILE_BYTES } = await import("../skills/agentroster/scripts/lib/cli.mjs");
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    const f = path.join(dir, "agentroster.json");
    writeFileSync(f, "");
    truncateSync(f, MAX_FILE_BYTES + 1); // sparse: no disk use
    const r = spawnSync(process.execPath, [script, f], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.equal(r.stderr, `cannot read ${f}: too large\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI prints a project's key names without terminal control characters", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    const f = path.join(dir, "agentroster.json");
    writeFileSync(f, JSON.stringify({ ...load(), "\u001b[2Jx\u202e": 1 }));
    const r = spawnSync(process.execPath, [script, f], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /unknown field/);
    assert.doesNotMatch(r.stdout, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("based_on.file must be a repo-relative path", () => {
  for (const bad of ["/etc/passwd", "../outside/x.py", "a\\b.py", "~/x.py", "C:/x.py"]) {
    const d = load();
    d.answers[0].based_on.file = bad;
    fails(d, "/answers/0/based_on/file", /repo-relative path/);
  }
});
