import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, rmSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { cardView, renderCardMarkdown } from "../skills/agentroster/scripts/render-cards.mjs";
import { CARD_VIEW_NS } from "../skills/agentroster/scripts/check-cards.mjs";

const fx = (name) => new URL(`./fixtures/cards-check/${name}/`, import.meta.url);
const load = (name) => ({
  roster: JSON.parse(readFileSync(new URL("roster.json", fx(name)), "utf8")),
  coverage: JSON.parse(readFileSync(new URL("coverage.json", fx(name)), "utf8")),
});
const expected = (id) => readFileSync(new URL(`./fixtures/cards-render/ok.expected/${id}.md`, import.meta.url), "utf8");
const viewOf = (f, id) => cardView(f.roster.cards.find((c) => c.id === id), f.roster, f.coverage.unknowns);
const SCRIPT = new URL("../skills/agentroster/scripts/render-cards.mjs", import.meta.url).pathname;
const tile = (view, label) => view.groups.flatMap((g) => g.tiles).find((t) => t.label === label);

for (const id of ["fetcher", "daily-digest"]) {
  test(`Markdown card for ${id} matches the expected file`, () => {
    assert.equal(renderCardMarkdown(viewOf(load("ok"), id)), expected(id));
  });
}

test("the Markdown sections come in the fixed order", () => {
  const md = renderCardMarkdown(viewOf(load("ok"), "fetcher"));
  const order = ["## Not on this card", "## Specs", "### Runs on", "### Can do", "### Guardrails", "## Details", "## Sources"];
  const at = order.map((h) => md.indexOf(`\n${h}\n`));
  assert.ok(at.every((i) => i > 0), JSON.stringify(at));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test("without the card-view extension: runtime text, steps A to Z, order not known", () => {
  const f = load("ok");
  const wf = f.roster.cards.find((c) => c.id === "daily-digest");
  delete wf.extensions[CARD_VIEW_NS];
  const v = viewOf(f, "daily-digest");
  assert.equal(tile(v, "Runtime").value, "Python script run by cron");
  assert.deepEqual(v.steps.order, ["fetcher"]);
  assert.equal(v.steps.known, false);
  assert.equal(v.steps.starts.length, 0);
  assert.match(renderCardMarkdown(v), /- Order not known: fetcher\n/);
});

test("no model, no permission: shown as gaps with words, not blanks", () => {
  const v = viewOf(load("ok"), "daily-digest");
  assert.equal(tile(v, "Model").value, "— none");
  assert.equal(tile(v, "Permission").value, "— not declared");
  assert.equal(tile(v, "Permission").gap, true);
});

test("a value from a hand card gets the 'from hand card' marker", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.guardrails.permission = "read-only";
  c.evidence["guardrails.permission"] = [{ file: "fetcher.roster.json", line: 40, quote: '"permission": "read-only"', found_by: "hand" }];
  const t = tile(viewOf(f, "fetcher"), "Permission");
  assert.equal(t.value, "read-only");
  assert.equal(t.marker, "from hand card");
  assert.notEqual(t.gap, true);
});

test("a field listed as stated_only gets the 'stated, not enforced' marker", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.extensions[CARD_VIEW_NS] = { stated_only: ["guardrails.limits.turns"], evidence: {} };
  assert.equal(tile(viewOf(f, "fetcher"), "Turn limit").marker, "stated, not enforced");
});

test("each unknown reason reads in plain words", () => {
  const f = load("ok");
  const cases = {
    "loaded-from-database": "loaded from a database when the agent runs",
    "loaded-from-url": "loaded from a URL when the agent runs",
    "loaded-from-env": "loaded from an environment variable",
    "outside-repo": "kept outside the repository",
  };
  for (const [reason, text] of Object.entries(cases)) {
    f.coverage.unknowns[0].reason = reason;
    assert.deepEqual(viewOf(f, "fetcher").gaps, [{ field: "instructions", label: "Instructions", text }]);
  }
  f.coverage.unknowns[0].reason = "other";
  assert.equal(viewOf(f, "fetcher").gaps[0].text, "The prompt is read from the prompts table.");
});

test("a pipe and backticks in a value are escaped in the Sources table", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.evidence.purpose[0].quote = "a | b `c`";
  c.purpose = "x | y";
  const md = renderCardMarkdown(viewOf(f, "fetcher"));
  const row = md.split("\n").find((l) => l.startsWith("| purpose |"));
  assert.equal(row, "| purpose | x \\| y | app/fetcher.py:1 | `` a \\| b `c` `` | code |");
});

function cli(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withRun(name, fn) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    cpSync(fx(name).pathname, tmp, { recursive: true });
    fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("CLI writes one Markdown card per card into cards/", () => {
  withRun("ok", (run) => {
    const r = cli([run]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(readdirSync(path.join(run, "cards")).sort(), ["daily-digest.md", "fetcher.md"]);
    assert.equal(readFileSync(path.join(run, "cards", "fetcher.md"), "utf8"), expected("fetcher"));
  });
});

test("CLI refuses an unsafe card id and writes nothing", () => {
  for (const bad of ["../x", "a/b", "Up"]) {
    withRun("ok", (run) => {
      const p = path.join(run, "roster.json");
      const doc = JSON.parse(readFileSync(p, "utf8"));
      doc.cards[1].id = bad;
      writeFileSync(p, JSON.stringify(doc));
      const r = cli([run]);
      assert.equal(r.code, 2);
      assert.match(r.err, new RegExp(`bad card id|invalid roster\\.json`));
      assert.equal(existsSync(path.join(run, "cards")), false);
      assert.equal(existsSync(path.join(run, "x.md")), false);
    });
  }
});

test("CLI with no cards writes no Markdown card", () => {
  withRun("empty", (run) => {
    const r = cli([run]);
    assert.equal(r.code, 0, r.out + r.err);
    const dir = path.join(run, "cards");
    assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], []);
  });
});

test("CLI: missing run folder and usage exit 2", () => {
  assert.equal(cli([]).code, 2);
  assert.equal(cli([]).err.trim(), "usage: render-cards.mjs <run-dir>");
  const r = cli([path.join(os.tmpdir(), "agentroster-no-such-run")]);
  assert.equal(r.code, 2);
  assert.match(r.err, /\(not found\)/);
});

test("a long runtime text gets a full-width tile; a short one stays half width", () => {
  const f = load("ok");
  assert.equal(tile(viewOf(f, "daily-digest"), "Runtime").wide, undefined);
  delete f.roster.cards.find((c) => c.id === "daily-digest").extensions[CARD_VIEW_NS];
  assert.equal(tile(viewOf(f, "daily-digest"), "Runtime").wide, true);
});

test("gaps name the field in plain words, and a list's gap says it may be incomplete", () => {
  const f = load("ok");
  assert.equal(viewOf(f, "fetcher").gaps[0].label, "Instructions");
  f.coverage.unknowns[0].field = "tools.mcp";
  f.coverage.unknowns[0].reason = "outside-repo";
  const g = viewOf(f, "fetcher").gaps[0];
  assert.equal(g.label, "MCP tools");
  assert.equal(g.text, "kept outside the repository (the list may be incomplete)");
  assert.match(renderCardMarkdown(viewOf(f, "fetcher")), /- ○ MCP tools — kept outside the repository \(the list may be incomplete\)\n/);
});

test("when the runtime tile is full width, the model tile is too", () => {
  const f = load("ok");
  delete f.roster.cards.find((c) => c.id === "daily-digest").extensions[CARD_VIEW_NS];
  assert.equal(tile(viewOf(f, "daily-digest"), "Model").wide, true);
});
