// Checks a findings.json file: the schema first, then the rules the schema
// cannot express (what each result must carry, ids, change, order, summary).

import { readFileSync } from "node:fs";
import { checkSchema } from "./lib/schema-check.mjs";
import { runValidatorCli, isEntryPoint } from "./lib/cli.mjs";
import { compareText, canonicalJson } from "./lib/order.mjs";

const schema = JSON.parse(
  readFileSync(new URL("../schema/findings-0.1.schema.json", import.meta.url), "utf8"),
);

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const RESULTS = ["fail", "concern", "unknown", "info", "pass", "not-applicable"];
const GROUP = { fail: 0, concern: 0, unknown: 1, info: 2, pass: 3, "not-applicable": 4 };

/** Fields that must be non-null, and fields that must be null, for each result. */
const REQUIRED = {
  fail: ["what", "why", "impact"],
  concern: ["what", "why", "impact"],
  unknown: ["what", "why", "decide"],
  info: ["what", "why"],
  pass: ["what"],
  "not-applicable": ["what"],
};
const MUST_BE_NULL = {
  fail: [],
  concern: [],
  unknown: ["fix", "severity"],
  info: ["fix", "decide", "impact"],
  pass: ["severity", "impact", "fix", "decide"],
  "not-applicable": ["severity", "impact", "fix", "decide"],
};
const NEEDS_EVIDENCE = new Set(["fail", "concern", "unknown", "pass"]);

/** Sort key of an entry: group, severity rank (first group only), result. */
function rank(e) {
  const group = GROUP[e.result];
  return [group, group === 0 ? SEVERITY_RANK[e.severity] ?? 4 : 0, group === 0 && e.result === "concern" ? 1 : 0];
}

/** Compare two entries in file order (spec 3.4). */
function compareEntries(a, b) {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
  }
  if (a.card !== b.card) {
    if (a.card === null) return -1;
    if (b.card === null) return 1;
    const c = compareText(a.card, b.card);
    if (c !== 0) return c;
  }
  return compareText(a.id, b.id);
}

/** JSON text with object keys sorted (array order kept), so key order never matters. */
function keySortedJson(v) {
  if (Array.isArray(v)) return `[${v.map(keySortedJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${keySortedJson(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** The summary the entries imply (spec 3.5). */
function expectedSummary(entries) {
  const byCard = new Map();
  for (const e of entries) {
    if (!byCard.has(e.card)) byCard.set(e.card, []);
    byCard.get(e.card).push(e);
  }
  const cards = [...byCard.keys()].filter((c) => c !== null).sort(compareText);
  if (byCard.has(null)) cards.unshift(null);
  return cards.map((card) => {
    const list = byCard.get(card);
    const counts = {};
    for (const r of RESULTS) counts[r] = list.filter((e) => e.result === r).length;
    const ranks = list
      .filter((e) => e.result === "fail" || e.result === "concern")
      .map((e) => SEVERITY_RANK[e.severity])
      .filter((n) => n !== undefined);
    const worst = ranks.length ? Object.keys(SEVERITY_RANK)[Math.min(...ranks)] : null;
    const needs_checking = list.filter((e) => e.validation.status === "needs-checking").length;
    return { card, counts, worst, needs_checking };
  });
}

/** Rule errors for one entry, in a fixed order. */
function checkEntry(e, n, doc, seen) {
  const errors = [];
  const at = `/entries/${n}`;
  const add = (field, message) => errors.push({ path: field ? `${at}/${field}` : at, message });
  const r = e.result;

  for (const f of REQUIRED[r]) if (e[f] === null) add(f, `required when result is "${r}"`);
  for (const f of MUST_BE_NULL[r]) if (e[f] !== null) add(f, `must be null when result is "${r}"`);
  if (NEEDS_EVIDENCE.has(r) && e.evidence.length === 0) {
    add("evidence", `needs at least one item when result is "${r}"`);
  }
  if (r === "fail" || r === "concern") {
    if (e.fix === null && e.decide === null) add("", `needs a fix or a decide when result is "${r}"`);
    if (e.severity === null || e.severity === "info") {
      add("severity", `must be critical, high, medium or low when result is "${r}"`);
    }
  }
  if (r === "info" && e.severity !== "info") add("severity", 'must be "info" when result is "info"');

  if (e.card === null && e.kind !== null) add("kind", "must be null when card is null");
  if (e.card !== null && e.kind === null) add("kind", "required when card is set");

  const packId = e.pack.split("@")[0];
  const prefix = `${packId}.${e.check}:`;
  if (e.card === null) {
    if (!e.id.startsWith(`${prefix}roster:`)) add("id", `must start with "${prefix}roster:"`);
  } else if (e.id !== `${prefix}${e.card}`) {
    add("id", `must be "${prefix}${e.card}" to match pack, check and card`);
  }
  if (seen.has(e.id)) add("id", `duplicate id "${e.id}"`);
  seen.add(e.id);

  const listed = doc.snapshot.packs.some((p) => `${p.id}@${p.version}` === e.pack);
  if (!listed) add("pack", `"${e.pack}" is not listed in snapshot.packs`);

  if (e.method === "rule" && e.validation.rounds !== 0) {
    add("validation/rounds", 'must be 0 when method is "rule"');
  }
  if (e.method === "judgement" && (e.validation.rounds < 1 || e.validation.rounds > 3)) {
    add("validation/rounds", 'must be 1 to 3 when method is "judgement"');
  }

  if (doc.snapshot.previous === null) {
    if (e.change !== null) add("change", "must be null on a first run (snapshot.previous is null)");
  } else if (r === "fail" || r === "concern" || r === "unknown") {
    if (e.change !== "new" && e.change !== "still-open") {
      add("change", `must be "new" or "still-open" when result is "${r}"`);
    }
  } else if (r === "pass") {
    if (e.change !== "fixed" && e.change !== null) add("change", 'must be "fixed" or null when result is "pass"');
  } else if (e.change !== null) {
    add("change", `must be null when result is "${r}"`);
  }
  return errors;
}

/**
 * Validate a findings file.
 * @param {unknown} doc The parsed file.
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateFindings(doc) {
  const schemaErrors = checkSchema(schema, doc);
  if (schemaErrors.length > 0) return { valid: false, errors: schemaErrors };

  const errors = [];
  const seen = new Set();
  doc.entries.forEach((e, n) => errors.push(...checkEntry(e, n, doc, seen)));

  for (let n = 1; n < doc.entries.length; n++) {
    const prev = doc.entries[n - 1];
    if (compareEntries(prev, doc.entries[n]) > 0) {
      errors.push({
        path: `/entries/${n}`,
        message: `out of order: "${doc.entries[n].id}" must come before "${prev.id}"`,
      });
      break;
    }
  }

  const expected = expectedSummary(doc.entries);
  if (keySortedJson(doc.summary) !== keySortedJson(expected)) {
    errors.push({
      path: "/summary",
      message: `does not match the entries; expected ${canonicalJson(expected)}`,
    });
  }
  return { valid: errors.length === 0, errors };
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runValidatorCli(
    process.argv.slice(2),
    validateFindings,
    "usage: validate-findings.mjs <findings.json> [...]",
  );
}
