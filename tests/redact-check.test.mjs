import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findLeaks, readConfigValues, readEnvValues } from "../skills/agentroster/scripts/redact-check.mjs";

const script = "skills/agentroster/scripts/redact-check.mjs";
const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), encoding: "utf8" });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
const put = (root, rel, text) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

// Secret-shaped values are built at run time so no literal secret sits in this file.
const shapes = {
  "sk-": "sk-FAKE-redact-0001-abcdefgh",
  ghp_: "ghp_" + "FAKE".repeat(9),
  github_pat_: "github_pat_" + "FAKE_redact_0001_abcdef",
  AKIA: "AKIA" + "FAKEFAKE" + "12345678",
  xox: "xoxb-" + "FAKE-redact-0001",
  AIza: "AIza" + "FAKE".repeat(8) + "abc",
  pem: "-----BEGIN " + "RSA PRIVATE KEY-----",
};

for (const [name, value] of Object.entries(shapes)) {
  test(`finds the ${name} shape on the right line`, () => {
    const leaks = findLeaks([{ path: "a.md", text: `one\ntwo ${value} end\nthree` }], []);
    assert.deepEqual(leaks, [{ file: "a.md", line: 2, kind: "secret-shaped" }]);
    assert.ok(!JSON.stringify(leaks).includes(value));
  });
}

test("no secrets gives an empty list", () => {
  assert.deepEqual(findLeaks([{ path: "a.md", text: "just words\nsk-short" }], []), []);
});

test("a .env value in text is found as value from .env", () => {
  const value = "hunter-FAKE-value-99";
  const leaks = findLeaks([{ path: "map.md", text: `x\nuses ${value} here` }], [value]);
  assert.deepEqual(leaks, [{ file: "map.md", line: 2, kind: "value from .env" }]);
});

test("short env values are ignored", () => {
  assert.deepEqual(findLeaks([{ path: "m.md", text: "DEBUG=1 and 1234567" }], ["1", "1234567"]), []);
});

test("leaks are sorted by file then line", () => {
  const v = shapes["sk-"];
  const leaks = findLeaks(
    [{ path: "b.md", text: v }, { path: "a.md", text: `x\n${v}\n${v}` }],
    [],
  );
  assert.deepEqual(leaks.map((l) => `${l.file}:${l.line}`), ["a.md:2", "a.md:3", "b.md:1"]);
});

test("readEnvValues reads .env and .env.* below the root, skips junk folders and links", () => {
  const root = tmp();
  put(root, ".env", 'A=FAKE-value-one\nB="FAKE-value-two"\nC=short\n# D=FAKE-comment-value\nexport E=\'FAKE-value-three\'\n');
  put(root, "sub/.ENV.local", "F=FAKE-value-four\n");
  put(root, "node_modules/x/.env", "G=FAKE-skipped-value\n");
  put(root, ".agentroster/r/.env", "H=FAKE-skipped-value2\n");
  const outside = tmp();
  put(outside, ".env", "I=FAKE-outside-value\n");
  fs.symlinkSync(outside, path.join(root, "linked"));
  fs.symlinkSync(path.join(outside, ".env"), path.join(root, "sub", ".env.link"));
  const values = readEnvValues(root);
  for (const want of ["FAKE-value-one", "FAKE-value-two", "FAKE-value-three", "FAKE-value-four"]) {
    assert.ok(values.includes(want), want);
  }
  assert.ok(!values.some((v) => /skipped|outside|comment|short/.test(v)));
});

test("readEnvValues gives [] when there is no .env", () => {
  assert.deepEqual(readEnvValues(tmp()), []);
});

test("CLI: a leak gives exit 1 and never prints the value", () => {
  const dir = tmp();
  const value = shapes["sk-"];
  put(dir, "map.md", `ok\nkey ${value}\n`);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: map.md:2 (secret-shaped)\nleaks: 1\n");
  assert.ok(!r.stdout.includes(value) && !r.stderr.includes(value));
});

test("CLI: clean run gives exit 0", () => {
  const dir = tmp();
  put(dir, "map.md", "nothing here\n");
  put(dir, "cards/a.md", "nor here\n");
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "clean: 2 files\n");
});

test("CLI: --project compares against .env values without printing them", () => {
  const dir = tmp();
  const project = tmp();
  const value = "hunter-FAKE-value-99";
  put(project, ".env", `TOKEN=${value}\n`);
  put(dir, "map.md", `uses ${value}\n`);
  const r = run(dir, "--project", project);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: map.md:1 (value from .env)\nleaks: 1\n");
  assert.ok(!r.stdout.includes(value) && !r.stderr.includes(value));
});

test("CLI: missing run folder gives exit 2", () => {
  const dir = path.join(tmp(), "nope");
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), `cannot read ${dir} (not found)`);
});

test("CLI: a file given as the run folder gives exit 2", () => {
  const dir = tmp();
  put(dir, "f.md", "x");
  const r = run(path.join(dir, "f.md"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read .*f\.md \(is not a folder\)/);
});

test("CLI: usage error gives exit 2", () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: redact-check\.mjs/);
});

test("CLI: a link in the run folder is a failure, and it is not followed", () => {
  const dir = tmp();
  const outside = tmp();
  put(outside, "leak.md", shapes["sk-"]);
  put(dir, "map.md", "fine\n");
  fs.symlinkSync(outside, path.join(dir, "linkdir"));
  fs.symlinkSync(path.join(outside, "leak.md"), path.join(dir, "linkfile.md"));
  fs.mkdirSync(path.join(dir, "cards"));
  fs.symlinkSync(path.join(outside, "leak.md"), path.join(dir, "cards", "a.md"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: cards/a.md (link)\nleak: linkdir (link)\nleak: linkfile.md (link)\nleaks: 3\n");
  assert.ok(!r.stdout.includes("secret-shaped"));
});

test("CLI: a named pipe in the run folder is a failure", () => {
  const dir = tmp();
  put(dir, "map.md", "fine\n");
  const made = spawnSync("mkfifo", [path.join(dir, "pipe")]);
  if (made.status !== 0) return;
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: pipe (not a regular file)\nleaks: 1\n");
});

test("CLI: files named like secrets and git-ignored run folders are still scanned", () => {
  const project = tmp();
  spawnSync("git", ["init", "-q"], { cwd: project });
  put(project, ".gitignore", ".agentroster/\n");
  const dir = path.join(project, ".agentroster", "run-1");
  put(dir, "secrets.md", `key ${shapes.ghp_}\n`);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: secrets.md:1 (secret-shaped)\nleaks: 1\n");
});

test("CLI: a file with a NUL byte is scanned as latin1 text", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "x.bin"), Buffer.concat([Buffer.from([0, 1, 2, 10]), Buffer.from(shapes["sk-"])]));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "leak: x.bin:2 (secret-shaped)\nleaks: 1\n");
});

test("CLI: UTF-16 files with a byte-order mark are decoded and scanned", () => {
  for (const [name, bom, enc] of [["le.txt", [0xff, 0xfe], "utf16le"], ["be.txt", [0xfe, 0xff], "be"]]) {
    const dir = tmp();
    let body = Buffer.from(`hi\n${shapes["sk-"]}\n`, "utf16le");
    if (enc === "be") body = body.swap16();
    fs.writeFileSync(path.join(dir, name), Buffer.concat([Buffer.from(bom), body]));
    const r = run(dir);
    assert.equal(r.status, 1, name);
    assert.equal(r.stdout, `leak: ${name}:2 (secret-shaped)\nleaks: 1\n`);
  }
});

test("sk- needs a left boundary", () => {
  const k = shapes["sk-"];
  const hit = (t) => findLeaks([{ path: "a", text: t }], []).length;
  assert.equal(hit("the task-planner-orchestrator agent"), 0);
  assert.equal(hit(`key=${k}`), 1);
  assert.equal(hit(`"${k}"`), 1);
});

test("readEnvValues parses like dotenv", () => {
  const root = tmp();
  put(root, ".env", [
    "A=FAKE-plain-one # note",
    'B="FAKE-quoted-two" # note',
    "export C = FAKE-spaced-three",
    'D="FAKE-multi-four',
    'FAKE-multi-five"',
    "E='FAKE-single-six' trailing",
    "F=`FAKE-tick-seven`",
    "",
  ].join("\n"));
  const v = readEnvValues(root);
  for (const want of ["FAKE-plain-one", "FAKE-quoted-two", "FAKE-spaced-three", "FAKE-multi-four", "FAKE-multi-five", "FAKE-single-six", "FAKE-tick-seven"]) {
    assert.ok(v.includes(want), want);
  }
});

test("a double-quoted value with \\n escapes is split into lines", () => {
  const root = tmp();
  put(root, ".env", 'K="FAKE-first-line\\nFAKE-second-line"\n');
  const v = readEnvValues(root);
  assert.ok(v.includes("FAKE-first-line") && v.includes("FAKE-second-line"));
});

test("an env value in the middle of a long line is found", () => {
  const v = "FAKE-middle-value";
  assert.equal(findLeaks([{ path: "a", text: `lots of words ${v}, more words` }], [v]).length, 1);
});

test("CLI: an unreadable .env fails closed", { skip: process.getuid?.() === 0 }, () => {
  const dir = tmp();
  const project = tmp();
  put(dir, "map.md", "fine\n");
  put(project, ".env", "K=FAKE-hidden-value\n");
  fs.chmodSync(path.join(project, ".env"), 0);
  const r = run(dir, "--project", project);
  fs.chmodSync(path.join(project, ".env"), 0o600);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), `cannot read ${path.join(project, ".env")} (no permission)`);
});

test("CLI: a linked run folder is refused", () => {
  const real = tmp();
  const link = path.join(tmp(), "link");
  fs.symlinkSync(real, link);
  const r = run(link);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), `cannot read ${link} (is a link)`);
});

test("an unterminated quote does not hide the next line's value", () => {
  const root = tmp();
  put(root, ".env", 'A="unterminated\nB=FAKE-next-line-value\n');
  assert.ok(readEnvValues(root).includes("FAKE-next-line-value"));
});

test("backslash is literal in single quotes and backticks; unquoted values cut at #", () => {
  const root = tmp();
  put(root, ".env", "K='FAKE-ends-in-slash\\'\nL=FAKE-hash-cut#tail\nM=`FAKE-tick-slash\\`\n");
  const v = readEnvValues(root);
  assert.ok(v.includes("FAKE-ends-in-slash\\"));
  assert.ok(v.includes("FAKE-hash-cut"));
  assert.ok(v.includes("FAKE-tick-slash\\"));
});

test("escaped or url-encoded text before a key does not hide it", () => {
  const k = shapes["sk-"];
  const hit = (t, env = []) => findLeaks([{ path: "a", text: t }], env);
  assert.deepEqual(hit(`{"a":"x\\nsk-${k.slice(3)}"}`), [{ file: "a", line: 1, kind: "secret-shaped" }]);
  assert.equal(hit(`q=%22${k}`).length, 1);
  assert.equal(hit(`x\\u0022${k}`).length, 1);
  const v = "FAKE-env-value-9";
  assert.deepEqual(hit(`a%3D${v.replace("-", "%2D")}`, [v]), [{ file: "a", line: 1, kind: "value from .env" }]);
});

const mcp = (token, bearer) => JSON.stringify({
  mcpServers: { x: { env: { API_TOKEN: token, SHORT: "abc" }, headers: { Authorization: `Bearer ${bearer}` } } },
});

test("readConfigValues collects env and headers strings from MCP and settings files", () => {
  const root = tmp();
  put(root, ".mcp.json", mcp("FAKE-mcp-token-1", "FAKE-bearer-tok-2"));
  put(root, "sub/.cursor/mcp.json", mcp("FAKE-cursor-tok-3", "FAKE-bearer-tok-4"));
  put(root, ".claude/settings.local.json", JSON.stringify({ env: { K: "FAKE-settings-tok-5" }, other: "FAKE-not-collected" }));
  put(root, "node_modules/p/.mcp.json", mcp("FAKE-skipped-tok-6", "FAKE-skipped-tok-7"));
  const v = readConfigValues(root);
  for (const want of ["FAKE-mcp-token-1", "FAKE-bearer-tok-2", "Bearer FAKE-bearer-tok-2", "FAKE-cursor-tok-3", "FAKE-bearer-tok-4", "FAKE-settings-tok-5"]) {
    assert.ok(v.includes(want), want);
  }
  assert.ok(!v.some((x) => /skipped|not-collected|^abc$/.test(x)));
});

test("CLI: a config token copied into a run file is a leak, the value is not printed", () => {
  for (const [token, bearer] of [["FAKE-mcp-token-1", "FAKE-bearer-tok-2"]]) {
    for (const copied of [token, bearer]) {
      const dir = tmp();
      const project = tmp();
      put(project, ".mcp.json", mcp(token, bearer));
      put(dir, "map.md", `x\nsee ${copied} here\n`);
      const r = run(dir, "--project", project);
      assert.equal(r.status, 1);
      assert.equal(r.stdout, "leak: map.md:2 (value from config)\nleaks: 1\n");
      assert.ok(!r.stdout.includes(copied) && !r.stderr.includes(copied));
    }
  }
});

test("CLI: a short config value is ignored", () => {
  const dir = tmp();
  const project = tmp();
  put(project, ".mcp.json", mcp("FAKE-mcp-token-1", "FAKE-bearer-tok-2"));
  put(dir, "map.md", "abc\n");
  assert.equal(run(dir, "--project", project).status, 0);
});

test("CLI: a broken .mcp.json fails closed", () => {
  const dir = tmp();
  const project = tmp();
  put(dir, "map.md", "fine\n");
  put(project, ".mcp.json", "{ not json");
  const r = run(dir, "--project", project);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), `cannot read ${path.join(project, ".mcp.json")} (not valid JSON)`);
});

test("JSONC config files (comments, trailing commas, URLs) are read", () => {
  const root = tmp();
  put(root, ".vscode/mcp.json", [
    "{",
    "  // a line comment",
    "  /* a block",
    "     comment */",
    '  "servers": { "x": {',
    '    "url": "https://example.test/a//b",',
    '    "env": { "API_TOKEN": "FAKE-jsonc-token-1", "Q": "say \\"hi\\" // not a comment FAKE", },',
    "  }, },",
    "}",
  ].join("\n"));
  const v = readConfigValues(root);
  assert.ok(v.includes("FAKE-jsonc-token-1"));
  assert.ok(v.includes('say "hi" // not a comment FAKE'));
  assert.ok(!v.some((x) => x.includes("example.test")));
  const dir = tmp();
  put(dir, "map.md", "token FAKE-jsonc-token-1\n");
  const r = run(dir, "--project", root);
  assert.equal(r.stdout, "leak: map.md:1 (value from config)\nleaks: 1\n");
});

test("CLI: a config file still broken after stripping fails closed", () => {
  const dir = tmp();
  const project = tmp();
  put(dir, "map.md", "fine\n");
  put(project, ".vscode/mcp.json", '{ // note\n "a": [1, 2,, ] }');
  const r = run(dir, "--project", project);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), `cannot read ${path.join(project, ".vscode", "mcp.json")} (not valid JSON)`);
});

test("secrets passed as MCP args are collected", () => {
  const root = tmp();
  put(root, ".mcp.json", JSON.stringify({
    mcpServers: { x: { command: "npx", args: ["-y", "some-package-name", "--api-key", "FAKE-arg-key-value-1", "--Token=FAKE-arg-token-2", "--verbose=yes-please-ok", "--name=plain-name-value"] } },
  }));
  const v = readConfigValues(root);
  assert.ok(v.includes("FAKE-arg-key-value-1"));
  assert.ok(v.includes("FAKE-arg-token-2"));
  assert.ok(!v.some((x) => /some-package-name|^-y$|yes-please|plain-name|--api-key/.test(x)));
  for (const copied of ["FAKE-arg-key-value-1", "FAKE-arg-token-2"]) {
    const dir = tmp();
    put(dir, "map.md", `ran with ${copied}\n`);
    const r = run(dir, "--project", root);
    assert.equal(r.stdout, "leak: map.md:1 (value from config)\nleaks: 1\n");
  }
});

const argsConfig = (args) => JSON.stringify({ mcpServers: { x: { command: "npx", args } } });

for (const [name, args, want] of [
  ["--header then a bearer token", ["-y", "mcp-remote", "--header", "Authorization: Bearer FAKE-hdr-tok-1"], "FAKE-hdr-tok-1"],
  ["--header=Authorization: Bearer", ["mcp-remote", "--header=Authorization: Bearer FAKE-hdr-tok-2"], "FAKE-hdr-tok-2"],
  ["a token in a URL query (?api_key=)", ["mcp-remote", "https://example.test/mcp?api_key=FAKE-url-key-3&x=1"], "FAKE-url-key-3"],
  ["a token in a URL query (&TOKEN=)", ["mcp-remote", "https://example.test/mcp?a=1&TOKEN=FAKE-url-tok-4#part"], "FAKE-url-tok-4"],
]) {
  test(`MCP args: ${name} is collected and found`, () => {
    const root = tmp();
    put(root, ".mcp.json", argsConfig(args));
    assert.ok(readConfigValues(root).includes(want), want);
    const dir = tmp();
    put(dir, "map.md", `ran with ${want}\n`);
    const r = run(dir, "--project", root);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "leak: map.md:1 (value from config)\nleaks: 1\n");
    assert.ok(!r.stdout.includes(want) && !r.stderr.includes(want));
  });
}

test("JSONC: a trailing comma followed by a comment is read", () => {
  const root = tmp();
  put(root, ".vscode/mcp.json", [
    "{",
    '  "servers": { "x": {',
    '    "args": ["a", /* last */ "b", /* end */ ],',
    '    "env": { "API_TOKEN": "FAKE-jsonc-token-9", // note',
    "    },",
    "  }, // done",
    "  },",
    "}",
  ].join("\n"));
  assert.ok(readConfigValues(root).includes("FAKE-jsonc-token-9"));
});

test("CLI: linked .env files are counted as not compared, without their contents", () => {
  const project = tmp();
  const outside = tmp();
  const value = "FAKE-linked-env-value";
  put(outside, "real.env", `A=${value}\n`);
  put(project, "app.py", "x\n");
  fs.symlinkSync(path.join(outside, "real.env"), path.join(project, ".env"));
  fs.mkdirSync(path.join(project, "sub"));
  fs.symlinkSync(path.join(outside, "real.env"), path.join(project, "sub", ".env.local"));
  fs.symlinkSync(outside, path.join(project, "linked-folder"));
  const dir = tmp();
  put(dir, "map.md", "fine\n");
  const r = run(dir, "--project", project);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "clean: 1 files\n");
  assert.equal(r.stderr, "not compared: 2 linked .env files\n");
  assert.ok(!r.stderr.includes(value));
});

test("CLI: no linked .env files prints nothing on stderr", () => {
  const project = tmp();
  put(project, ".env", "A=FAKE-plain-env-value\n");
  const dir = tmp();
  put(dir, "map.md", "fine\n");
  const r = run(dir, "--project", project);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});
