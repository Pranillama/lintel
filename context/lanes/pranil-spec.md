# Lane: Pranil (intake, agents, matching, integrations, README, submission)

You own everything that turns a messy bill into structured facts (intake, matching) and every model call in the product (intake agent, investigator agent), plus the sponsor integrations and the submission. Anything with a model in it lives in your lane, and the boundary rule applies hardest here: your agents produce **evidence and drafts**, never decisions.

**Read first:** `context/master-spec.md` (§4 architecture, §5.4 matching, §7 sponsor requirements), `context/code-standards.md` §3 (AI boundary), `src/types/bill.ts`, `src/shared/normalize.ts`, `context/reference/creao-api.md`.

**Your folders:** `src/intake/`, `src/agents/`, `src/match/`, `src/integrations/`, `convex/intake/`, `convex/match/`, `convex/crs/`, `convex/payments/`, `fixtures/`, `tests/match/`, `tests/intake/`, `README.md`.

**Consumed by Anmol's `processBill` action** at these exact paths and signatures. The Convex actions in your `convex/*.ts` files are the only callers that may touch the network. `matchBill` stays pure and is called from the `commitMatch` mutation.
`src/intake/normalizeForm.ts` → `normalizeForm: NormalizeFormFn`
`src/match/matchBill.ts` → `matchBill: MatchBillFn`
`src/agents/intake/extractDocument.ts` → `extractDocument: ExtractDocumentFn`
`src/agents/investigator/investigate.ts` → `investigate: InvestigateFn`
`src/integrations/crs/verifyVendor.ts` → `verifyVendor: VerifyVendorFn`

---

## 1. Form normalizer (`src/intake/normalizeForm.ts`), ~30 min, do first

- Trim strings; empty → `{ value: null, confidence: 0, source_snippet: null }`.
- Provided values → confidence `1.00`, `source_snippet: null`. `source` = the argument (FORM or FEED).
- Amounts and line items through `roundUsd`. `extraction_error: null`, `extraction_model: null`.
- Tests in `tests/intake/normalizeForm.test.ts`.

## 2. Matcher (`src/match/matchBill.ts`), pure, no model, no IO

Implement master-spec §5.4 exactly, using only `src/shared/normalize.ts`, `@/seed/policy` constants, and the `LedgerSnapshot` argument.

- Vendor: normalized name or alias → vendor; else the matched account's vendor; else none. **No fuzzy vendor guessing.**
- Property: EXACT_ACCOUNT → HUMAN_ALIAS (from `ledger.aliases`) → ADDRESS scoring → UNRESOLVED.
- ADDRESS scoring: number + street equal 0.95; +0.05 if any locality token equals the property city word(s) or zip; street only 0.60; unit not in a non-empty `units` list caps at 0.80; top two within 0.10 → confidence min(top, 0.85). Candidates sorted, each with a plain-English `reason` (the UI shows it).
- `vendor_account_conflict` when the account's vendor differs from the name's vendor.
- `address_key = normalizeAddressKey(service_address)` whenever an address exists.
- `tests/match/matchBill.test.ts`: every input in `src/seed/demo-inputs.ts` lands on the property, method, and confidence in master-spec §6 (BILL-104 → PROP-002, ADDRESS, 0.80; Pacific Green → PROP-004, 1.00; alias present → HUMAN_ALIAS 1.00); unknown vendor → `vendor_id: null`; Ohio address → UNRESOLVED.

## 3. Intake agent (`src/agents/intake/extractDocument.ts`)

`convex/intake/extract.ts` `extractBill` is the action on the Eraser diagram. It calls Claude through `extractDocument` and CREAO with the same JSON contract, then returns one `ExtractedBill`. CREAO is evidence. It does not set status or `match_confidence`. If CREAO fails, Claude's fields still return. `commitExtraction` is the mutation that stores them.

Claude reads a PDF or image and returns an `ExtractedBill` with per-field confidence and verbatim source snippets.

- SDK: `@anthropic-ai/sdk`, `client.messages.parse()` with `output_config: { format: zodOutputFormat(Schema) }` (`import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"`). `parsed_output` can be null: treat as failure.
- Content: PDF as `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`; images as `{ type: "image", source: { type: "base64", media_type, data } }`; document block **before** the instruction text.
- Model `process.env.LINTEL_EXTRACT_MODEL ?? "claude-haiku-5-5"`, `output_config.effort: "low"` for speed (Opus 5.5 cannot disable thinking; effort is the knob). `max_tokens` ~4000. Request option `{ timeout: POLICY.EXTRACTION_TIMEOUT_MS, maxRetries: 0 }` (ms in the TS SDK).
- Check `stop_reason` before reading output; `"refusal"` → failure.
- Prompt rules: extract only what is printed; if a field is absent return null with confidence 0; never compute or infer totals; quote the snippet verbatim; usage unit must be one of the enum or null. **Do not ask for or accept any status, decision, or recommendation.**
- Never rejects: on timeout/error/refusal return an `ExtractedBill` with all values null (or whatever parsed), `extraction_error` set, `source: "DOCUMENT"`. The engine turns that into HELD `EXTRACTION_FAILED`.
- `extraction_model` = the model id. Line items extracted if printed (the engine checks the sum, not the model).
- Fixtures: `fixtures/bills/` (2 to 4 bills). Use your demo invoices (blank out real names, account numbers, addresses before committing; the repo is public). Ideally one renders BILL-103 (EBMUD $5,680, 160 CCF, acct 88-2110-4471) and one is a phone photo of a paper plumbing invoice "1880 Lombard #B" so a document run lands on the seeded portfolio. A manual script `npm run extract -- fixtures/bills/x.pdf` (in `src/agents/intake/cli.ts`) prints the result; the automated test suite never calls the network.

## 4. Investigator agent (`src/agents/investigator/`)

Runs after the decision on every HELD/BLOCKED bill. Reads, reasons, drafts. Cannot change anything.

- `investigate.ts` → `investigate: InvestigateFn`: if `CREAO_API_KEY` and `CREAO_AGENT_ID` are set, try CREAO (90 s budget); on any failure or timeout fall back to Claude; return the brief with `provider` set to whichever produced it. Never rejects; total failure → `status: "FAILED"`, `error`.
- **Input to both providers:** the `InvestigationContext` (built by Anmol's pipeline). It contains the bill with every check and its numbers, property, vendor, history, related bills, and `policy_text`.
- **Output schema (zod, shared by both):** `{ summary, findings: string[], draft: { kind, to, subject, body, suggested_property_id } | null }`.
- **What to draft (put this table in the prompt):**

  | Top reason | Draft kind | To |
  |---|---|---|
  | EXACT/FUZZY_DUPLICATE | VENDOR_EMAIL asking whether the invoice duplicates the prior one (cite both invoice numbers, amounts, dates) | Vendor AP contact |
  | USAGE_SPIKE / AMOUNT_SPIKE | WORK_ORDER for maintenance (suspected leak or meter issue, cite usage vs baseline) + mention approval needed | Maintenance, {property} |
  | NEEDS_PROPERTY_MATCH | MATCH_SUGGESTION with `suggested_property_id` and evidence (the human still clicks Assign) | AP operator |
  | UNKNOWN_VENDOR / VENDOR_UNVERIFIED | VENDOR_ONBOARDING request (W-9, insurance, verification) | Property manager |
  | OVER_AUTO_PAY_LIMIT / NO_BASELINE | APPROVAL_REQUEST summarizing the bill and the rule | Required approver role |
  | LINE_SUM_MISMATCH | VENDOR_EMAIL asking for a corrected invoice (cite line sum vs printed total) | Vendor AP contact |

- Prompt rules: use only facts in the context; cite numbers exactly as given; never recommend paying a BLOCKED bill; never claim to have sent anything; 2 to 3 sentence summary; draft body under 120 words, plain and professional.
- **CREAO path** (`src/integrations/creao/client.ts`, details in `context/reference/creao-api.md`, Path A):
  - Create the agent on agent.creao.ai with a single input field `prompt`, instructions = the investigator prompt + "Respond with JSON only matching this schema: …".
  - `POST https://agent.creao.ai/api/v1/runs` `{ appId, inputs: { prompt: JSON.stringify(context) }, idempotencyKey: "lintel-inv-<billId>" }` → poll `GET /api/v1/runs/{runId}` every 2 s until `completed|failed|cancelled`. Strip code fences from `result.text`, zod-parse. Store `creao_run_id`.
  - Server-only key (`CREAO_API_KEY`, `capi_...`). Cold runs take 15 to 60 s; that is why this runs after the response.
  - For the README and Devpost: open one completed `[API]` run thread on agent.creao.ai, click Share, put the **Agent ID** and **public run share link** at the very top. Also set `creao_share_url` on briefs if you can derive it; otherwise the UI shows the run id.
- **Claude fallback** (`claude.ts`): `client.beta.messages.toolRunner()` with `betaZodTool` read-only tools over the context: `get_bill_checks`, `get_history`, `get_related_bills`, `get_property`, `get_vendor`, `get_policy`, plus `submit_brief` (zod schema = output schema) whose `run` captures the brief. `tool_choice` stays auto (forced tool use is a 400 on Opus 5.5): the prompt says "finish by calling submit_brief". No brief captured → FAILED. Model `LINTEL_INVESTIGATOR_MODEL ?? "claude-opus-5-5"`, effort `"medium"`, timeout 45 s. If the tool runner fights you past 45 minutes, ship the single-call version (`messages.parse` with the whole context) and move on.

## 5. CRS vendor check (`src/integrations/crs/verifyVendor.ts`), gated

- **Now:** ask in `#spons-crs-credit-api` (Cal Hacks Slack) for sandbox credentials, base URL, and the official test identity list. Go/no-go at **6:00 PM**.
- Until then and if no-go: the stub returns `{ outcome: "NOT_RUN", ... }`. The pipeline only calls it when `LINTEL_CRS_ENABLED=true`.
- If go: map `V-APEX.crs_identity_ref` to an official high-risk test identity (contract change PR on `src/seed/portfolio.ts`, announce it). Call only for `UNVERIFIED_CONTRACTOR` vendors, 5 s timeout. Map the response to PASS / FLAGGED; any error → UNAVAILABLE with the error text. **Never synthesize a score or a signal.** Add the CRS row to `REAL_VS_SIMULATED` (contract PR) only after a live call works.

## 6. x402 (`src/integrations/x402/`), stretch, after the 2:00 AM freeze checklist is green

Only for CLEARED contractor bills, only after CRS is live. Base Sepolia testnet, real tx hash stored in `payment.reference`, `mode: "LIVE_TESTNET"`. No hash, no track.

## 7. README + submission (you own `README.md`)

- Top: CREAO Agent ID + run share link (if CREAO is live), one-line pitch, seats line, 20-second GIF or screenshot of the opening.
- Sections: Problem (DSD), What it does, How it decides (AI / code / human table), Real vs Simulated (copy of `REAL_VS_SIMULATED`), Architecture (diagram), **Microsoft: Built for the Real World** paragraph (master-spec §7), Run locally, Team and who built what.
- Devpost draft saved by **10:00 PM Sat**, tracks: Hyphenate, Microsoft, CREAO (if live), CRS (if live). Final submit by **8:45 AM Sun**.

---

## Checklist (update only this list, in the same commit as the work)

- [x] `normalizeForm` real + tests (unblocks Anmol's FORM/FEED path). Landed: trimmed strings, empty fields null at confidence 0, provided values at 1.00 with source FORM or FEED, amounts and line items through `roundUsd`.
- [x] `matchBill` real + tests for every demo input (post in #pranil-update when on main). Landed: every demo input hits the §6 property, method, and confidence; alias is HUMAN_ALIAS 1.00; unknown vendor is `vendor_id` null; an Ohio address is UNRESOLVED.
- [ ] CRS: asked in #spons-crs-credit-api for creds + test identities
- [ ] CREAO: agent created on agent.creao.ai (input field `prompt`), API key in `.env.local`, one manual run returns parseable JSON
- [ ] Investigator: CREAO client (start + poll + parse) behind `investigate()`
- [ ] Investigator: Claude fallback (tool runner + `submit_brief`, or single-call)
- [ ] Intake agent: `extractDocument` on 2 fixtures, timeout and refusal paths return a typed failure
- [ ] Fixtures committed (redacted), CLI script works
- [ ] 6:00 PM: CRS go/no-go decided and posted
- [ ] README skeleton + Devpost draft saved (10:00 PM)
- [ ] CREAO Agent ID + public run link at the top of README and Devpost
- [ ] Final README true against `REAL_VS_SIMULATED`; submitted by 8:45 AM
