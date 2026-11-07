// Renders a run's cards: one Markdown card per agent or workflow in cards/<id>.md,
// and the offline HTML page cards.html. cardView() is the one place that decides
// what shows where; both renderers use it. Usage: render-cards.mjs <run-dir>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "./lib/cli.mjs";
import { compareText } from "./lib/order.mjs";
import { validateRosterFile } from "./validate-card.mjs";
import { validateCoverage } from "./validate-coverage.mjs";
import { CARD_VIEW_NS } from "./check-cards.mjs";

const GAP_NONE = "— none";
const GAP_NOT_DECLARED = "— not declared";
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Plain words for each unknown reason; "other" uses the unknown's own detail. */
const REASON_TEXT = {
  "loaded-from-database": "loaded from a database when the agent runs",
  "loaded-from-url": "loaded from a URL when the agent runs",
  "loaded-from-env": "loaded from an environment variable",
  "outside-repo": "kept outside the repository",
};

/** Card fields in plain words, for the "Not on this card" strip. */
const FIELD_LABELS = {
  "purpose": "What it does", "role": "Job", "goals": "Goals", "instructions": "Instructions",
  "skills": "Skills", "context": "Context", "engine.model": "Model", "runtime": "Runtime",
  "tools.allow": "Tools", "tools.deny": "Blocked tools", "tools.mcp": "MCP tools",
  "io.in": "Input", "io.out": "Output", "io.report": "Output format",
  "guardrails.permission": "Permission", "guardrails.forbidden": "Must not",
  "guardrails.needs_approval": "Needs approval", "guardrails.data": "Data",
  "guardrails.limits.turns": "Turn limit", "guardrails.limits.minutes": "Time limit",
  "guardrails.limits.usd": "Cost limit", "memory.scope": "Memory", "org.reports_to": "Reports to",
};

/** Order of card fields in the Sources list (by top-level field). */
const SOURCE_ORDER = [
  "purpose", "engine", "runtime", "role", "goals", "instructions", "skills", "tools",
  "context", "memory", "guardrails", "io", "handoffs", "org",
];

const getPath = (obj, p) =>
  p.split(".").reduce((v, k) => (v !== null && typeof v === "object" && Object.hasOwn(v, k) ? v[k] : undefined), obj);
const covers = (key, field) => key === field || key.startsWith(`${field}.`) || field.startsWith(`${key}.`);
const filled = (v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A value as short text. */
function asText(v) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x !== null ? (x.name ?? x.card ?? JSON.stringify(x)) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Decide what a card shows where.
 * @param {object} card A standard v0.2 card.
 * @param {object} roster The roster file it belongs to.
 * @param {Array<object>} unknowns The run's coverage unknowns.
 */
export function cardView(card, roster, unknowns = []) {
  const ext = card.extensions?.[CARD_VIEW_NS] ?? null;
  const evidence = card.evidence ?? {};
  const statedOnly = new Set(Array.isArray(ext?.stated_only) ? ext.stated_only : []);
  const fromHand = (field) =>
    Object.entries(evidence).some(([k, items]) => covers(k, field) && items.some((i) => i.found_by === "hand"));
  const marker = (field) => (statedOnly.has(field) ? "stated, not enforced" : fromHand(field) ? "from hand card" : undefined);
  const tile = (label, value, field, extra = {}) => {
    const t = { label, value, ...extra };
    const m = field ? marker(field) : undefined;
    if (m) t.marker = m;
    return t;
  };

  const gaps = unknowns
    .filter((u) => u.card === card.id)
    .map((u) => {
      const text = REASON_TEXT[u.reason] ?? u.detail ?? "not set in the code";
      const list = Array.isArray(getPath(card, u.field));
      return { field: u.field, label: FIELD_LABELS[u.field] ?? u.field, text: list ? `${text} (the list may be incomplete)` : text };
    });
  const gapFor = (field) => gaps.find((g) => g.field === field);

  const runtime = ext?.runtime_name
    ? ext.runtime_name + (ext.language ? ` · ${ext.language}` : "")
    : card.runtime ?? GAP_NONE;
  const runsOn = {
    title: "Runs on",
    tiles: [
      tile("Model", card.engine?.model ?? GAP_NONE, "engine.model", runtime.length > 24 ? { wide: true } : {}),
      tile("Runtime", runtime, "runtime", runtime.length > 24 ? { wide: true } : {}),
    ],
  };

  const reporting = (roster.cards ?? []).filter((c) => c.org?.reports_to === card.id);
  let steps = null;
  if (reporting.length > 0) {
    const known = Array.isArray(ext?.steps) && ext.steps.length > 0;
    steps = {
      order: known ? [...ext.steps] : reporting.map((c) => c.id).sort(compareText),
      known,
      withModel: reporting.length,
      plain: Number.isInteger(ext?.plain_steps) ? ext.plain_steps : null,
      starts: Array.isArray(ext?.starts) ? [...ext.starts] : [],
    };
  }

  const groups = [runsOn];
  if (!steps) {
    const allow = card.tools?.allow ?? [];
    const canDo = [
      tile(allow.length ? `Tools (${allow.length})` : "Tools", allow.length ? allow.join(" · ") : GAP_NONE, "tools.allow", { wide: true }),
    ];
    if (card.skills?.length) canDo.push(tile("Skills", card.skills.map((s) => s.name).join(" · "), "skills", { wide: true }));
    if (card.tools?.mcp?.length) canDo.push(tile("MCP tools", card.tools.mcp.join(" · "), "tools.mcp", { wide: true }));
    if (card.io?.in?.length || card.io?.out?.length) {
      canDo.push(tile("Takes → returns", `${(card.io.in ?? []).join(", ") || "—"} → ${(card.io.out ?? []).join(", ") || "—"}`, "io", { wide: true }));
    }
    groups.push({ title: "Can do", tiles: canDo });
  }

  const lim = card.guardrails?.limits ?? {};
  let limitTile;
  if (Number.isInteger(lim.turns)) limitTile = tile("Turn limit", plural(lim.turns, "turn"), "guardrails.limits.turns");
  else if (typeof lim.minutes === "number") limitTile = tile("Time limit", `${lim.minutes} min per run`, "guardrails.limits.minutes");
  else if (typeof lim.usd === "number") limitTile = tile("Cost limit", `$${lim.usd}`, "guardrails.limits.usd");
  else if (card.kind === "workflow" && !steps) limitTile = tile("Turns", "one call");
  else limitTile = tile("Limit", GAP_NONE);
  const permission = card.guardrails?.permission;
  const guard = [
    limitTile,
    permission
      ? tile("Permission", permission, "guardrails.permission")
      : tile("Permission", GAP_NOT_DECLARED, "guardrails.permission", { gap: true }),
  ];
  const forbidden = card.guardrails?.forbidden ?? [];
  if (forbidden.length) guard.push(tile("Must not", plural(forbidden.length, "rule"), "guardrails.forbidden"));
  groups.push({ title: "Guardrails", tiles: guard });

  const details = [];
  const detail = (label, value, field) => {
    const g = field ? gapFor(field) : null;
    if (g) details.push({ label, value: `○ not on this card — ${g.text}`, gap: true });
    else if (filled(value)) details.push({ label, value: asText(value) });
  };
  detail("Job", card.role, "role");
  detail("Goals", card.goals?.length ? card.goals.join("; ") : null, "goals");
  detail("Instructions", card.instructions, "instructions");
  detail("Must not", forbidden.length ? forbidden.join("; ") : null);
  detail("Needs approval", card.guardrails?.needs_approval?.length ? card.guardrails.needs_approval.join("; ") : null);
  detail("Data", card.guardrails?.data);
  detail("Returns", card.io?.report, "io.report");
  const mem = card.memory ?? {};
  detail("Memory", [mem.scope, mem.where, mem.retention].filter(filled).join(" · ") || null);
  detail("Context", card.context?.length ? card.context.join(", ") : null, "context");
  const from = (card.handoffs?.from ?? []).map((h) => h.card ?? asText(h));
  const to = (card.handoffs?.to ?? []).map((h) => h.card ?? asText(h));
  if (from.length || to.length) {
    detail("Handoffs", [from.length ? `from ${from.join(", ")}` : "", to.length ? `to ${to.join(", ")}` : ""].filter(Boolean).join(" · "));
  }
  details.push({ label: "Works with", value: card.org?.reports_to ? `reports to ${card.org.reports_to}` : "top level" });

  const rank = (key) => {
    const i = SOURCE_ORDER.indexOf(key.split(".")[0]);
    return i === -1 ? SOURCE_ORDER.length : i;
  };
  const coreKeys = Object.keys(evidence).sort((a, b) => rank(a) - rank(b) || compareText(a, b));
  const row = (field, value, item) => ({
    field,
    value: asText(value),
    where: item.line === null || item.line === undefined ? item.file : `${item.file}:${item.line}`,
    quote: item.quote ?? "",
    from: item.found_by === "hand" ? "hand card" : "code",
  });
  const sources = [];
  for (const key of coreKeys) for (const item of evidence[key]) sources.push(row(key, getPath(card, key), item));
  const extEvidence = ext?.evidence && typeof ext.evidence === "object" ? ext.evidence : {};
  for (const [field, items] of Object.entries(extEvidence)) {
    for (const item of Array.isArray(items) ? items : []) sources.push(row(`card view: ${field}`, ext[field], item));
  }

  const definition = card.definition && typeof card.definition === "object" && card.definition.score !== undefined
    ? `${card.definition.score} of 5`
    : "not rated yet";

  return {
    id: card.id,
    name: card.name,
    sub: card.purpose ?? "",
    app: card.app ?? null,
    reportsTo: card.org?.reports_to ?? null,
    kind: card.kind,
    type: card.type,
    gaps,
    groups,
    steps,
    details,
    sources,
    footer: { definition, evidence: sources.length },
  };
}

// Markdown

const mdCell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
function mdCode(s) {
  const text = mdCell(s);
  if (text === "") return "";
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}
const kindLabel = (kind) => (kind === "agent" ? "◆ agent" : "◇ workflow");

/** @param {ReturnType<typeof cardView>} v */
export function renderCardMarkdown(v) {
  const out = [`# ${v.name}`, ""];
  if (v.sub) out.push(v.sub, "");
  out.push([kindLabel(v.kind), v.type, v.app, v.reportsTo ? `↳ ${v.reportsTo}` : "top level"].filter(Boolean).join(" · "), "");
  if (v.gaps.length) {
    out.push("## Not on this card", "");
    for (const g of v.gaps) out.push(`- ○ ${g.label} — ${g.text}`);
    out.push("");
  }
  out.push("## Specs", "");
  const group = (g) => {
    out.push(`### ${g.title}`, "");
    for (const t of g.tiles) out.push(`- ${t.label}: ${t.value}${t.marker ? ` (${t.marker})` : ""}`);
    out.push("");
  };
  group(v.groups[0]);
  if (v.steps) {
    out.push("### Steps", "");
    out.push(v.steps.known ? `- Order: ${v.steps.order.join(", ")}` : `- Order not known: ${v.steps.order.join(", ")}`);
    out.push(`- With a model: ${v.steps.withModel}${v.steps.plain === null ? "" : ` · plain code: ${v.steps.plain}`}`);
    if (v.steps.starts.length) out.push(`- Starts: ${v.steps.starts.join(" · ")}`);
    out.push("");
  }
  for (const g of v.groups.slice(1)) group(g);
  out.push("## Details", "");
  for (const d of v.details) out.push(`- ${d.label}: ${d.value}`);
  out.push("");
  if (v.sources.length) {
    out.push("## Sources", "", "| Field | Value | Where | Quote | From |", "|---|---|---|---|---|");
    for (const s of v.sources) out.push(`| ${mdCell(s.field)} | ${mdCell(s.value)} | ${mdCell(s.where)} | ${mdCode(s.quote)} | ${s.from} |`);
    out.push("");
  }
  out.push(`Definition: ${v.footer.definition} · Evidence: ${plural(v.footer.evidence, "item")}`, "");
  return out.join("\n");
}

// HTML

const TEMPLATE_DIR = new URL("../templates/", import.meta.url);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fill = (template, values) =>
  Object.entries(values).reduce((out, [k, v]) => out.split(`{{${k}}}`).join(v), template);

function htmlTile(t) {
  const cls = ["tile", t.wide ? "wide" : "", t.gap ? "gap" : ""].filter(Boolean).join(" ");
  const mark = t.marker ? `<span class="mark">${esc(t.marker)}</span>` : "";
  return `<div class="${cls}"><div class="k">${esc(t.label)}</div><div class="v">${esc(t.value)}</div>${mark}</div>`;
}
const htmlGroup = (g) => `<div class="group"><h3>${esc(g.title)}</h3><div class="tiles">${g.tiles.map(htmlTile).join("")}</div></div>`;

function htmlSteps(steps, roster) {
  const kindOf = (id) => (roster.cards ?? []).find((c) => c.id === id)?.kind;
  const chips = steps.order
    .map((id) => {
      const agent = kindOf(id) === "agent";
      return `<span class="step ${agent ? "agent" : "workflow"}">${agent ? "◆" : "◇"} ${esc(id)}</span>`;
    })
    .join("");
  const count = `${steps.withModel} with a model${steps.plain === null ? "" : `, ${steps.plain} plain code`}`;
  const notes = [steps.known ? "" : "order not known", "◆ agent · ◇ workflow"].filter(Boolean).join(" · ");
  const starts = steps.starts.length
    ? `<div class="tiles" style="margin-top:7px"><div class="tile wide"><div class="k">Starts</div><div class="v">${esc(steps.starts.join(" · "))}</div></div></div>`
    : "";
  return `<div class="group"><h3>Steps (${esc(count)})</h3><div class="steps">${chips}</div><p class="note">${esc(notes)}</p>${starts}</div>`;
}

function htmlCard(v, roster) {
  const team = [v.app, v.reportsTo ? `↳ ${v.reportsTo}` : "top level"].filter(Boolean).join(" · ");
  const kind = v.kind === "agent" ? `<span class="tag agent">◆ agent</span>` : `<span class="tag workflow">◇ workflow</span>`;
  const strip = v.gaps.length
    ? `<div class="strip">○ <b>Not on this card:</b> ${
        v.gaps.length === 1
          ? `${esc(v.gaps[0].label)} — ${esc(v.gaps[0].text)}`
          : `<ul>${v.gaps.map((g) => `<li>${esc(g.label)} — ${esc(g.text)}</li>`).join("")}</ul>`
      }</div>`
    : "";
  const groups = [htmlGroup(v.groups[0]), v.steps ? htmlSteps(v.steps, roster) : "", ...v.groups.slice(1).map(htmlGroup)].join("");
  const inside = v.details.map((d) => d.label.toLowerCase()).join(", ");
  const details = v.details
    .map((d) => `<p><span class="k">${esc(d.label)}</span><span${d.gap ? ' class="gapv"' : ""}>${esc(d.value)}</span></p>`)
    .join("");
  const sources = v.sources.length
    ? `<p class="label" style="margin-top:12px">Sources</p><table class="sources"><thead><tr><th>Field</th><th>Value</th><th>Where</th><th>From</th></tr></thead><tbody>${v.sources
        .map((s) => `<tr><td>${esc(s.field)}</td><td>${esc(s.value)}</td><td><code>${esc(s.where)}</code><br><code>${esc(s.quote)}</code></td><td>${esc(s.from)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  return `<article class="card" id="card-${esc(v.id)}">
<div class="top"><div class="team">${esc(team)}</div><h2>${esc(v.name)}</h2><p class="sub">${esc(v.sub)}</p><div class="tags">${kind}<span class="tag">${esc(v.type)}</span></div></div>
${strip}<div class="specs"><p class="label">Specs</p>${groups}</div>
<details class="more"><summary><span>Details · ${esc(inside)}</span><span class="chev">▸</span></summary><div class="det">${details}${sources}</div></details>
<div class="foot"><span>Definition: ${esc(v.footer.definition)}</span><span>Evidence: ${esc(plural(v.footer.evidence, "item"))}</span></div>
</article>`;
}

/**
 * The offline HTML page: a flat grid of closed cards, A to Z by name.
 * @param {object} roster A valid roster file.
 * @param {object} coverage A valid coverage document.
 * @returns {string}
 */
export function renderCardsPage(roster, coverage) {
  const cards = [...(roster.cards ?? [])].sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
  const views = cards.map((c) => cardView(c, roster, coverage.unknowns ?? []));
  const agents = cards.filter((c) => c.kind === "agent").length;
  const workflows = cards.length - agents;
  const gaps = views.reduce((n, v) => n + v.gaps.length, 0);
  const counts = `${plural(agents, "agent")} · ${plural(workflows, "workflow")} · ${plural(gaps, "gap")}`;
  const run = [roster.snapshot?.project, roster.snapshot?.id].filter(Boolean).join(" · ");
  const body = views.length
    ? `<div class="grid">\n${views.map((v) => htmlCard(v, roster)).join("\n")}\n</div>`
    : `<p class="empty">No agents or workflows found.</p>`;
  const template = readFileSync(new URL("cards.html", TEMPLATE_DIR), "utf8");
  const css = readFileSync(new URL("cards.css", TEMPLATE_DIR), "utf8");
  return fill(template, { CSS: css.trim(), COUNTS: esc(counts), RUN: esc(run), CARDS: body });
}

// Command line

const USAGE = "usage: render-cards.mjs <run-dir>";
class CliError extends Error {}
const reason = (err) =>
  ({ ENOENT: "not found", EACCES: "no permission", EPERM: "no permission", EISDIR: "is a folder" })[err?.code] ?? "unreadable";

function readJson(file) {
  let text;
  try {
    text = readFileSync(file, "utf8").replace(/^﻿/, "");
  } catch (err) {
    throw new CliError(`cannot read ${file} (${reason(err)})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(`cannot read ${file} (not valid JSON)`);
  }
}

/** @returns {number} Exit code: 0 written, 2 input missing or invalid. */
export function runRenderCardsCli(args, { renderPage = renderCardsPage } = {}) {
  try {
    if (args.length !== 1) throw new CliError(USAGE);
    const dir = args[0];
    const roster = readJson(path.join(dir, "roster.json"));
    const coverage = readJson(path.join(dir, "coverage.json"));
    if (!validateRosterFile(roster).valid) throw new CliError("invalid roster.json: run validate-card.mjs for details");
    if (!validateCoverage(coverage).valid) throw new CliError("invalid coverage.json: run validate-coverage.mjs for details");
    for (const c of roster.cards) if (!SAFE_ID.test(c.id)) throw new CliError(`bad card id "${c.id}"`);

    const cardsDir = path.join(dir, "cards");
    mkdirSync(cardsDir, { recursive: true });
    for (const c of roster.cards) {
      writeFileSync(path.join(cardsDir, `${c.id}.md`), renderCardMarkdown(cardView(c, roster, coverage.unknowns)));
    }
    if (renderPage) writeFileSync(path.join(dir, "cards.html"), renderPage(roster, coverage));
    console.log(`written: ${plural(roster.cards.length, "card")} in ${cardsDir}`);
    return 0;
  } catch (err) {
    console.error(err instanceof CliError ? err.message : "error: unexpected failure");
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runRenderCardsCli(process.argv.slice(2));
}
