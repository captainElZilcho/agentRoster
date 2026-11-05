import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateCard } from "../skills/agentroster/scripts/validate-card.mjs";

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
