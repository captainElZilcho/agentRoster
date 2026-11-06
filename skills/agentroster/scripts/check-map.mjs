// Checks map.md against coverage.json: the eight fixed sections in order, one
// inventory table, one heading per agent or workflow, and the same ids in all
// three places. Usage: check-map.mjs <run-dir>

import { readFileSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "./lib/cli.mjs";
import { compareText } from "./lib/order.mjs";
import { validateCoverage } from "./validate-coverage.mjs";

/** The level-2 headings of map.md, without "## ", in the required order. */
export const MAP_SECTIONS = [
  "Summary",
  "Inventory",
  "Agents and workflows",
  "Flow",
  "Checked, not an agent",
  "Unknowns",
  "Needs checking",
  "Skipped",
];

const KINDS = new Set(["agent", "workflow"]);
const TABLE_HEADER = /^\|\s*id\s*\|\s*kind\s*\|/i;

/**
 * Split map.md into level-2 sections. Lines inside fenced code blocks are ignored.
 * @param {string} text
 * @returns {Array<{title: string, lines: string[]}>}
 */
function readSections(text) {
  const sections = [];
  let fence = null;
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h2) sections.push({ title: h2[1], lines: [] });
    else sections.at(-1)?.lines.push(line);
  }
  return sections;
}

/** Cells of a table row, trimmed. */
const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const backticked = (cell) => /^`([^`]+)`$/.exec(cell)?.[1] ?? null;

/** Section order and extra-heading errors. */
function checkSections(sections) {
  const errors = [];
  const seen = new Map();
  for (const s of sections) {
    if (!MAP_SECTIONS.includes(s.title)) errors.push(`unexpected section "${s.title}"`);
    else if (seen.has(s.title)) errors.push(`section "${s.title}" appears twice`);
    else seen.set(s.title, sections.indexOf(s));
  }
  let before = null;
  for (const title of MAP_SECTIONS) {
    if (!seen.has(title)) {
      errors.push(`missing section "${title}"`);
      continue;
    }
    if (before !== null && seen.get(title) < seen.get(before)) {
      errors.push(`section "${title}" is out of order (expected after "${before}")`);
    } else {
      before = title;
    }
  }
  return errors;
}

/** Read the inventory table: its ids in order, plus errors. */
function readInventory(section) {
  const errors = [];
  const ids = [];
  const lines = section.lines.filter((l) => l.trim().startsWith("|"));
  const start = lines.findIndex((l) => TABLE_HEADER.test(l.trim()));
  if (start === -1) {
    return { ids, errors: ['section "Inventory" has no table with the header "| id | kind |"'] };
  }
  for (const line of lines.slice(start + 1)) {
    const row = cells(line);
    if (row.every((c) => /^:?-+:?$/.test(c))) continue;
    const id = backticked(row[0]);
    if (id === null) {
      errors.push(`inventory row "${line.trim()}": the id must be in backticks`);
      continue;
    }
    if (!KINDS.has(row[1])) errors.push(`id "${id}": kind must be "agent" or "workflow"`);
    ids.push(id);
  }
  return { ids, errors };
}

/** Ids of the level-3 headings (`### \`id\``) in a section. */
const headingIds = (section) =>
  section.lines.flatMap((l) => {
    const h3 = /^###\s+(.+?)\s*#*\s*$/.exec(l);
    const id = h3 ? backticked(h3[1]) : null;
    return id === null ? [] : [id];
  });

/**
 * Check map.md against coverage.json.
 * @param {string} mapText The text of map.md.
 * @param {object} coverage A valid coverage document.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function checkMap(mapText, coverage) {
  const sections = readSections(mapText);
  const errors = checkSections(sections);
  const find = (title) => sections.find((s) => s.title === title);

  const inventorySection = find("Inventory");
  const inventory = inventorySection ? readInventory(inventorySection) : { ids: [], errors: [] };
  errors.push(...inventory.errors);

  const seen = new Set();
  for (const id of inventory.ids) {
    if (seen.has(id)) errors.push(`id "${id}" is listed twice in the inventory`);
    seen.add(id);
  }

  const covered = new Set((coverage.candidates ?? []).flatMap((c) => c.cards ?? []));
  const headings = find("Agents and workflows");
  const headingList = headings ? headingIds(headings) : [];
  const headed = new Set(headingList);
  for (const id of [...new Set(headingList.filter((x, i) => headingList.indexOf(x) !== i))].sort(compareText)) {
    errors.push(`id "${id}" has two headings under "Agents and workflows"`);
  }

  if (inventorySection) {
    for (const id of [...seen].sort(compareText)) {
      if (!covered.has(id)) errors.push(`id "${id}" is in the inventory but not in coverage.json`);
      if (headings && !headed.has(id)) {
        errors.push(`id "${id}" is in the inventory but has no heading under "Agents and workflows"`);
      }
    }
    for (const id of [...covered].sort(compareText)) {
      if (!seen.has(id)) errors.push(`id "${id}" is in coverage.json but not in the inventory`);
    }
    for (const id of [...headed].sort(compareText)) {
      if (!seen.has(id)) {
        errors.push(`id "${id}" has a heading under "Agents and workflows" but is not in the inventory`);
      }
    }
    for (const u of coverage.unknowns ?? []) {
      if (!seen.has(u.card)) errors.push(`unknown "${u.card}.${u.field}": card "${u.card}" is not in the inventory`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Command line: check-map.mjs <run-dir>

class CliError extends Error {}

const reason = (err) =>
  err?.code === "ENOENT" ? "not found" : err?.code === "EACCES" || err?.code === "EPERM" ? "no permission" : err?.code === "EISDIR" ? "is a folder" : "unreadable";

const readText = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    throw new CliError(`cannot read ${file} (${reason(err)})`);
  }
};

/**
 * Run the command line.
 * @param {string[]} args
 * @returns {number} 0 ok, 1 problems found, 2 a file could not be used.
 */
export function runCheckMapCli(args) {
  try {
    if (args.length !== 1) throw new CliError("usage: check-map.mjs <run-dir>");
    const mapFile = path.join(args[0], "map.md");
    const coverageFile = path.join(args[0], "coverage.json");
    const mapText = readText(mapFile);
    const coverageText = readText(coverageFile);
    let coverage;
    try {
      coverage = JSON.parse(coverageText.replace(/^﻿/, ""));
    } catch {
      throw new CliError(`not valid JSON: ${coverageFile}`);
    }
    const checked = validateCoverage(coverage);
    if (!checked.valid) {
      throw new CliError(
        [`${coverageFile} is not valid:`, ...checked.errors.map((e) => `  ${e.path}: ${e.message}`)].join("\n"),
      );
    }
    const result = checkMap(mapText, coverage);
    if (result.valid) {
      console.log(`ok ${mapFile}`);
      return 0;
    }
    for (const e of result.errors) console.log(e);
    return 1;
  } catch (err) {
    console.error(err instanceof CliError ? err.message : "error: unexpected failure");
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runCheckMapCli(process.argv.slice(2));
}
