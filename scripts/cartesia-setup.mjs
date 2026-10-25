#!/usr/bin/env node
/**
 * Create or update the Lintel Reviewer agent and its three read-only webhook tools.
 *
 * Does not buy a phone number. Attaching one is optional:
 *   node --experimental-strip-types scripts/cartesia-setup.mjs --phone
 *
 * Dry run prints payloads and does not call Cartesia:
 *   node --experimental-strip-types scripts/cartesia-setup.mjs --dry-run
 *
 * Live env: CARTESIA_API_KEY, CONVEX_SITE_URL, LINTEL_VOICE_TOOL_SECRET.
 * Optional: CARTESIA_AGENT_MODEL, CARTESIA_VOICE_ID, CARTESIA_REVIEWER_AGENT_ID.
 * --phone also needs CARTESIA_PHONE_NUMBER_ID.
 *
 * API notes (docs read Oct 25, 2026; not called from this machine):
 * - Agents and tools: https://api.cartesia.ai/v1/... with Authorization: Bearer and Cartesia-Version: 2026-08-14.
 * - Phone list and update have no /v1 prefix: PATCH /agents/phone-numbers/{id}.
 *   One phone guide curl sends X-API-Key. The OpenAPI scheme is Bearer. This script sends Bearer.
 * - PATCH /v1/agents/tools/{id} is described on the webhook tools page. A separate Update Tool page was not opened.
 * - GET /v1/agents/models response wrapper was not fully specified. Live mode accepts a bare array or { data: [] }.
 */

import {
  DEFAULT_VOICE_ID,
  PREFERRED_MODEL_ID,
  REVIEWER_NAME,
  buildReviewerAgentBody,
  buildReviewerTools,
} from "../src/voice/reviewerAgent.ts";

const VERSION = "2026-08-14";
const API = "https://api.cartesia.ai";

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== "--dry-run" && arg !== "--phone") {
    console.error(`Unknown argument ${arg}`);
    process.exit(1);
  }
}
const dryRun = args.has("--dry-run");
const attachPhone = args.has("--phone");

const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "") || "https://YOUR_DEPLOYMENT.convex.site";
const secret = process.env.LINTEL_VOICE_TOOL_SECRET ?? "";
const modelId = process.env.CARTESIA_AGENT_MODEL || PREFERRED_MODEL_ID;
const voiceId = process.env.CARTESIA_VOICE_ID || DEFAULT_VOICE_ID;
const phoneNumberId = process.env.CARTESIA_PHONE_NUMBER_ID ?? "";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function redact(value, hidden) {
  if (Array.isArray(value)) return value.map((item) => redact(item, hidden));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = key === "secret_value" ? "<LINTEL_VOICE_TOOL_SECRET>" : redact(item, hidden);
    }
    return out;
  }
  if (typeof value === "string" && hidden && value.includes(hidden)) {
    return value.replaceAll(hidden, "<LINTEL_VOICE_TOOL_SECRET>");
  }
  return value;
}

function phonePayload(agentId) {
  return {
    method: "PATCH",
    path: `/agents/phone-numbers/${phoneNumberId || "<CARTESIA_PHONE_NUMBER_ID>"}`,
    note: "No /v1 prefix. This path was taken from the phone-number OpenAPI page. The script does not buy a number.",
    body: { agent_id: agentId },
  };
}

if (dryRun) {
  const tools = buildReviewerTools({ siteUrl, secret: secret || "<LINTEL_VOICE_TOOL_SECRET>" });
  const agent = buildReviewerAgentBody({
    toolIds: tools.map((tool) => `<${tool.name} tool id>`),
    modelId,
    voiceId,
  });
  const payload = {
    dry_run: true,
    phone: attachPhone,
    site_url: siteUrl,
    notes: [
      "No Cartesia call was made.",
      "secret_value is redacted.",
      attachPhone
        ? "Phone attach included because --phone was set. Buy the number yourself, then set CARTESIA_PHONE_NUMBER_ID."
        : "Phone attach skipped. Creating the agent does not need a number. Pass --phone later to attach one.",
      `Model id is ${modelId}. The live catalog was not queried. Set CARTESIA_AGENT_MODEL or let a live run call GET /v1/agents/models.`,
      `Voice id is ${voiceId}. Not confirmed with GET /voices.`,
    ],
    tools: redact(tools, secret),
    agent: redact(agent, secret),
    phone_attach: attachPhone ? phonePayload("<agent id>") : null,
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const apiKey = process.env.CARTESIA_API_KEY ?? "";
if (!apiKey) fail("Set CARTESIA_API_KEY. Get one at https://play.cartesia.ai/keys");
if (!secret) fail("Set LINTEL_VOICE_TOOL_SECRET to the same value stored in the Convex dashboard.");
let origin;
try {
  origin = new URL(siteUrl);
} catch {
  fail("Set CONVEX_SITE_URL to the https origin of the Convex site, such as https://happy-animal-123.convex.site");
}
if (origin.protocol !== "https:" || origin.username || origin.password) {
  fail("CONVEX_SITE_URL must be an https origin with no credentials.");
}
if (siteUrl === "https://YOUR_DEPLOYMENT.convex.site") {
  fail("Set CONVEX_SITE_URL to your deployment's .convex.site origin.");
}
if (attachPhone && !phoneNumberId) {
  fail("Pass --phone only after you buy a number. Set CARTESIA_PHONE_NUMBER_ID. This script does not buy one.");
}

async function cartesia(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Cartesia-Version": VERSION,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    fail(`${method} ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

async function listAll(path, extra) {
  const rows = [];
  let starting = "";
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ limit: "100", ...extra });
    if (starting) params.set("starting_after", starting);
    const listed = await cartesia("GET", `${path}?${params}`);
    const data = Array.isArray(listed.data) ? listed.data : [];
    rows.push(...data);
    if (!listed.has_more || data.length === 0) break;
    starting = typeof listed.next_page === "string" && listed.next_page ? listed.next_page : data[data.length - 1]?.id;
    if (!starting) break;
  }
  return rows;
}

async function chooseModel() {
  if (process.env.CARTESIA_AGENT_MODEL) return process.env.CARTESIA_AGENT_MODEL;
  const listed = await cartesia("GET", "/v1/agents/models");
  const rows = Array.isArray(listed) ? listed : Array.isArray(listed.data) ? listed.data : [];
  const ids = rows
    .map((row) => (typeof row === "string" ? row : row && typeof row.id === "string" ? row.id : ""))
    .filter(Boolean);
  const preferred = [PREFERRED_MODEL_ID, "gpt-5.4-mini"];
  const picked = preferred.find((id) => ids.includes(id)) ?? ids[0];
  if (!picked) {
    fail("GET /v1/agents/models returned no ids. Set CARTESIA_AGENT_MODEL. The response shape may differ from the docs.");
  }
  console.error(`Using model ${picked}`);
  return picked;
}

const tools = buildReviewerTools({ siteUrl: origin.origin, secret });
const existingTools = await listAll("/v1/agents/tools", { type: "webhook" });
const toolIds = [];
for (const tool of tools) {
  const found = existingTools.find((row) => row && row.name === tool.name && row.type === "webhook");
  if (found && typeof found.id === "string") {
    const updated = await cartesia("PATCH", `/v1/agents/tools/${found.id}`, tool);
    toolIds.push(typeof updated.id === "string" ? updated.id : found.id);
    console.error(`Updated tool ${tool.name}`);
  } else {
    const created = await cartesia("POST", "/v1/agents/tools", tool);
    if (typeof created.id !== "string") fail(`Create tool ${tool.name} returned no id.`);
    toolIds.push(created.id);
    console.error(`Created tool ${tool.name}`);
  }
}

const chosenModel = await chooseModel();
const agentBody = buildReviewerAgentBody({ toolIds, modelId: chosenModel, voiceId });
let agentId = process.env.CARTESIA_REVIEWER_AGENT_ID ?? "";
if (!agentId) {
  const agents = await listAll("/v1/agents", { q: REVIEWER_NAME });
  const matches = agents.filter((row) => row && row.name === REVIEWER_NAME && typeof row.id === "string");
  if (matches.length > 1) console.error(`Found ${matches.length} agents named ${REVIEWER_NAME}. Updating the first.`);
  agentId = matches[0]?.id ?? "";
}

let agent;
if (agentId) {
  agent = await cartesia("PATCH", `/v1/agents/${agentId}`, {
    ...agentBody,
    version_description: "Read-only Lintel reviewer tools",
  });
  console.error(`Updated agent ${agentId}`);
} else {
  agent = await cartesia("POST", "/v1/agents", agentBody);
  if (typeof agent.id !== "string") fail("Create agent returned no id.");
  agentId = agent.id;
  console.error(`Created agent ${agentId}`);
}

let phone = null;
if (attachPhone) {
  phone = await cartesia("PATCH", `/agents/phone-numbers/${encodeURIComponent(phoneNumberId)}`, { agent_id: agentId });
  console.error(`Attached phone number ${phoneNumberId}`);
} else {
  console.error("Phone attach skipped. Pass --phone with CARTESIA_PHONE_NUMBER_ID when you have a number.");
}

console.log(JSON.stringify({
  agent_id: agentId,
  tool_ids: toolIds,
  model_id: chosenModel,
  voice_id: voiceId,
  phone_attached: attachPhone,
  phone_number_id: attachPhone ? phoneNumberId : null,
  phone,
}, null, 2));
