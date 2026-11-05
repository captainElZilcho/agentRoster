// Invalid roster cards, each with the one change that breaks it and the
// error it must produce. Used by tests/validate-card.test.mjs and by the
// Ajv comparison test. Every card is a fresh deep copy.

import { readFileSync } from "node:fs";

const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const base = load("./valid/minimal-workflow.roster.json");
const measured = load("./valid/measured-agent.roster.json");

/**
 * @typedef {{name: string, card: unknown, path: string, message: string}} InvalidCase
 */

/**
 * Copy the base card, apply one change, and return the copy.
 * @param {(card: any) => void} change
 * @returns {any}
 */
const with_ = (change) => {
  const card = structuredClone(base);
  change(card);
  return card;
};

/** @type {InvalidCase[]} */
export const invalidCases = [
  {
    name: "missing-field",
    card: with_((c) => { delete c.purpose; }),
    path: "/",
    message: 'missing required field "purpose"',
  },
  {
    name: "unknown-field",
    card: with_((c) => { c.colour = "blue"; }),
    path: "/",
    message: 'unknown field "colour"',
  },
  {
    name: "unknown-nested-field",
    card: with_((c) => { c.guardrails.colour = "blue"; }),
    path: "/guardrails",
    message: 'unknown field "colour"',
  },
  {
    name: "bad-type",
    card: with_((c) => { c.type = "robot"; }),
    path: "/type",
    message: '"robot" is not one of orchestrator',
  },
  {
    name: "bad-kind",
    card: with_((c) => { c.kind = "bot"; }),
    path: "/kind",
    message: '"bot" is not one of agent, workflow',
  },
  {
    name: "bad-memory-scope",
    card: with_((c) => { c.memory.scope = "session"; }),
    path: "/memory/scope",
    message: "is not one of none, run, project, local, user",
  },
  {
    name: "rating-over-99",
    card: with_((c) => {
      c.ratings.ACC = { value: 120, test: "t", date: "2026-11-01", tasks: 10, tries: 3 };
    }),
    path: "/ratings/ACC/value",
    message: "120 is above the maximum 99",
  },
  {
    name: "bad-estimate",
    card: with_((c) => { c.ratings.CON = "~100"; }),
    path: "/ratings/CON",
    message: 'an estimate like "~75"',
  },
  {
    name: "overall-over-99",
    card: with_((c) => { c.ratings.overall = 150; }),
    path: "/ratings/overall",
    message: "150 is above the maximum 99",
  },
  {
    name: "version-number",
    card: with_((c) => { c.version = 2026.1; }),
    path: "/version",
    message: 'must be a string like "2026.1"',
  },
  {
    name: "roster-number",
    card: with_((c) => { c.roster = 0.2; }),
    path: "/roster",
    message: 'must be the string "0.2"',
  },
  {
    name: "none-text",
    card: with_((c) => { c.purpose = "none"; }),
    path: "/purpose",
    message: 'use null for an empty value, not the text "none"',
  },
  {
    name: "none-in-list",
    card: with_((c) => { c.goals = ["none"]; }),
    path: "/goals/0",
    message: "use null for an empty value",
  },
  {
    name: "none-capitalised",
    card: with_((c) => { c.tools.allow = ["None"]; }),
    path: "/tools/allow/0",
    message: "use null for an empty value",
  },
  {
    name: "none-nested",
    card: with_((c) => { c.org.group = "NONE"; }),
    path: "/org/group",
    message: "use null for an empty value",
  },
  {
    name: "link-two-keys",
    card: with_((c) => { c.handoffs.to = [{ card: "a", type: "researcher" }]; }),
    path: "/handoffs/to/0",
    message: "must have exactly one of card, type or person",
  },
  {
    name: "link-bad-id",
    card: with_((c) => { c.handoffs.to = [{ card: "Fleet Scout" }]; }),
    path: "/handoffs/to/0/card",
    message: "must be a kebab-case id",
  },
  {
    name: "reports-to-app-name",
    card: with_((c) => { c.org.reports_to = "Ops Hub"; }),
    path: "/org/reports_to",
    message: "must be a kebab-case id",
  },
  {
    name: "bad-extension-key",
    card: with_((c) => { c.extensions = { foo: {} }; }),
    path: "/extensions/foo",
    message: "extension keys need a namespace",
  },
  {
    name: "headline-too-many",
    card: with_((c) => {
      c.headline_stats = ["runs", "accepted", "accepted_rate", "cost_per_run"];
    }),
    path: "/headline_stats",
    message: "has 4 items; at most 3 allowed",
  },
  {
    name: "definition-score-6",
    card: with_((c) => {
      c.definition = structuredClone(measured.definition);
      c.definition.score = 6;
    }),
    path: "/definition/score",
    message: "6 is above the maximum 5",
  },
  {
    name: "negative-runs",
    card: with_((c) => {
      c.stats = structuredClone(measured.stats);
      c.stats.runs = -1;
    }),
    path: "/stats/runs",
    message: "-1 is below the minimum 0",
  },
  {
    name: "null-object",
    card: with_((c) => { c.tools = null; }),
    path: "/tools",
    message: "must be object, got null",
  },
  {
    name: "top-level-array",
    card: [],
    path: "/",
    message: "must be object, got array",
  },
  {
    name: "top-level-string",
    card: "card",
    path: "/",
    message: "must be object, got string",
  },
];
