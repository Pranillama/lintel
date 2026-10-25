# Add-on: Cartesia two-way voice agent

Research spec, written Oct 25, 2026 against `main` at `8f0f218`. The current cut is a browser-only reviewer on `/bills/[id]`. There is no phone number. Steps for Pranil are in `context/add-ons/cartesia-voice-setup.md`.

This is a **conversation, not narration**. People talk to Lintel and Lintel talks back:

- **Reviewer (phase 1, browser).** An AP reviewer opens a bill and asks out loud: *"Why is this one held?" "Who has to approve it?" "What did the agent find?" "Which bills still need me today?"* The agent answers with the engine's own numbers and can move the screen to the bill it is talking about.
- **Vendor (phase 2, phone).** A contractor calls a Lintel number, or Lintel calls them after a person presses **Call vendor**. They ask *"Has invoice 4471 been paid?"* or hear *"Your invoice is missing an invoice number. Can you read it to me?"* The agent answers only with facts that are safe to share with that vendor.

Cartesia **Managed Agents** handle the listening, turn-taking, interruptions, speech (Sonic), and the LLM. Lintel exposes **read-only tools** that return deterministic facts.

> The model reads the bill. Code decides whether it gets paid. **The voice agent can only repeat what code decided. It has no tool that approves, rejects, assigns, or pays.** A person owns the exceptions.

> **Browser-only is the current cut.** The panel is `src/components/app/VoicePanel.tsx`, a fixed owl mascot in the corner of `AppShell` (every app page, including `/bills/[id]`). `get_selected_bill` uses the open bill id when the path is `/bills/[id]`. PR #27 removed `Desk.tsx`, `useDesk.ts`, `TopBar.tsx`, and `LiveDesk.tsx`, so those hooks stay stale. Client tools are `get_selected_bill` and `show_bill`. Setup is `scripts/cartesia-setup.mjs` with `--dry-run`. There is no `--phone` path.

Cross-links: `context/master-spec.md` §4 (AI allowed vs forbidden), §5.2–§5.3 (status, approver, why-sentences); `context/ui-context.md` §1; `context/ai-workflow-rules.md` §2, §8; `context/add-ons/capital-one-payments.md` (payment status the agent can report); `context/add-ons/portfolio-ask.md` (typed Q&A; its "no voice" non-goal is about that drawer only).

---

## 1. Integration effort, in short

| Question | Answer |
|---|---|
| Is an API key enough? | **Yes.** A Cartesia key (`sk_car_…`) on the server creates the agent, its tools, and calls. The browser gets a short-lived access token that the server mints (`POST /access-token`, `grants: { agent: true }`, ≤ 3600 s). I found no waitlist or approval gate. [C] |
| Is it like ElevenLabs Agents? | **Same model**: a hosted agent with a prompt, a voice, an LLM, webhook tools, client tools, and phone numbers. **One difference matters for us:** ElevenLabs ships a browser SDK (`@elevenlabs/react`) that handles the mic, WebRTC, and playback. Cartesia has **no browser agent SDK**, so we write about 150–200 lines of raw WebSocket + Web Audio code. Server-side work is the same on both. [C] |
| Is there a no-code path? | The Playground (https://play.cartesia.ai/agents) builds and previews the agent. A Cartesia US phone number can be pointed at it, so the **fastest demo needs zero frontend code**: call the number from a phone at the table (§8, option A). [C] |
| What to avoid | The Python **Line SDK** and hosted Line deployments. *"Cartesia stops hosting Line SDK agents on December 1, 2026."* Build on Managed Agents. [C] https://docs.cartesia.ai/agents/migrate-from-line-sdk.md |
| Cost | $0.06/min for agent calls, plus LLM tokens, plus $0.014/min for a Cartesia phone number. **Agent usage is billed in USD and is not covered by free or subscription credits**, so a card is needed. A 2-minute demo costs about $0.12 plus tokens. [C] https://docs.cartesia.ai/pricing.md |
| Track | Cartesia is a Cal Hacks 13.0 sponsor [C]. The prize name and criteria are not published online [U]. Ask at the booth, including about agent credits. |

Legend used below: **[C]** confirmed in Cartesia/ElevenLabs docs on Oct 25 2026, **[U]** unverified.

## 2. Current flow, and where the agent sits

```
processBill → decide() → BillRecord { status, decision.why, checks[].rationale, required_approver, payment }
                       → investigate (CREAO/Claude) → InvestigationBrief { summary, findings, draft }
listBills subscription → Desk (selected bill)
humanResume: assign | approve | reject | send-draft          ← only a person, only from the UI
```

The voice agent is a **reader** of that state. It sits beside the desk and never on the decision path:

```
 Browser (reviewer)                       Cartesia Managed Agent                Convex
 ┌─────────────────┐  WebSocket audio     ┌──────────────────────┐  webhook    ┌──────────────────────────┐
 │ VoicePanel      │◄────────────────────►│ prompt + Sonic + Ink │────tools───►│ httpAction /voice/*      │
 │ mic → PCM16     │  client tools:       │ LLM from catalog     │  (GET,      │  → buildBillFacts() pure │
 │ playback queue  │  get_selected_bill   │                      │  bearer)    │  → listBills/getBill     │
 │ captions        │  show_bill           └──────────────────────┘             └──────────────────────────┘
 └─────────────────┘                               │ call_completed webhook ─────► voiceCalls table
 Phone (vendor, phase 2) ── Cartesia number ───────┘
```

## 3. Hard rules

1. **No write tools.** Every webhook tool is a `GET` to a Convex HTTP action that only runs queries. There is no tool that maps to `humanResume`, `processBill`, `retryPayment`, or a Nessie call. Approval stays a button press by a person (CLAUDE.md §4).
2. **Facts come from code.** The tools return `buildBillFacts()` output: status, `decision.why` verbatim, failing-check rationales verbatim, required approver, and payment status. These are the same strings the why-card shows. The LLM only puts them in conversational order.
3. **The prompt pins the model to tool output.** *"Only state facts returned by a tool, in the tool's words for any number, date, or id. If a tool did not return it, say you don't know. You cannot approve, reject, or pay anything; tell the caller a person decides."* (Prompts are not a guarantee, which is why rule 1 exists: even if the agent says "approved", nothing changes.)
4. **AI content is labelled.** The investigator's summary is returned in a separate `agent_findings` field. The prompt says to introduce it as *"The investigator agent found…"*.
5. **Vendors see a whitelist.** The vendor tools return only that vendor's own invoices. They include status in vendor words (Received / Under review / Approved for payment / Paid / Not payable), the field the vendor needs to supply, and the payment reference once SENT. They never return approver roles, thresholds, other vendors, other properties' history, investigator findings, or audit rows.
6. **Conversations are not state transitions**, so they add no row to the hash chain. Call records (transcript, `call_id`, bill ids discussed) are stored in a `voiceCalls` table for review. If a vendor supplies a correction (e.g. an invoice number), it is stored as a **note for a person**, never applied to the bill (phase 2, §7).
7. **Keys stay server-side.** `CARTESIA_API_KEY` and `LINTEL_VOICE_TOOL_SECRET` live in the Convex env. The browser only ever holds a 5-minute access token. The `agent` grant is **not scoped to one agent** [C], so use a Cartesia account (or org) dedicated to Lintel.

## 4. Cartesia facts this spec relies on

| Item | Value |
|---|---|
| Base / version | `https://api.cartesia.ai`, header `Cartesia-Version: 2026-08-14`, `Authorization: Bearer sk_car_…` [C] |
| Create / update agent | `POST /v1/agents`, `PATCH /v1/agents/{agent_id}` [C]. Fields: `instructions` (supports `{{dynamic_variables}}`), `initial_message`, `model.id`, `temperature`, `language.primary`, `audio.input.keyterms`, `audio.output.voice_id` / `speed`, `turn`, `tools` (list of tool ids; **an update replaces the whole list**), `system_tools` (`end_call`, DTMF, transfer). Every change is versioned. https://docs.cartesia.ai/agents/configuration.md |
| LLM | Managed catalog, `GET /v1/agents/models`, covering OpenAI, Anthropic, and Google (e.g. `claude-sonnet-5`, added Sep 2026). **No bring-your-own-key** on Managed Agents; Cartesia bills the tokens [C] |
| Webhook tool | `POST /v1/agents/tools` `{ type:"webhook", name, description, execution_mode:"immediate", response_timeout_secs, api_schema:{ url (HTTPS, {placeholders}), method, path_params_schema, query_params_schema, request_headers, authentication:{bearer} } }`. A 2xx text body becomes the tool result (max 16 KiB). Non-2xx or timeout gives an error result and the call continues [C] https://docs.cartesia.ai/agents/webhook-tools.md |
| Client tool | `{ type:"client" }`, WebSocket only. The server sends `client_tool_call {tool_name, parameters, tool_call_id, expects_response}`; we reply with `client_tool_result {tool_call_id, result, is_error}` [C] https://docs.cartesia.ai/agents/client-tools.md |
| Browser socket | `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}?cartesia_version=2026-08-14&access_token=…` [C] |
| Socket events | Client sends `session_create` (within 10 s; `audio.input_format` `pcm_16000` \| `pcm_24000` \| `pcm_44100` \| `mulaw_8000`), then `audio_input` (base64) and `client_tool_result`. Server sends `session_ready` (`call_id`), `audio_output` (base64), `audio_output_clear` (barge-in, so flush playback), `client_tool_call`, `turn_started`, `turn_output_text_delta` (captions), `turn_ended`, `error` [C] https://docs.cartesia.ai/line/integrations/websocket-api.md. **Do not use** the legacy `wss://api.cartesia.ai/agents/stream/{agent_id}` (`start` / `media_input` events) |
| Passing the bill id | Unclear whether `session_create` accepts dynamic variables [U]. We don't depend on it: the `get_selected_bill` client tool returns it |
| Phone | Cartesia US numbers, Twilio import, or SIP. Inbound: `PATCH /agents/phone-numbers/{id}` `{agent_id}`. Outbound: `POST /agents/calls` `{from_number_id, agent_id, ringing_timeout_seconds, outbound_calls:[{to_number, dynamic_variables}]}` [C]. The `/v1` prefix is inconsistent across pages [U], so check the API reference |
| After the call | `GET /agents/calls/{call_id}` (transcript), `/audio` (WAV). Webhooks `POST /agents/webhooks` with events `call_started`, `call_completed`, `call_failed`, `call_turn`, `post_call_analysis`; secret in the `x-webhook-secret` header; dedupe on `webhook_request_id` [C] |
| Interruptions | Handled by Cartesia (`audio_output_clear`, `was_interrupted` per turn) [C] |
| End-to-end latency | Not published for agents [U]. Measure on day one |

## 5. Lintel side

### 5.1 Deterministic facts (`src/voice/facts.ts`, pure)

```ts
export interface BillFacts {                    // reviewer view
  bill_id: BillId; vendor: string | null; property: string | null; amount: string | null;  // "$5,680.00"
  invoice_number: string | null; due_date: IsoDate | null;
  status: BillStatus; resolved_by: ResolvedBy;
  why: string;                                  // decision.why verbatim
  failing_checks: Array<{ check: CheckId; outcome: "HALT" | "BLOCK"; rationale: string }>;
  required_approver: string | null;             // "VP Finance", "Property manager", "Operator", null
  can_be_approved: boolean;                     // humanRefusal(bill,"approve",brief) === null
  next_step: string;                            // same copy as the desk's story.ts next-step line
  payment: { state: "NONE" | "APPROVED_FOR_PAYMENT" | "SCHEDULED" | "SENT" | "FAILED"; reference: string | null; via: string | null };
  agent_findings: { summary: string; findings: string[] } | null;   // only when brief DONE; labelled AI
}
export interface VendorInvoiceFacts {           // vendor view, whitelist only (rule 5)
  invoice_number: string | null; amount: string | null; due_date: IsoDate | null;
  vendor_status: "RECEIVED" | "UNDER_REVIEW" | "APPROVED_FOR_PAYMENT" | "PAID" | "NOT_PAYABLE";
  vendor_message: string;                       // deterministic template per reason code, e.g. "We are missing the invoice number."
  payment_reference: string | null;             // only when payment SENT
}
export function buildBillFacts(view: BillView): BillFacts;
export function buildVendorFacts(view: BillView): VendorInvoiceFacts;
```

Both functions are pure: no IO, no model, no `Date.now()`. They reuse `src/engine/format.ts`, `humanRefusal`, and the copy in `story.ts` (moved, or duplicated in `src/voice/` if importing it would pull React in). Add `src/voice` to `boundary.test.ts`'s no-model list.

`vendor_message` templates (reason code → what the vendor hears) live in one table in `facts.ts`:

| Reasons | Vendor hears |
|---|---|
| `MISSING_FIELD` | "We could not find the {fields} on your invoice." |
| `EXACT_DUPLICATE` / `FUZZY_DUPLICATE` | "This looks like invoice {prior_invoice}, which we already have. If it is a different charge, a person on our team will review it." |
| `NEEDS_PROPERTY_MATCH` | "We need to confirm which property this service was for." |
| `VENDOR_UNVERIFIED` / `CRS_*` | "Your company is going through our vendor verification." |
| spike, limit, approval reasons | "It is under review." (no thresholds, no approver names) |
| CLEARED, no payment | "It is approved for payment." |
| payment SENT | "It was paid; the reference ends in {last4}." |

### 5.2 Tools

All tools are Convex `httpAction`s in a new `convex/http.ts` router plus `convex/voice/tools.ts`. Each checks `Authorization: Bearer ${LINTEL_VOICE_TOOL_SECRET}` (set on the Cartesia tool's `authentication`). It runs `ctx.runQuery` only and returns JSON text under 16 KiB. These are Convex HTTP actions, not a Next route handler, so master-spec decision #13 still holds.

| Tool | Agent | Type | Request | Returns |
|---|---|---|---|---|
| `get_selected_bill` | reviewer | client | — | `{ bill_id }` of the bill open on screen (from `useDesk`) |
| `get_bill_explanation` | reviewer | webhook GET `/voice/bill/{bill_id}` | `bill_id` | `BillFacts` |
| `list_open_bills` | reviewer | webhook GET `/voice/open` | — | ≤ 10 rows `{ bill_id, vendor, amount, status, required_approver }`, HELD first, plus `totals` from `listBills` |
| `find_bills` | reviewer | webhook GET `/voice/find?vendor=&invoice=&amount=` | any of these | ≤ 5 rows (exact `normalizeInvoice` or vendor-name match; no fuzzy guessing) |
| `show_bill` | reviewer | client | `bill_id` | Selects that bill on the desk (UI only), `{ ok }` |
| `lookup_my_invoice` | vendor | webhook GET `/voice/vendor/invoice?vendor_id={{vendor_id}}&invoice=` | `invoice`; `vendor_id` from a dynamic variable set by us, never from the caller | `VendorInvoiceFacts` or `{ found:false }` |
| `get_call_bill` | vendor (outbound) | webhook GET `/voice/vendor/bill/{{bill_id}}` | from dynamic variables | `VendorInvoiceFacts` |
| `end_call` | both | system | — | — |

No `transfer` system tool in v1. The vendor agent has **no** reviewer tools, so even a clever caller cannot reach `BillFacts`.

### 5.3 Two agent configs (same voice, different prompt and tools)

Created once by `scripts/cartesia-agents.mjs` (run by hand; prints the agent ids into the Convex env as `CARTESIA_REVIEWER_AGENT_ID` and `CARTESIA_VENDOR_AGENT_ID`; idempotent by name).

- **Lintel Reviewer**
  - `initial_message`: "Hi, I'm Lintel. Ask me about any bill on the desk."
  - Tools: `get_selected_bill`, `get_bill_explanation`, `list_open_bills`, `find_bills`, `show_bill`, `end_call`.
  - `keyterms`: vendor names from `getPortfolio`, plus "EBMUD", "PG&E", "SFPUC", "Recology", "VP Finance".
  - Model: pick from `GET /v1/agents/models` (try `claude-sonnet-5`; a cheaper mini model if latency is better).
  - Voice: a "stable" Sonic voice. Skylar `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4` is the docs default; Daniel or Jacqueline sound crisper. Look up the IDs with `GET /voices?q=`.
- **Lintel Vendor Line**
  - `initial_message`: "Thanks for calling Lintel accounts payable. Which invoice are you calling about?"
  - Tools: `lookup_my_invoice`, `get_call_bill`, `end_call`.
  - Prompt adds: never discuss other vendors or internal rules, never promise a payment date the tool did not return, and offer a callback from a person for anything else.

### 5.4 Browser voice panel (built)

The panel is the fixed corner owl in `src/components/app/VoicePanel.tsx`, mounted from `AppShell`, so it is on `/bills/[id]` and the other app pages. `startVoiceSession` in `convex/pipeline/voice.ts` mints the access token with `CARTESIA_API_KEY` and returns a `wss://` URL. The browser answers `get_selected_bill` and `show_bill`. The notes below are the original desk-file plan. Those files are gone; do not recreate them.

### 5.4a Original browser panel plan (Piyush lane, `src/components/desk/voice/`)

- **`useVoiceAgent.ts`** (~150–200 lines, no new dependency):
  1. Call the Convex action `startVoiceSession()`. It mints `POST /access-token` `{grants:{agent:true}, expires_in:300}` and returns `{ token, agent_id }`.
  2. Open the socket and send `session_create` with `pcm_16000` input.
  3. Mic: `getUserMedia` → `AudioWorklet` downsample to 16 kHz → Int16 → base64 → `audio_input` every ~100 ms.
  4. Playback: decode `audio_output` into a queue of `AudioBufferSourceNode`s; on `audio_output_clear`, stop and flush.
  5. Answer `client_tool_call` for `get_selected_bill` and `show_bill`.
  6. Captions: build from `turn_output_text_delta`.

  The output sample rate and encoding of `audio_output` must be confirmed [U]. Check `session_create`'s `audio.output_delivery` options first.
- **UI:**
  - A `Talk to Lintel` secondary button in the story header (not lime) opens a slim panel over card 3.
  - The panel has a live mic level, captions (the agent's lines in white, the reviewer's in muted), and a `Hang up` button. Each tool call shows as a small "CODE" actor chip (e.g. *looked up BILL-…*) so the judge sees that facts came from code.
  - Errors show inline. `Esc` hangs up. Switching bills mid-call is fine, because the agent asks `get_selected_bill` again.
- The desk's `DeskActions` gains `startVoiceSession()`, wired in `useConvexDesk.ts`.

### 5.5 Call records

- `POST /voice/webhooks/cartesia` httpAction:
  - verifies `x-webhook-secret`;
  - dedupes on `webhook_request_id`;
  - on `call_completed`, stores `{ call_id, agent, started_at, duration_s, transcript, bill_ids_discussed (from tool-call params), caller (masked phone for vendor calls) }` in `voiceCalls`.
- New table, owned by Anmol in `convex/schema.ts` (additive): `voiceCalls` with indexes `by_callId` and `by_billId`.
- Optional: the History tab in the Details modal lists voice calls that touched this bill (read-only).

## 6. Contract changes (additive, need the 👍 in ai-workflow-rules §2)

- `PortfolioResponse.flags.voice_enabled: boolean` (true when `CARTESIA_API_KEY` and `CARTESIA_REVIEWER_AGENT_ID` are set).
- Phase 2 only: `Vendor.phone?: string | null` (E.164, entered by an admin in Properties & vendors), and an optional `BillView.voice_calls?` if the History tab shows them.
- No change to `BillStatus`, `Decision`, `AuditAction`, or the engine.

## 7. Phase 2: vendor phone line

1. Provision a Cartesia US number (`cartesia phone-numbers provision` or the dashboard). Assign it to **Lintel Vendor Line** for inbound calls.
2. **Inbound** callers are unauthenticated, so `vendor_id` is resolved deterministically. Match the caller ID against `Vendor.phone`. No match → the agent asks for the vendor name and invoice number, and `lookup_my_invoice` requires **both** to match exactly before it returns anything. Otherwise: "I can't find that; a person will call you back."
3. **Outbound** happens only from a person's click. A HELD bill whose investigator draft is `VENDOR_EMAIL` gets a `Call vendor` button next to `Send`. It runs the Convex action `callVendor({ billId })`, which:
   - checks the bill is HELD and `Vendor.phone` is set;
   - calls `POST /agents/calls` with `dynamic_variables { bill_id, vendor_id, vendor_name, invoice_number }`;
   - appends a `HUMAN_OPERATOR · DRAFT_SENT · INFO · "Voice call placed to {vendor}"` audit row. This reuses the existing action, because a person sending a follow-up is already audited that way.
   - A person pressing the button counts as consent for that call. Calling anyone requires TCPA-compliant consent; for the demo, the vendor phone is a teammate's.
4. **Vendor corrections** (e.g. they read out the missing invoice number) are captured from the post-call transcript into `voiceCalls.vendor_note`. They show in card 3 as *"Vendor said on a call: invoice # 4471. Verify and re-enter."* A person re-runs the bill. The agent never edits a bill.

## 8. Demo options (pick by how much time is left)

| Option | What the judge sees | Frontend code | Risk |
|---|---|---|---|
| **A. Phone-in reviewer** | Point a Cartesia number at Lintel Reviewer (with `find_bills` / `list_open_bills`, no client tools). The judge calls it on speaker: "Why is the EBMUD bill held?" | none | Lowest. Needs only the agent, webhook tools, and the number |
| **B. In-browser panel** | `Talk to Lintel` on the selected bill; the screen jumps to bills as they're discussed | §5.4 | Medium: Web Audio plumbing |
| **C. B + outbound vendor call** | The reviewer presses `Call vendor` and a teammate's phone rings with the vendor agent | §5.4 + §7 | Highest |

Recommendation: build **A first** (≈2 hours, and it proves the tools), then B. C is a stretch.

## 9. Cartesia vs ElevenLabs (why we're still choosing Cartesia)

| | Cartesia Managed Agents | ElevenLabs Agents |
|---|---|---|
| Server setup | API key, REST agent + webhook tools [C] | API key (`xi-api-key`), agent + server tools [C] |
| Browser | Raw WebSocket + our own mic/playback code (~150–200 lines) [C] | `@elevenlabs/react` `useConversation` handles mic and WebRTC [C] |
| Browser auth | `POST /access-token` agent grant, not agent-scoped [C] | Signed URL per agent, 15 min [C] |
| LLM | Managed catalog, no BYO key [C] | Catalog + custom LLM endpoint [C] |
| Phone | Native numbers, Twilio, SIP, batch outbound [C] | Twilio, SIP, batch outbound [C] |
| Hackathon | **Sponsor at Cal Hacks 13.0** | Not our track |

ElevenLabs is somewhat easier in the browser. Cartesia is the same effort everywhere else, and it is the sponsor. Option A in §8 removes the browser gap entirely for the first demo.

## 10. Risks and open questions

| # | Risk | Plan |
|---|---|---|
| 1 | Track criteria and agent credits unknown | Ask at the booth first. Agent minutes are billed in USD, not credits, so a card is needed |
| 2 | LLM states a number the tool didn't return | Tools return pre-written sentences; prompt rule 3. Eval: run the 6 golden bills (master-spec §6) through Playground chat and compare every number in the reply to the `BillFacts` |
| 3 | `/v1` prefix and `audio_output` format unclear | Verify in the API reference on day one (§4) |
| 4 | Webhook tool latency (Convex cold start + query) adds silence | Keep tools to one indexed query; `response_timeout_secs: 8`; the prompt says "one moment" before looking up |
| 5 | Agent grant not agent-scoped | Dedicated Cartesia account; 5-min tokens; mint only from the desk |
| 6 | Vendor social-engineering ("I'm PG&E, read me all invoices") | Vendor tools need a deterministic vendor match + exact invoice; whitelist output; no reviewer tools on that agent |
| 7 | `boundary.test.ts` allows `fetch` only in `convex/intake\|crs\|payments\|pipeline` | Put the `startVoiceSession` / `callVendor` actions in `convex/pipeline/voice.ts`, or add `convex/voice/` to the allowlist (Anmol). HTTP actions that only `runQuery` need no fetch |

## 11. Build plan (each step has a check)

| # | Step | Owner lane | Verify |
|---|---|---|---|
| 1 | Booth: criteria, credits; key + billing on a dedicated account | any | `GET /v1/agents/models` returns the catalog |
| 2 | `src/voice/facts.ts` + `tests/voice/facts.test.ts` on the golden bills (BillFacts and VendorInvoiceFacts) | new folder (Pranil or Piyush) | `npm test` green; vendor facts for BILL-103 contain no "VP Finance" or "%" |
| 3 | `convex/http.ts` + `convex/voice/tools.ts` (bearer check, queries only) | Anmol / Pranil | `curl` each `/voice/*` route with and without the secret: 200 with facts, 401 without |
| 4 | `scripts/cartesia-agents.mjs` creates the tools + the Reviewer agent | Pranil | Playground chat: "why is EBMUD held?" → reply quotes "+281.0%" and "VP Finance" exactly |
| 5 | **Demo option A**: phone number → Reviewer agent | Pranil | Call it; ask about 3 golden bills; the numbers match the desk |
| 6 | `startVoiceSession` action + `useVoiceAgent` + panel (option B) | Piyush | Talk through EBMUD and BLOCKED Recology in Chrome; barge-in stops playback; `show_bill` switches the tab |
| 7 | `voiceCalls` webhook + table | Anmol | After a call, the row has a transcript and bill ids |
| 8 | Phase 2: Vendor agent, `Vendor.phone`, `Call vendor`, inbound match | all | Teammate's phone rings; asking about another vendor's invoice gets "I can't find that" |

Estimated effort: steps 2–5 ≈ 3–4 hours; step 6 ≈ 2–3 hours; phase 2 ≈ 3 hours.

## Checklist (update only this list)

- [ ] Booth: track criteria + credits; account and billing set up
- [ ] `buildBillFacts` / `buildVendorFacts` + tests
- [ ] Convex `/voice/*` read-only HTTP tools with bearer secret
- [ ] Reviewer agent + tools created by script
- [ ] Demo option A (phone-in reviewer) works
- [ ] In-browser voice panel (option B)
- [ ] `voiceCalls` webhook + table
- [ ] Phase 2: vendor line (inbound + person-triggered outbound)
