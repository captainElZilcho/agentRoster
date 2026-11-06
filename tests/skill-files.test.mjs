import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MAP_SECTIONS } from "../skills/agentroster/scripts/check-map.mjs";

const skill = "skills/agentroster";
const read = (rel) => fs.readFileSync(path.join(skill, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(skill, rel));

/** Every Markdown file in the skill folder, as paths relative to it. */
function markdownFiles(dir = skill) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return markdownFiles(full);
    return e.name.endsWith(".md") ? [path.relative(skill, full)] : [];
  });
}

/** Script paths (`scripts/<name>.mjs`) named in a text. */
const scriptsNamed = (text) => [...new Set([...text.matchAll(/scripts\/([\w-]+\.mjs)/g)].map((m) => m[1]))];

/** Ecosystem notes (`ecosystems/<name>.md`) named in a text. */
const notesNamed = (text) => [...new Set([...text.matchAll(/ecosystems\/([\w-]+\.md)/g)].map((m) => m[1]))];

test("SKILL.md has the Agent Skills frontmatter", () => {
  const text = read("SKILL.md");
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  assert.ok(fm, "SKILL.md starts with a frontmatter block");
  assert.match(fm[1], /^name: agentroster$/m);
  const desc = /^description: (.+)$/m.exec(fm[1]);
  assert.ok(desc, "frontmatter has a one-line description");
  const value = desc[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  assert.ok(value.length >= 1 && value.length <= 1024, `description is ${value.length} characters`);
});

test("SKILL.md names the four scripts a map run uses", () => {
  const named = scriptsNamed(read("SKILL.md"));
  for (const s of ["detect.mjs", "validate-coverage.mjs", "check-map.mjs", "redact-check.mjs"]) {
    assert.ok(named.includes(s), `SKILL.md names scripts/${s}`);
  }
});

test("every script named in SKILL.md, MAP.md and VALIDATION.md exists", () => {
  for (const file of ["SKILL.md", "MAP.md", "VALIDATION.md"]) {
    const named = scriptsNamed(read(file));
    if (file !== "VALIDATION.md") assert.ok(named.length > 0, `${file} names at least one script`);
    for (const s of named) assert.ok(exists(`scripts/${s}`), `${file} names scripts/${s}, which does not exist`);
  }
});

test("every ecosystem note named in MAP.md exists, and generic.md is named", () => {
  const named = notesNamed(read("MAP.md"));
  assert.ok(named.includes("generic.md"), "MAP.md names ecosystems/generic.md");
  for (const n of named) assert.ok(exists(`ecosystems/${n}`), `MAP.md names ecosystems/${n}, which does not exist`);
});

test("every ecosystem in patterns.json has a note (hand cards are covered in MAP.md)", () => {
  const patterns = JSON.parse(read("ecosystems/patterns.json")).patterns;
  const ecosystems = [...new Set(patterns.map((p) => p.ecosystem))].filter((e) => e !== "roster");
  assert.ok(ecosystems.length > 0);
  const named = notesNamed(read("MAP.md"));
  for (const e of ecosystems) {
    assert.ok(exists(`ecosystems/${e}.md`), `no note for ecosystem "${e}"`);
    assert.ok(named.includes(`${e}.md`), `MAP.md does not name ecosystems/${e}.md`);
  }
  assert.match(read("MAP.md"), /\.roster\.json/, "MAP.md covers hand-written roster cards");
});

test("each ecosystem note is under 150 lines and has the four parts", () => {
  const notes = fs.readdirSync(path.join(skill, "ecosystems")).filter((n) => n.endsWith(".md"));
  assert.ok(notes.includes("generic.md"));
  for (const n of notes) {
    const text = read(`ecosystems/${n}`);
    const lines = text.split("\n").length;
    assert.ok(lines < 150, `${n} has ${lines} lines`);
    for (const part of [/^## How to spot it/m, /^## Where things live/m, /^## Agent or workflow/m, /^## Traps/m]) {
      assert.match(text, part, `${n} is missing ${part}`);
    }
  }
});

test("MAP.md shows the eight map.md headings in the order check-map.mjs expects", () => {
  const text = read("MAP.md");
  const fenced = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    const h2 = inFence ? /^## (.+?)\s*$/.exec(line) : null;
    if (h2) fenced.push(h2[1]);
  }
  assert.deepEqual(fenced, MAP_SECTIONS);
});

test("MAP.md gives the order of checks after writing", () => {
  const text = read("MAP.md");
  const at = (s) => text.indexOf(`scripts/${s}`);
  assert.ok(at("validate-coverage.mjs") >= 0 && at("check-map.mjs") >= 0 && at("redact-check.mjs") >= 0);
  assert.ok(at("validate-coverage.mjs") < at("check-map.mjs"), "validate-coverage before check-map");
  assert.ok(at("check-map.mjs") < at("redact-check.mjs"), "check-map before redact-check");
});

test("no skill file links into the internal folder", () => {
  for (const f of markdownFiles()) {
    assert.doesNotMatch(read(f), /\.local\//, `${f} names .local/`);
  }
});

test("SKILL.md's secret file list matches what detect.mjs never opens", () => {
  const text = read("SKILL.md");
  const names = [
    ".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "*.kdbx",
    "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa",
    ".netrc", ".npmrc", ".pypirc", ".pgpass", ".ssh/", '"secret"', '"credential"',
  ];
  for (const n of names) assert.ok(text.includes(n), `SKILL.md does not list ${n}`);
});

test("no note calls a single fixed model call an agent", () => {
  for (const f of markdownFiles()) {
    assert.doesNotMatch(read(f), /even with no tools|kind agent\), but the model chooses nothing|kind agent, that chooses nothing/, f);
  }
});
