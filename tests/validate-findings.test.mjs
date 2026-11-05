import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateFindings } from "../skills/agentroster/scripts/validate-findings.mjs";
import { compareText, canonicalJson } from "../skills/agentroster/scripts/lib/order.mjs";
import { invalidCases } from "./fixtures/findings/invalid-cases.mjs";

const validDir = new URL("./fixtures/findings/valid/", import.meta.url);

for (const name of readdirSync(validDir).filter((n) => n.endsWith(".json")).sort()) {
  test(`valid fixture ${name} passes`, () => {
    const doc = JSON.parse(readFileSync(new URL(name, validDir), "utf8"));
    assert.deepEqual(validateFindings(doc), { valid: true, errors: [] });
  });
}

for (const c of invalidCases) {
  test(`invalid case: ${c.name}`, () => {
    const result = validateFindings(c.doc);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.path === c.path && e.message === c.message),
      `expected ${c.path}: ${c.message}\ngot ${JSON.stringify(result.errors, null, 1)}`,
    );
  });
}

test("rule cases report only their own rule", () => {
  const result = validateFindings(invalidCases.find((c) => c.name === "fail-no-what").doc);
  assert.deepEqual(result.errors, [{ path: "/entries/0/what", message: 'required when result is "fail"' }]);
});

test("several errors in one entry are all reported", () => {
  const c = invalidCases.find((x) => x.name === "fail-no-what").doc;
  c.entries[0].why = null;
  const paths = validateFindings(c).errors.map((e) => e.path);
  assert.deepEqual(paths, ["/entries/0/what", "/entries/0/why"]);
});

test("schema errors stop the rule checks", () => {
  const doc = invalidCases.find((c) => c.name === "result-warn").doc;
  const result = validateFindings(doc);
  assert.deepEqual(result.errors.map((e) => e.path), ["/entries/0/result"]);
});

test("never throws on any JSON value", () => {
  for (const v of [[], null, "x", 1, true, {}, { entries: "x" }, { entries: [null] }, { entries: [[]], summary: 3, snapshot: [] },
    { findings: "0.1", snapshot: null, summary: [], entries: [] }]) {
    const r = validateFindings(v);
    assert.equal(r.valid, false);
    assert.ok(r.errors.length > 0);
  }
});

test("compareText uses code-unit order, not locale", () => {
  assert.equal(compareText("B", "a"), -1);
  assert.equal(compareText("a", "a"), 0);
  assert.equal(compareText("b", "a"), 1);
});

test("canonicalJson keeps insertion order and has no spaces", () => {
  assert.equal(canonicalJson({ b: 1, a: [null, "x", { z: true }] }), '{"b":1,"a":[null,"x",{"z":true}]}');
});

test("summary key order does not matter, but values and item order do", () => {
  const reorder = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
  for (const name of ["first-run", "second-run"]) {
    const doc = JSON.parse(readFileSync(new URL(`${name}.json`, validDir), "utf8"));
    doc.summary = doc.summary.map((item) => ({
      needs_checking: item.needs_checking,
      worst: item.worst,
      counts: reorder(item.counts, Object.keys(item.counts).reverse()),
      card: item.card,
    }));
    assert.deepEqual(validateFindings(doc), { valid: true, errors: [] }, name);
    const changed = structuredClone(doc);
    changed.summary[0].counts.pass += 1;
    assert.equal(validateFindings(changed).valid, false);
    const swapped = structuredClone(doc);
    swapped.summary.reverse();
    assert.equal(validateFindings(swapped).valid, false);
  }
});
