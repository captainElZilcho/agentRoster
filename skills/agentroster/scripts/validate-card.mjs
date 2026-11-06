// Checks a roster card against the v0.2 card schema, or a roster.json file
// (every card of a run) against the roster file schema and then each card.

import { readFileSync } from "node:fs";
import { checkSchema } from "./lib/schema-check.mjs";
import { runValidatorCli, isEntryPoint } from "./lib/cli.mjs";
import { compareText } from "./lib/order.mjs";

const schema = JSON.parse(
  readFileSync(new URL("../schema/roster-card-0.2.schema.json", import.meta.url), "utf8"),
);

const rosterFileSchema = JSON.parse(
  readFileSync(new URL("../schema/roster-file-0.1.schema.json", import.meta.url), "utf8"),
);

/**
 * Validate a roster card.
 * @param {unknown} card The parsed card.
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateCard(card) {
  const errors = checkSchema(schema, card);
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a roster file: the envelope, then each card (errors get the
 * `/cards/<index>` prefix), then unique ids and id order.
 * @param {unknown} doc The parsed file.
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateRosterFile(doc) {
  const envelope = checkSchema(rosterFileSchema, doc);
  if (envelope.length > 0) return { valid: false, errors: envelope };

  const errors = [];
  doc.cards.forEach((card, n) => {
    for (const e of checkSchema(schema, card)) {
      errors.push({ path: `/cards/${n}${e.path === "" || e.path === "/" ? "" : e.path}`, message: e.message });
    }
  });
  if (errors.length > 0) return { valid: false, errors };

  const seen = new Set();
  doc.cards.forEach((card, n) => {
    if (seen.has(card.id)) errors.push({ path: `/cards/${n}/id`, message: `duplicate card id "${card.id}"` });
    seen.add(card.id);
  });
  for (let n = 1; n < doc.cards.length; n++) {
    if (compareText(doc.cards[n - 1].id, doc.cards[n].id) > 0) {
      errors.push({
        path: `/cards/${n}/id`,
        message: `out of order: "${doc.cards[n].id}" must come before "${doc.cards[n - 1].id}"`,
      });
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a roster file when the top level has `roster_file`, else a card.
 * @param {unknown} doc The parsed file.
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateCardOrRoster(doc) {
  const isRoster = doc !== null && typeof doc === "object" && !Array.isArray(doc) && "roster_file" in doc;
  return isRoster ? validateRosterFile(doc) : validateCard(doc);
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runValidatorCli(
    process.argv.slice(2),
    validateCardOrRoster,
    "usage: validate-card.mjs <card.roster.json | roster.json> [...]",
  );
}
