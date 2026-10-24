# CREAO AI Programmatic API Reference (Verified for Cal Hacks 13.0 — Lintel)

**Verification status:** CONFIRMED from `https://community.creao.ai/CalHacks2026/tech`, `https://docs.creao.ai/pro/api-trigger`, and `https://docs.creao.ai/developer-api/quickstart`.
**Verdict:** Our backend CAN call a CREAO agent programmatically via REST API and receive structured JSON back. We are NOT locked into the `agent.creao.ai` website UI.

---

## 1. Two Server-Side Programmatic Paths (Choose Path A or Path B)

Never expose `capi_` or `cr_sk_` keys in browser client code. Call CREAO from Convex actions: `extractBill` on the document path, and `investigate` after `processBill` schedules it for a held or blocked bill. Keys live in the Convex environment.

| Feature | Path A: App-Scoped API Trigger (Recommended by Cal Hacks Tech Pack) | Path B: Developer Console Realtime / Async API |
| :--- | :--- | :--- |
| **Base URL** | `https://agent.creao.ai` | `https://developer.creao.ai` |
| **API Key Prefix** | `capi_...` (from Agent detail page or `agent.creao.ai` -> Settings -> API Keys) | `cr_sk_...` (from `developer.creao.ai` -> API Keys) |
| **Auth Header** | `Authorization: Bearer capi_YOUR_KEY` | `Authorization: Bearer cr_sk_YOUR_KEY` |
| **Start Run** | `POST /api/v1/runs` (or `POST /api/v1/apps/{appId}/runs`) | `POST /v1/realtime/runs` (NDJSON stream) or `POST /v1/runs` (async) |
| **Poll Result** | `GET /api/v1/runs/{runId}` (or `GET /api/v1/apps/{appId}/runs/{runId}`) | `GET /v1/runs/{run_id}` |
| **Body Schema** | `{ "appId": "<UUID>", "inputs": { ... } }` (plural `inputs`, camelCase) | `{ "agent_id": "<UUID>", "input": { ... }, "model": "anthropic/claude-haiku-4-5" }` (singular `input`, snake_case) |
| **Streaming?** | No (`202 Accepted` async -> poll or `webhookUrl`) | Yes (`POST /v1/realtime/runs` streams `application/x-ndjson`) |

---

## 2. Path A Implementation: `agent.creao.ai/api/v1/runs` (Async Poll Pattern)

For local development at Cal Hacks, **use 2-second polling instead of `webhookUrl`** (because `webhookUrl` rejects `localhost` and private IPs unless tunneled via ngrok/cloudflared).

### Step A: Start a Run (`POST https://agent.creao.ai/api/v1/runs`)
```typescript
// Set these in the Convex environment. Actions read process.env there.
// CREAO_API_KEY=capi_...
// CREAO_AGENT_ID=00000000-0000-4000-8000-000000000000

const startRes = await fetch("https://agent.creao.ai/api/v1/runs", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.CREAO_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    appId: process.env.CREAO_AGENT_ID,
    inputs: {
      // Must match the input form fields configured when clicking "Create Agent" on agent.creao.ai.
      // Tip from CREAO Tech Pack: create the agent with a single `prompt` (or `payload`) input field
      // so your code can pass any JSON string or prompt dynamically.
      prompt: JSON.stringify(billAndAnomalyContext),
    },
    idempotencyKey: `lintel-inv-${billId}-${Date.now()}`,
  }),
});

// Returns HTTP 202 Accepted:
// { "id": "11111111-1111-4111-8111-111111111111", "status": "pending", "appId": "...", "appName": "..." }
const { id: runId } = await startRes.json();
```

*(Note: `/api/v1/runs` also accepts `multipart/form-data` with a `files` field [up to 10 PDFs/images, 10 MB each] and `inputs` as a JSON-serialized string if you want CREAO to parse raw PDF bills directly.)*

### Step B: Poll Until Terminal Status (`GET https://agent.creao.ai/api/v1/runs/{runId}`)
```typescript
// Terminal statuses: "completed" | "failed" | "cancelled"
// Non-terminal statuses: "pending" | "running"
const statusRes = await fetch(`https://agent.creao.ai/api/v1/runs/${runId}`, {
  headers: {
    "Authorization": `Bearer ${process.env.CREAO_API_KEY}`,
  },
});

const runData = await statusRes.json();
/*
Terminal "completed" payload shape:
{
  "runId": "11111111-1111-4111-8111-111111111111",
  "status": "completed",
  "threadId": "33333333-3333-4333-8333-333333333333",
  "result": {
    "text": "{\"rootCause\":\"...\",\"confidence\":0.94,\"recommendedAction\":\"HOLD\"}",
    "chatText": "...",
    "artifacts": [
      {
        "id": "workspaces/.../report.pdf",
        "title": "report.pdf",
        "type": "application/pdf",
        "url": "https://agent.creao.ai/api/v1/runs/.../artifacts/download?artifactId=..."
      }
    ]
  }
}
*/
if (runData.status === "completed") {
  // Strip optional markdown code fences if the agent wrapped its JSON
  const raw = runData.result.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsedJson = JSON.parse(raw);
}
```

---

## 3. Path B Implementation: `developer.creao.ai/v1/realtime/runs` (Live NDJSON Stream)

If we want lower latency or explicit fast model selection (`anthropic/claude-haiku-4-5`), use a `cr_sk_...` key from `developer.creao.ai`:

```typescript
const streamRes = await fetch("https://developer.creao.ai/v1/realtime/runs", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.CREAO_DEV_API_KEY}`, // cr_sk_...
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agent_id: process.env.CREAO_AGENT_ID,
    input: { query: JSON.stringify(billAndAnomalyContext) },
    model: "anthropic/claude-haiku-4-5",
  }),
});
// Streams application/x-ndjson lines:
// { "type": "run.created", ... }
// { "type": "output_text.delta", "delta": "..." }
// { "type": "run.completed", ... }
```

---

## 4. Architectural Rules & Cal Hacks Qualification Checklist for Lintel

1. **Why Investigator Agent (Async) + Claude Fallback is the Right Architecture:**
   - CREAO agents run inside a full Linux container sandbox on `agent.creao.ai`. Cold runs take **15–60+ seconds** (warm sandboxes stay alive for 30 minutes after a run).
   - Keep Lintel's primary bill intake + deterministic math/duplicate/spike guardrails instant (`<2s`) so the 2-minute live judge injection never stalls.
   - Trigger the CREAO Investigator Agent on flagged exceptions (or via an async "Investigate on CREAO" action / background pipeline step) with a clean timeout + Claude fallback if `CREAO_API_KEY` is unset or the container is cold.
2. **How to Satisfy CREAO's Hard Qualification Rules (`$5,000` Pool + Launchpad):**
   - **Rule 1:** At least one CREAO agent built on `agent.creao.ai` does core work (e.g., anomaly investigation / vendor verification / dispute memo & artifact generation).
   - **Rule 2:** Every API Trigger call automatically logs a thread in the `agent.creao.ai` sidebar prefixed with `[API] ...`. Open one completed `[API]` run thread, click **Share**, and put both the **Agent ID (`appId`)** and the **Public Run Share URL** at the top of `README.md` (worth 25% of the CREAO score under "Depth on CREAO").
   - **Rule 3:** Also display the `runId` / `threadId` in the Lintel audit log UI so judges can see the live CREAO execution trace during the demo.
