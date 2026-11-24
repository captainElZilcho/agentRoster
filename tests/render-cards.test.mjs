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

test("io media types show as friendly words on the card", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.io.in = ["text/plain"];
  c.io.out = ["application/json", "image/png", "application/x-custom"];
  assert.equal(tile(viewOf(f, "fetcher"), "Takes → returns").value, "text → JSON, image, application/x-custom");
});

test("common code and data file types show as plain words too", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.io.in = ["text/plain"];
  c.io.out = ["text/javascript", "text/x-python", "text/typescript", "application/yaml", "text/x-shellscript"];
  assert.equal(tile(viewOf(f, "fetcher"), "Takes → returns").value, "text → JavaScript, Python, TypeScript, YAML, shell script");
});

test("a top-level agent with starts shows a Starts tile in Runs on", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.org.reports_to = null;
  c.extensions[CARD_VIEW_NS] = { starts: ["command line"], evidence: {} };
  const v = viewOf(f, "fetcher");
  assert.equal(tile(v, "Starts").value, "command line");
  assert.ok(v.groups[0].tiles.some((t) => t.label === "Starts"));
  assert.match(renderCardMarkdown(v), /- Starts: command line\n/);
});

// Stored answers and judgement calls

const ANSWER_EVIDENCE = { file: "agentroster.json", line: 6, quote: '"value": "researcher",', found_by: "hand" };
const withJudgement = (c, j) => ((c.extensions[CARD_VIEW_NS] ??= {}).judgement = { type: j });

test("a type from the answers file shows as from your answers, in the Sources too", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.evidence.type = [ANSWER_EVIDENCE];
  const v = viewOf(f, "fetcher");
  assert.equal(v.typeNote, "from your answers");
  assert.equal(v.sources.find((s) => s.where.startsWith("agentroster.json")).from, "your answers");
});

test("a type below high confidence with no answer shows to confirm and the runner-up", () => {
  const f = load("ok");
  withJudgement(f.roster.cards.find((x) => x.id === "fetcher"), { confidence: "medium", runner_up: "builder", why: "x" });
  assert.equal(viewOf(f, "fetcher").typeNote, "to confirm (could be builder)");
});

test("a high-confidence type, or one with no judgement, has no note", () => {
  const f = load("ok");
  assert.equal(viewOf(f, "fetcher").typeNote, undefined);
  withJudgement(f.roster.cards.find((x) => x.id === "fetcher"), { confidence: "high", runner_up: null, why: "x" });
  assert.equal(viewOf(f, "fetcher").typeNote, undefined);
});

test("the Markdown card puts the note next to the type", () => {
  const f = load("ok");
  withJudgement(f.roster.cards.find((x) => x.id === "fetcher"), { confidence: "low", runner_up: "builder", why: "x" });
  assert.match(renderCardMarkdown(viewOf(f, "fetcher")), /· researcher \(to confirm \(could be builder\)\) ·/);
});

test("a hand-card type over a stored answer shows from hand card, over your answer", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.evidence.type = [
    { file: "app/fetcher.roster.json", line: 7, quote: '"type": "researcher",', found_by: "hand" },
    { file: "agentroster.json", line: 6, quote: '"value": "builder",', found_by: "hand" },
  ];
  assert.equal(viewOf(f, "fetcher").typeNote, "from hand card, over your answer");
});

test("Markdown card text cannot inject HTML, links, images or fake sections", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  c.name = "[open](javascript:alert(1))";
  c.purpose = '# <img src="http://127.0.0.1:9/x.png"> & more';
  c.role = "x\n## Sources\nDefinition: 5 of 5\n![i](http://127.0.0.1:9/i.png)";
  const md = renderCardMarkdown(viewOf(f, "fetcher"));
  const lines = md.split("\n");
  assert.doesNotMatch(md, /<img/);
  assert.doesNotMatch(md, /(^|[^\\])\]\(javascript:/, "no unescaped link");
  assert.doesNotMatch(md, /!\[i\]\(/);
  assert.equal(lines.filter((l) => l === "## Sources").length, 1, "only the renderer's own Sources heading");
  assert.equal(lines.filter((l) => l.startsWith("Definition:")).length, 1, "only the renderer's own footer");
  assert.ok(lines.some((l) => l.startsWith("\\# &lt;img")), "purpose's leading # is escaped");
});

test("a backslash in card text cannot cancel the Markdown escape", () => {
  const f = load("ok");
  f.roster.cards.find((x) => x.id === "fetcher").name = "\\[open\\](javascript:alert(1))";
  const md = renderCardMarkdown(viewOf(f, "fetcher"));
  for (const m of md.matchAll(/(\\*)\]\(javascript:/g)) {
    assert.equal(m[1].length % 2, 1, `"]" before javascript: must stay escaped: ${m[0]}`);
  }
});

test("a quote with backticks cannot break out of its code span", () => {
  const f = load("ok");
  const c = f.roster.cards.find((x) => x.id === "fetcher");
  const key = Object.keys(c.evidence).find((k) => Array.isArray(c.evidence[k]) && c.evidence[k].length);
  c.evidence[key][0].quote = 'a `` <img src="http://127.0.0.1:9/x.png"> `` b';
  const md = renderCardMarkdown(viewOf(f, "fetcher"));
  const row = md.split("\n").find((l) => l.includes("127.0.0.1:9/x.png"));
  const cell = row.split(" | ")[3];
  const fence = cell.match(/^`+/)[0];
  const inner = cell.slice(fence.length, -fence.length);
  assert.ok(cell.endsWith(fence), "closed by the same fence");
  const longest = Math.max(0, ...(inner.match(/`+/g) ?? []).map((r) => r.length));
  assert.ok(fence.length > longest, `fence ${fence.length} must be longer than the longest backtick run ${longest}`);
});

test("CLI refuses a linked output folder, run folder or cards folder and writes nothing there", async () => {
  const { symlinkSync, mkdirSync } = await import("node:fs");
  for (const where of ["output", "run", "cards"]) {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
    try {
      const target = path.join(tmp, "elsewhere");
      mkdirSync(target);
      let run;
      if (where === "output") {
        cpSync(fx("ok").pathname, path.join(target, "run-1"), { recursive: true });
        symlinkSync("elsewhere", path.join(tmp, ".agentroster"));
        run = path.join(tmp, ".agentroster", "run-1");
      } else if (where === "run") {
        cpSync(fx("ok").pathname, path.join(target, "real"), { recursive: true });
        mkdirSync(path.join(tmp, ".agentroster"));
        symlinkSync(path.join(target, "real"), path.join(tmp, ".agentroster", "run-1"));
        run = path.join(tmp, ".agentroster", "run-1");
      } else {
        run = path.join(tmp, ".agentroster", "run-1");
        cpSync(fx("ok").pathname, run, { recursive: true });
        symlinkSync(target, path.join(run, "cards"));
      }
      const r = cli([run]);
      assert.equal(r.code, 2, `${where}: ${r.out}${r.err}`);
      assert.match(r.err, /is a link\n$/, where);
      const written = readdirSync(target, { recursive: true }).filter((f) => /cards\.html$|\.md$/.test(f) && !/map\.md$/.test(f));
      assert.deepEqual(written, [], `${where}: nothing rendered at the link's target`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("CLI refuses a linked card file and leaves its target alone", async () => {
  const { symlinkSync, mkdirSync } = await import("node:fs");
  withRun("ok", (run) => {
    mkdirSync(path.join(run, "cards"));
    writeFileSync(path.join(run, "victim.txt"), "keep me\n");
    symlinkSync(path.join(run, "victim.txt"), path.join(run, "cards", "fetcher.md"));
    const r = cli([run]);
    assert.equal(r.code, 2);
    assert.match(r.err, /fetcher\.md \(is a link\)\n$/);
    assert.equal(readFileSync(path.join(run, "victim.txt"), "utf8"), "keep me\n");
  });
});

test("CLI renders again into the same run folder", () => {
  withRun("ok", (run) => {
    assert.equal(cli([run]).code, 0);
    const r = cli([run]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(readFileSync(path.join(run, "cards", "fetcher.md"), "utf8"), expected("fetcher"));
  });
});
