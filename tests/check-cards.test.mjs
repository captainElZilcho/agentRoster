import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { checkCards, CARD_VIEW_NS } from "../skills/agentroster/scripts/check-cards.mjs";
import { inventoryIds } from "../skills/agentroster/scripts/check-map.mjs";

const dir = (name) => new URL(`./fixtures/cards-check/${name}/`, import.meta.url);
const load = (name) => ({
  roster: JSON.parse(readFileSync(new URL("roster.json", dir(name)), "utf8")),
  coverage: JSON.parse(readFileSync(new URL("coverage.json", dir(name)), "utf8")),
  map: readFileSync(new URL("map.md", dir(name)), "utf8"),
});
const run = (f) => checkCards(f.roster, f.coverage, f.map);
const has = (result, message) =>
  assert.ok(result.errors.includes(message), `expected "${message}"\ngot ${JSON.stringify(result.errors, null, 1)}`);
const card = (f, id) => f.roster.cards.find((c) => c.id === id);
const SCRIPT = new URL("../skills/agentroster/scripts/check-cards.mjs", import.meta.url).pathname;

test("the namespace constant is the card-view extension name", () => {
  assert.equal(CARD_VIEW_NS, "io.github.captainelzilcho.agentroster.card-view/v1");
});

test("inventoryIds reads the ids from map.md's inventory table", () => {
  assert.deepEqual(inventoryIds(load("ok").map), ["daily-digest", "fetcher"]);
});

test("the ok fixture passes", () => {
  assert.deepEqual(run(load("ok")), { valid: true, errors: [] });
});

test("a run with no agents anywhere passes", () => {
  assert.deepEqual(run(load("empty")), { valid: true, errors: [] });
});

test("an id in the roster but not in the map or coverage is reported", () => {
  const f = load("ok");
  card(f, "fetcher").id = "fetch-notes";
  card(f, "daily-digest").extensions[CARD_VIEW_NS].steps = ["fetch-notes"];
  const r = run(f);
  assert.equal(r.valid, false);
  has(r, 'id "fetch-notes" is in roster.json but not in map.md');
  has(r, 'id "fetch-notes" is in roster.json but not in coverage.json');
  has(r, 'id "fetcher" is in map.md but not in roster.json');
  has(r, 'id "fetcher" is in coverage.json but not in roster.json');
});

test("a filled field with no evidence is reported", () => {
  const f = load("ok");
  delete card(f, "fetcher").evidence["guardrails.limits.turns"];
  has(run(f), 'card "fetcher": guardrails.limits.turns is filled but has no evidence');
});

test("evidence under a parent or child path counts", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.evidence["guardrails.limits"] = c.evidence["guardrails.limits.turns"];
  delete c.evidence["guardrails.limits.turns"];
  assert.equal(run(f).valid, true);
});

test("an evidence key that is not a field on the card is reported", () => {
  const f = load("ok");
  card(f, "fetcher").evidence["guardrails.speed"] = card(f, "fetcher").evidence.purpose;
  has(run(f), 'card "fetcher": evidence key "guardrails.speed" is not a field on the card');
});

test("an evidence path that is absolute, uses backslashes or climbs out is reported", () => {
  for (const file of ["/app/fetcher.py", "app\\fetcher.py", "../app/fetcher.py"]) {
    const f = load("ok");
    card(f, "fetcher").evidence.purpose[0].file = file;
    has(run(f), `card "fetcher": evidence path "${file}" must be relative with forward slashes`);
  }
});

test("a field with an unknown in coverage must stay empty on its card", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.instructions = "prompts/fetcher.md";
  c.evidence.instructions = c.evidence.purpose;
  has(run(f), 'card "fetcher": instructions has an unknown in coverage.json but is filled');
});

test("a step in the card-view extension must report to that workflow", () => {
  const f = load("ok");
  card(f, "daily-digest").extensions[CARD_VIEW_NS].steps = ["fetcher", "daily-digest"];
  has(run(f), 'card "daily-digest": step "daily-digest" does not report to it');
});

test("a filled card-view field needs evidence inside the extension", () => {
  const f = load("ok");
  delete card(f, "daily-digest").extensions[CARD_VIEW_NS].evidence.starts;
  has(run(f), `card "daily-digest": extensions.${CARD_VIEW_NS}.starts is filled but has no evidence`);
});

test("errors come out sorted and without duplicates", () => {
  const f = load("ok");
  delete card(f, "fetcher").evidence.purpose;
  delete card(f, "daily-digest").evidence.purpose;
  const r = run(f);
  assert.deepEqual(r.errors, [...new Set(r.errors)].sort());
});

function cli(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("CLI: ok exits 0", () => {
  const r = cli([dir("ok").pathname]);
  assert.equal(r.code, 0, r.out + r.err);
});

test("CLI: problems exit 1 with one line each on stdout", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    cpSync(dir("ok").pathname, tmp, { recursive: true });
    const p = path.join(tmp, "roster.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    delete doc.cards[1].evidence["engine.model"];
    writeFileSync(p, JSON.stringify(doc));
    const r = cli([tmp]);
    assert.equal(r.code, 1);
    assert.match(r.out, /card "fetcher": engine\.model is filled but has no evidence/);
    assert.equal(r.err, "");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI: a missing file exits 2 in plain words", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    const r = cli([tmp]);
    assert.equal(r.code, 2);
    assert.equal(r.err.trim(), `cannot read ${path.join(tmp, "roster.json")} (not found)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI: an invalid roster exits 2", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    cpSync(dir("ok").pathname, tmp, { recursive: true });
    writeFileSync(path.join(tmp, "roster.json"), JSON.stringify({ roster_file: "0.1" }));
    const r = cli([tmp]);
    assert.equal(r.code, 2);
    assert.match(r.err, /invalid roster\.json/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI: no argument prints the usage line and exits 2", () => {
  const r = cli([]);
  assert.equal(r.code, 2);
  assert.equal(r.err.trim(), "usage: check-cards.mjs <run-dir>");
});

test("an unknown on a list field allows the known items (the list may be incomplete)", () => {
  const f = load("ok");
  const c = card(f, "fetcher");
  c.tools.mcp = ["mcp__notes__search"];
  c.evidence["tools.mcp"] = c.evidence["tools.allow"];
  f.coverage.unknowns.push({ card: "fetcher", field: "tools.mcp", reason: "outside-repo", detail: "The server is a package.", evidence: c.evidence["tools.allow"] });
  f.coverage.summary.unknowns = 2;
  assert.deepEqual(run(f).errors, []);
});
