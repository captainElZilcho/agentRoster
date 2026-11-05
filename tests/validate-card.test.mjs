import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateCard } from "../skills/agentroster/scripts/validate-card.mjs";
import { invalidCases } from "./fixtures/cards/invalid-cases.mjs";

const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const exampleDir = new URL("../examples/", import.meta.url);
const fixtureDir = new URL("./fixtures/cards/valid/", import.meta.url);
const files = (dir, base) =>
  readdirSync(dir).filter((f) => f.endsWith(".roster.json")).map((f) => [f, new URL(f, base)]);

for (const [name, url] of [...files(exampleDir, exampleDir), ...files(fixtureDir, fixtureDir)]) {
  test(`${name} is a valid card`, () => {
    assert.deepEqual(validateCard(JSON.parse(readFileSync(url, "utf8"))), { valid: true, errors: [] });
  });
}

test("the example and fixture sets are not empty", () => {
  assert.equal(files(exampleDir, exampleDir).length, 3);
  assert.equal(files(fixtureDir, fixtureDir).length, 2);
});

test("a card that is not an object is invalid", () => {
  const result = validateCard(null);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].path, "/");
});

test("a changed card reports its errors", () => {
  const card = load("./fixtures/cards/valid/minimal-workflow.roster.json");
  card.id = "Bad Id";
  const result = validateCard(card);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [{ path: "/id", message: 'must be a kebab-case id like "fleet-scout"' }]);
});

for (const c of invalidCases) {
  test(`invalid case: ${c.name}`, () => {
    const result = validateCard(c.card);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.path === c.path && e.message.includes(c.message)),
      `expected an error at ${c.path} containing "${c.message}", got ${JSON.stringify(result.errors)}`,
    );
  });
}

test("a card with a bad type and a bad purpose reports both errors", () => {
  const card = load("./fixtures/cards/valid/minimal-workflow.roster.json");
  card.type = "robot";
  card.purpose = "none";
  const result = validateCard(card);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === "/type" && e.message.includes('"robot" is not one of orchestrator')));
  assert.ok(result.errors.some((e) => e.path === "/purpose" && e.message.includes("use null for an empty value")));
});
