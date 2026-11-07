import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { renderCardsPage } from "../skills/agentroster/scripts/render-cards.mjs";

const fx = (name) => new URL(`./fixtures/cards-check/${name}/`, import.meta.url);
const load = (name) => ({
  roster: JSON.parse(readFileSync(new URL("roster.json", fx(name)), "utf8")),
  coverage: JSON.parse(readFileSync(new URL("coverage.json", fx(name)), "utf8")),
});
const page = (f) => renderCardsPage(f.roster, f.coverage);
const articles = (html) => html.split("<article").slice(1).map((a) => a.slice(0, a.indexOf("</article>")));
const articleFor = (html, id) => articles(html).find((a) => a.includes(`id="card-${id}"`));
const SCRIPT = new URL("../skills/agentroster/scripts/render-cards.mjs", import.meta.url).pathname;

test("the 'Not on this card' strip comes before the specs and outside the details", () => {
  const a = articleFor(page(load("ok")), "fetcher");
  const strip = a.indexOf("Not on this card");
  assert.ok(strip > 0);
  assert.ok(strip < a.indexOf("Runs on"));
  assert.ok(strip < a.indexOf("<details"));
  assert.match(a, /Instructions — loaded from a database when the agent runs/);
});

test("every card's details start closed and the summary says what is inside", () => {
  const html = page(load("ok"));
  for (const a of articles(html)) {
    assert.match(a, /<details class="more">/);
    assert.doesNotMatch(a, /<details[^>]*\bopen\b/);
  }
  assert.match(articleFor(html, "fetcher"), /<summary><span>Details · job, goals, instructions, must not, works with</);
});

test("the page loads nothing from the network", () => {
  const html = page(load("ok"));
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /(src|href)\s*=\s*["']\/\//);
  assert.doesNotMatch(html, /url\(\s*["']?\/\//);
});

test("no tile can cut off a value", () => {
  const html = page(load("ok"));
  assert.doesNotMatch(html, /text-overflow|ellipsis|line-clamp/);
});

test("the theme toggle is the page's only script", () => {
  const html = page(load("ok"));
  assert.equal(html.match(/<script\b/g).length, 1);
  assert.match(html, /<button[^>]*aria-label="[^"]+"/);
});

test("card text is escaped", () => {
  const f = load("ok");
  f.roster.cards[1].purpose = '<script>alert(1)</script> & "quoted"';
  const html = page(f);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;"));
  assert.equal(html.match(/<script\b/g).length, 1);
});

test("long values appear in full", () => {
  const f = load("ok");
  const tools = Array.from({ length: 20 }, (_, i) => `tool_number_${i + 1}`);
  const purpose = "word ".repeat(80).trim();
  f.roster.cards[1].tools.allow = tools;
  f.roster.cards[1].purpose = purpose;
  const html = page(f);
  assert.ok(html.includes(tools.join(" · ")));
  assert.ok(html.includes(purpose));
});

test("an unknown on a field no tile shows still appears on the closed card", () => {
  const f = load("ok");
  f.coverage.unknowns[0].field = "tools.mcp";
  f.coverage.unknowns[0].reason = "outside-repo";
  const a = articleFor(page(f), "fetcher");
  const strip = a.indexOf("MCP tools — kept outside the repository");
  assert.ok(strip > 0 && strip < a.indexOf("<details"));
});

test("the header counts agents, workflows and gaps, and cards run A to Z", () => {
  const html = page(load("ok"));
  assert.match(html, /1 agent · 1 workflow · 1 gap/);
  assert.ok(html.indexOf('id="card-daily-digest"') < html.indexOf('id="card-fetcher"'));
  assert.match(html, /tiny-app/);
  assert.match(html, /run-2026-11-07-1/);
});

test("kind shows as a word and a shape", () => {
  const html = page(load("ok"));
  assert.match(articleFor(html, "fetcher"), /◆ agent/);
  assert.match(articleFor(html, "daily-digest"), /◇ workflow/);
});

test("a run with no cards says so", () => {
  assert.match(page(load("empty")), /No agents or workflows found/);
});

test("two renders are identical", () => {
  assert.equal(page(load("ok")), page(load("ok")));
});

test("CLI writes cards.html next to cards/", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
  try {
    cpSync(fx("ok").pathname, tmp, { recursive: true });
    const r = spawnSync(process.execPath, [SCRIPT, tmp], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(path.join(tmp, "cards.html")));
    assert.equal(readFileSync(path.join(tmp, "cards.html"), "utf8"), page(load("ok")));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("cards are at least 360px wide so model names fit on one line", () => {
  assert.match(page(load("ok")), /minmax\(360px, 1fr\)/);
});
