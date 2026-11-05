// Checks a coverage.json file: the schema first, then the rules the schema
// cannot express (reason, outcome, cards and note by status, order, summary).

import { readFileSync } from "node:fs";
import { checkSchema } from "./lib/schema-check.mjs";
import { runValidatorCli, isEntryPoint } from "./lib/cli.mjs";
import { compareText, canonicalJson, keySortedJson } from "./lib/order.mjs";

const schema = JSON.parse(
  readFileSync(new URL("../schema/coverage-0.1.schema.json", import.meta.url), "utf8"),
);

/** Candidate key as shown in messages: "file:line", with `*` for a whole file. */
const candidateKey = (c) => `${c.file}:${c.line === null ? "*" : c.line}`;

/** Compare two candidates in file order: file, then line with null first. */
function compareCandidates(a, b) {
  const c = compareText(a.file, b.file);
  if (c !== 0) return c;
  if (a.line === b.line) return 0;
  if (a.line === null) return -1;
  if (b.line === null) return 1;
  return a.line < b.line ? -1 : 1;
}

const unknownKey = (u) => `${u.card}.${u.field}`;
const compareUnknowns = (a, b) => compareText(a.card, b.card) || compareText(a.field, b.field);

/** The summary the lists imply (spec 4.3), keys in the documented order. */
function expectedSummary(candidates, unknowns) {
  const count = (pred) => candidates.filter(pred).length;
  return {
    candidates: candidates.length,
    read: count((c) => c.status === "read"),
    not_read: count((c) => c.status === "not-read"),
    not_understood: count((c) => c.status === "not-understood"),
    cards: new Set(candidates.flatMap((c) => c.cards)).size,
    no_agent: count((c) => c.outcome === "no-agent"),
    unknowns: unknowns.length,
  };
}

/** Rule errors for one candidate, in a fixed order. */
function checkCandidate(c, n) {
  const errors = [];
  const add = (field, message) => errors.push({ path: `/candidates/${n}/${field}`, message });

  if (c.status === "read") {
    if (c.reason !== null) add("reason", 'must be null when status is "read"');
    if (c.outcome === "pending") add("outcome", 'cannot be "pending" when status is "read"');
  } else {
    if (c.reason === null) add("reason", `required when status is "${c.status}"`);
    if (c.outcome !== "pending") add("outcome", `must be "pending" when status is "${c.status}"`);
  }

  if (c.outcome === "cards") {
    if (c.cards.length === 0) add("cards", 'needs at least one card id when outcome is "cards"');
  } else if (c.cards.length > 0) {
    add("cards", `must be empty when outcome is "${c.outcome}"`);
  }

  if (c.outcome === "no-agent") {
    if (c.note === null) add("note", 'required when outcome is "no-agent"');
  } else if (c.note !== null) {
    add("note", `must be null when outcome is "${c.outcome}"`);
  }
  return errors;
}

/**
 * Report the first duplicate and the first out-of-order item of a sorted list.
 * @param {any[]} list
 * @param {string} base Path of the list, for example "/candidates".
 * @param {(item: any) => string} key Text shown for an item.
 * @param {(a: any, b: any) => number} compare File order.
 * @param {string} noun "candidate" or "unknown".
 */
function checkList(list, base, key, compare, noun) {
  const errors = [];
  const seen = new Set();
  list.forEach((item, n) => {
    const k = key(item);
    if (seen.has(k)) errors.push({ path: `${base}/${n}`, message: `duplicate ${noun} "${k}"` });
    seen.add(k);
  });
  for (let n = 1; n < list.length; n++) {
    if (compare(list[n - 1], list[n]) > 0) {
      errors.push({
        path: `${base}/${n}`,
        message: `out of order: "${key(list[n])}" must come before "${key(list[n - 1])}"`,
      });
      break;
    }
  }
  return errors;
}

/**
 * Validate a coverage file.
 * @param {unknown} doc The parsed file.
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateCoverage(doc) {
  const schemaErrors = checkSchema(schema, doc);
  if (schemaErrors.length > 0) return { valid: false, errors: schemaErrors };

  const errors = [];
  doc.candidates.forEach((c, n) => errors.push(...checkCandidate(c, n)));
  errors.push(...checkList(doc.candidates, "/candidates", candidateKey, compareCandidates, "candidate"));
  errors.push(...checkList(doc.unknowns, "/unknowns", unknownKey, compareUnknowns, "unknown"));

  const expected = expectedSummary(doc.candidates, doc.unknowns);
  if (keySortedJson(doc.summary) !== keySortedJson(expected)) {
    errors.push({
      path: "/summary",
      message: `does not match the candidates and unknowns; expected ${canonicalJson(expected)}`,
    });
  }
  return { valid: errors.length === 0, errors };
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runValidatorCli(
    process.argv.slice(2),
    validateCoverage,
    "usage: validate-coverage.mjs <coverage.json> [...]",
  );
}
