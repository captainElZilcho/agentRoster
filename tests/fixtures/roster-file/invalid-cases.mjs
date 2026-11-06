// Invalid roster files, each with the one change that breaks it and the
// error it must produce. Used by tests/validate-roster-file.test.mjs and by
// the Ajv comparison test. `schemaOnly` is true when the roster file schema
// alone catches the case; the others break a card check or a rule check.

import { readFileSync } from "node:fs";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./valid/${name}.json`, import.meta.url), "utf8"));

/**
 * @typedef {{name: string, doc: unknown, path: string, message: string, schemaOnly: boolean}} InvalidCase
 */

/**
 * Copy the three-card fixture (change-gate, fleet-scout, ops-orchestrator),
 * apply one change, return the copy.
 * @param {(doc: any) => void} change
 */
const t = (change) => {
  const doc = load("three-cards");
  change(doc);
  return doc;
};

const rule = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: false });
const schema = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: true });

/** @type {InvalidCase[]} */
export const invalidCases = [
  schema("wrong-version", t((d) => { d.roster_file = "0.2"; }), "/roster_file", 'must be the string "0.1"'),
  schema("missing-cards", t((d) => { delete d.cards; }), "/", 'missing required field "cards"'),
  schema("project-is-path", t((d) => { d.snapshot.project = "a/b"; }), "/snapshot/project",
    "must be a project name: non-empty text, not a path"),
  rule("bad-card-kind", t((d) => { d.cards[1].kind = "bot"; }), "/cards/1/kind",
    '"bot" is not one of agent, workflow'),
  rule("duplicate-id", t((d) => { d.cards[2] = structuredClone(d.cards[1]); }), "/cards/2/id",
    'duplicate card id "fleet-scout"'),
  rule("out-of-order", t((d) => { d.cards.reverse(); }), "/cards/1/id",
    'out of order: "fleet-scout" must come before "ops-orchestrator"'),
];
