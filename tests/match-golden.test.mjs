import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matchCards,
  matchCoverage,
  findForbidden,
  matchGolden,
} from "../skills/agentroster/scripts/match-golden.mjs";

const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}.roster.json`, import.meta.url), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const cards = () => ["change-gate", "fleet-scout", "ops-orchestrator"].map(load);
const gate = (cs) => cs.find((c) => c.id === "change-gate");
const FILE = "agents/gate.md";
const ev = (line) => [{ file: FILE, line, quote: "q", found_by: "agent" }];

const cov = () => ({
  coverage: "0.1",
  candidates: [
    { file: "a.py", line: 10, signals: ["sdk", "prompt"], detail: "d", status: "card", reason: null, outcome: "agent", cards: ["x", "y"], note: null },
    { file: "b.py", line: 20, signals: ["sdk"], detail: "d", status: "skipped", reason: "r", outcome: "not_agent", cards: [], note: null },
  ],
  unknowns: [{ card: "x", field: "tools", reason: "dynamic", detail: "d", evidence: [] }],
});

test("identical sides match", () => {
  const r = matchGolden(
    { roster: { cards: cards() }, coverage: cov(), expect: null },
    { roster: { cards: cards() }, coverage: cov(), files: [] },
  );
  assert.deepEqual(r, { match: true, differences: [] });
});

test("reordered cards and candidates match", () => {
  const c2 = cov();
  c2.candidates.reverse();
  assert.deepEqual(matchCards(cards(), cards().reverse()), []);
  assert.deepEqual(matchCoverage(cov(), c2), []);
});

test("missing and extra card", () => {
  const run = cards().filter((c) => c.id !== "fleet-scout");
  assert.deepEqual(matchCards(cards(), run), [{ where: "card fleet-scout", field: null, message: "missing card" }]);
  assert.deepEqual(matchCards(run, cards()), [{ where: "card fleet-scout", field: null, message: "extra card" }]);
});

test("exact field kind", () => {
  const run = cards();
  gate(run).kind = "workflow";
  assert.deepEqual(matchCards(cards(), run), [
    { where: "card change-gate", field: "kind", message: 'expected "agent", got "workflow"' },
  ]);
});

test("tools.allow is a set", () => {
  const run = cards();
  gate(run).tools.allow.reverse();
  assert.deepEqual(matchCards(cards(), run), []);
  gate(run).tools.allow.pop();
  const d = matchCards(cards(), run);
  assert.equal(d.length, 1);
  assert.equal(d[0].field, "tools.allow");
});

test("limits are exact", () => {
  const run = cards();
  gate(run).guardrails.limits.turns = 9;
  const d = matchCards(cards(), run);
  assert.equal(d.length, 1);
  assert.equal(d[0].field, "guardrails.limits");
});

test("skill names and source paths as sets", () => {
  const run = cards();
  gate(run).skills = [{ name: "policy-check", tag: "other" }];
  assert.deepEqual(matchCards(cards(), run), []);
  gate(run).skills = [{ name: "other", tag: null }];
  assert.equal(matchCards(cards(), run)[0].field, "skills");
  const k = cards(); gate(k).source.files = [{ path: "a", line: 1 }, { path: "b", line: 2 }];
  const r = clone(k); gate(r).source.files = [{ path: "b", line: 9 }, { path: "a", line: 1 }];
  assert.deepEqual(matchCards(k, r), []);
});

function withPurpose(keyLine, runLine, runKey = "purpose") {
  const k = cards(); gate(k).evidence = { purpose: ev(keyLine) };
  const r = cards(); gate(r).purpose = "reworded"; gate(r).evidence = { [runKey]: ev(runLine) };
  return matchCards(k, r);
}

test("present field: evidence within 3 lines", () => {
  assert.deepEqual(withPurpose(10, 12), []);
  assert.deepEqual(withPurpose(10, 13), []);
  assert.deepEqual(withPurpose(10, 14), [
    { where: "card change-gate", field: "purpose", message: `no evidence near ${FILE}:10` },
  ]);
});

test("present field: empty cases", () => {
  const r = cards(); gate(r).goals = [];
  assert.deepEqual(matchCards(cards(), r), [
    { where: "card change-gate", field: "goals", message: "expected a value, got empty" },
  ]);
  const k = cards(); gate(k).goals = [];
  assert.deepEqual(matchCards(k, cards()), [
    { where: "card change-gate", field: "goals", message: "expected empty, got a value" },
  ]);
});

test("deeper evidence key counts", () => {
  const k = cards(); gate(k).evidence = { io: ev(5) };
  const r = cards(); gate(r).evidence = { "io.in": ev(6), "io.out": ev(6), "io.report": ev(6) };
  assert.deepEqual(matchCards(k, r), []);
});

test("parent evidence key counts (io for io.in)", () => {
  const k = cards(); gate(k).evidence = { "io.in": ev(5) };
  const r = cards(); gate(r).evidence = { io: ev(6) };
  assert.deepEqual(matchCards(k, r), []);
});

test("key evidence with null line accepts any line; star in message", () => {
  const k = cards(); gate(k).evidence = { purpose: ev(null) };
  const r = cards(); gate(r).evidence = { purpose: ev(500) };
  assert.deepEqual(matchCards(k, r), []);
  gate(r).evidence = { purpose: [{ file: "other.md", line: 1, quote: "q", found_by: "agent" }] };
  assert.equal(matchCards(k, r)[0].message, `no evidence near ${FILE}:*`);
});

test("candidate line tolerance", () => {
  const r = cov(); r.candidates[0].line = 13;
  assert.deepEqual(matchCoverage(cov(), r), []);
  r.candidates[0].line = 14;
  assert.deepEqual(matchCoverage(cov(), r).map((d) => [d.where, d.message]), [
    ["candidate a.py:10", "missing candidate"],
    ["candidate a.py:14", "extra candidate"],
  ]);
});

test("candidate field differences", () => {
  const r = cov(); r.candidates[0].status = "skipped"; r.candidates[0].signals = ["sdk"];
  const d = matchCoverage(cov(), r);
  assert.deepEqual(d.map((x) => x.field), ["signals", "status"]);
  assert.equal(d[1].message, 'expected "card", got "skipped"');
});

test("unknown reason differs; missing and extra unknown", () => {
  const r = cov(); r.unknowns[0].reason = "other";
  assert.deepEqual(matchCoverage(cov(), r), [
    { where: "unknown x.tools", field: "reason", message: 'expected "dynamic", got "other"' },
  ]);
  r.unknowns = [];
  assert.equal(matchCoverage(cov(), r)[0].message, "missing unknown");
});

test("forbidden string never leaks", () => {
  const d = findForbidden(["sk-FAKE-x"], [{ path: "map.md", text: "a sk-FAKE-x b" }, { path: "ok.md", text: "fine" }]);
  assert.deepEqual(d, [{ where: "file map.md", field: null, message: "contains a forbidden string" }]);
  assert.ok(!JSON.stringify(d).includes("sk-FAKE-x"));
});

test("matchGolden collects forbidden and sorts", () => {
  const run = cards().filter((c) => c.id !== "fleet-scout");
  const r = matchGolden(
    { roster: { cards: cards() }, coverage: cov(), expect: { forbidden_strings: ["sk-FAKE-x"], notes: [] } },
    { roster: { cards: run }, coverage: cov(), files: [{ path: "map.md", text: "sk-FAKE-x" }] },
  );
  assert.equal(r.match, false);
  assert.deepEqual(r.differences.map((d) => d.where), ["card fleet-scout", "file map.md"]);
});

test("matchGolden: expect null means no forbidden strings", () => {
  const r = matchGolden(
    { roster: { cards: cards() }, coverage: cov(), expect: null },
    { roster: { cards: cards() }, coverage: cov(), files: [{ path: "map.md", text: "sk-FAKE-x" }] },
  );
  assert.deepEqual(r, { match: true, differences: [] });
});

test("matchGolden: forbidden_strings leak is reported without the string", () => {
  const r = matchGolden(
    { roster: { cards: cards() }, coverage: cov(), expect: { forbidden_strings: ["sk-FAKE-x"], notes: [] } },
    { roster: { cards: cards() }, coverage: cov(), files: [{ path: "map.md", text: "a sk-FAKE-x" }] },
  );
  assert.equal(r.match, false);
  assert.deepEqual(r.differences, [{ where: "file map.md", field: null, message: "contains a forbidden string" }]);
  assert.ok(!JSON.stringify(r).includes("sk-FAKE-x"));
});

test("matchGolden: expect without forbidden_strings throws", () => {
  assert.throws(
    () => matchGolden(
      { roster: { cards: cards() }, coverage: cov(), expect: { notes: [] } },
      { roster: { cards: cards() }, coverage: cov(), files: [] },
    ),
    { name: "TypeError", message: "expect.forbidden_strings must be a list" },
  );
});

test("matchGolden: forbidden strings are scrubbed from differences", () => {
  const KEY = "sk-FAKE-leak-1";
  const run = cards();
  gate(run).engine = { ...(gate(run).engine ?? {}), model: KEY };
  gate(run).tools = { ...(gate(run).tools ?? {}), allow: [KEY] };
  const rc = cov();
  rc.candidates[0].file = `${KEY}.py`;
  const r = matchGolden(
    { roster: { cards: cards() }, coverage: cov(), expect: { forbidden_strings: [KEY, "sk-FAKE"], notes: [] } },
    { roster: { cards: run }, coverage: rc, files: [] },
  );
  assert.equal(r.match, false);
  const text = JSON.stringify(r);
  assert.ok(!text.includes(KEY));
  assert.ok(!text.includes("sk-FAKE"));
  assert.ok(text.includes("[forbidden string]"));
});

const forbiddenRun = (forbidden, model) => {
  const run = cards();
  gate(run).engine = { ...(gate(run).engine ?? {}), model };
  return matchGolden(
    { roster: { cards: cards() }, coverage: cov(), expect: { forbidden_strings: forbidden, notes: [] } },
    { roster: { cards: run }, coverage: cov(), files: [] },
  );
};

test("matchGolden: forbidden string with quote and backslash is scrubbed in raw and escaped form", () => {
  const F = 'sk-FAKE"q\\z';
  const r = forbiddenRun([F], F);
  assert.equal(r.match, false);
  const text = r.differences.map((d) => `${d.where}|${d.field}|${d.message}`).join("\n");
  assert.ok(text.includes("[forbidden string]"));
  for (const bad of ["sk-FAKE", '"q\\z', '\\"q\\\\z']) assert.ok(!text.includes(bad), bad);
});

test("matchGolden: overlapping forbidden strings leave no tail", () => {
  const r = forbiddenRun(["sk-FAKE-abcd", "abcd-efgh"], "sk-FAKE-abcd-efgh");
  const text = r.differences.map((d) => d.message).join("\n");
  for (const bad of ["abcd", "efgh", "FAKE"]) assert.ok(!text.includes(bad), bad);
  assert.equal(text.split("[forbidden string]").length - 1, 1);
});

test("matchCoverage ignores found_by and validation", () => {
  const base = { candidates: [{ file: "a.md", line: null, signals: ["x"], status: "read", outcome: "cards", cards: ["a"] }], unknowns: [] };
  const run = structuredClone(base);
  run.candidates[0].found_by = "agent";
  run.candidates[0].validation = { status: "needs-checking", rounds: 3 };
  assert.deepEqual(matchCoverage(base, run), []);
});

test("matchGolden with only coverage does not need rosters", () => {
  const cov = { candidates: [], unknowns: [] };
  const r = matchGolden({ coverage: cov }, { coverage: cov, files: [] }, { only: "coverage" });
  assert.deepEqual(r, { match: true, differences: [] });
});
