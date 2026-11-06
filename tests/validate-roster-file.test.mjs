import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  validateCard,
  validateRosterFile,
  validateCardOrRoster,
} from "../skills/agentroster/scripts/validate-card.mjs";
import { invalidCases } from "./fixtures/roster-file/invalid-cases.mjs";

const validDir = new URL("./fixtures/roster-file/valid/", import.meta.url);
const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const load = (name) => readJson(new URL(name, validDir));

for (const name of readdirSync(validDir).filter((n) => n.endsWith(".json")).sort()) {
  test(`valid fixture ${name} passes`, () => {
    assert.deepEqual(validateRosterFile(load(name)), { valid: true, errors: [] });
  });
}

for (const c of invalidCases) {
  test(`invalid case: ${c.name}`, () => {
    const result = validateRosterFile(c.doc);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.path === c.path && e.message === c.message),
      `expected ${c.path}: ${c.message}\ngot ${JSON.stringify(result.errors, null, 1)}`,
    );
  });
}

test("card errors stop the rule checks", () => {
  const doc = load("three-cards.json");
  doc.cards.reverse();
  doc.cards[0].kind = "bot";
  assert.deepEqual(validateRosterFile(doc).errors.map((e) => e.path), ["/cards/0/kind"]);
});

test("never throws on any JSON value", () => {
  for (const v of [[], null, "x", 1, true, {}, { cards: "x" }, { cards: [null] },
    { roster_file: "0.1", snapshot: null, cards: [] }]) {
    const r = validateRosterFile(v);
    assert.equal(r.valid, false);
    assert.ok(r.errors.length > 0);
  }
});

test("validateCardOrRoster picks the card or the roster file", () => {
  const card = load("three-cards.json").cards[0];
  assert.deepEqual(validateCardOrRoster(card), validateCard(card));
  const bad = { ...card, kind: "bot" };
  assert.deepEqual(validateCardOrRoster(bad), validateCard(bad));
  const roster = invalidCases[0].doc;
  assert.deepEqual(validateCardOrRoster(roster), validateRosterFile(roster));
});

const script = "skills/agentroster/scripts/validate-card.mjs";
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("CLI: the example roster file prints ok and exits 0", () => {
  const r = run("examples/roster.example.json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "ok examples/roster.example.json\n");
});

test("CLI: a roster file with a bad card exits 1 and names the card", () => {
  const dir = mkdtempSync(join(tmpdir(), "agentroster-"));
  try {
    const file = join(dir, "roster.json");
    const doc = load("three-cards.json");
    doc.cards[1].kind = "bot";
    writeFileSync(file, JSON.stringify(doc));
    const r = run(file);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\/cards\/1\/kind/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
