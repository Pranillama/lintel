# Lane: Anmol (engine, pipeline, DB, audit, API, tests)

You own the part that decides money and records it. Everything here is deterministic code. You are the critical path: the UI and the agents plug into what you serve.

**Read first:** `context/master-spec.md` §4 to §6 (architecture, rules, golden outcomes), `context/code-standards.md`, `src/types/bill.ts`, `src/seed/`.

**Your folders:** `src/engine/`, `src/audit/`, `convex/schema.ts`, `convex/seed.ts`, `convex/bills/`, `convex/pipeline/`, `convex/engine/`, `convex/audit/`, `convex/lib/`, `tests/` (except `tests/match/`, `tests/intake/`). The browser never hits a Next route for bill data. It calls these Convex functions.

**You consume (from Pranil):** `normalizeForm` (`src/intake/normalizeForm.ts`), `extractDocument` (`src/agents/intake/extractDocument.ts`), `matchBill` (`src/match/matchBill.ts`), `verifyVendor` (`src/integrations/crs/verifyVendor.ts`), `investigate` (`src/agents/investigator/investigate.ts`). Stubs exist from the scaffold; call them by these paths and signatures.

**You serve (to Piyush):** the API in §5 with the response types from `bill.ts`.

---

## 1. Engine (`src/engine/`), pure, no IO, no model imports

| File | Export | Notes |
|---|---|---|
| `checks.ts` | one function per `CheckId`: `checkExtraction`, `checkMatch`, `checkExactDuplicate`, `checkFuzzyDuplicate`, `checkLineSum`, `checkSpike`, `checkVendorTrust`, `checkPolicy` | Each returns `CheckResult` with numbers in `rationale` and `data`. Rules: master-spec §5.1. Thresholds: `POLICY` from `@/seed/policy`. |
| `decide.ts` | `decide: DecideFn` | Runs all checks in `CheckId` order, applies §5.2 priority, sets `required_approver`, `duplicate_of`, `rail`, and `why` (from `explain.ts`). Top-of-file comment listing what AI is forbidden to decide (master-spec §4). |
| `explain.ts` | `explain(decision parts, extracted, match, ledger): string` | §5.3 templates. Money via `Intl.NumberFormat`, signed one-decimal percents. |
| `totals.ts` | `computeTotals(bills: BillRecord[]): Totals` | Sum `amount` by status, rounded. |

Details that matter:
- Comparison set for duplicates: `ledger.history` (all) + `ledger.bills` with status CLEARED or HELD, **excluding the bill being decided** (`bill_id`). Re-evaluation after an assign must not find itself.
- Spike baseline: same vendor + property, `due_date` strictly before this bill's, history + CLEARED live bills, newest first, take `POLICY.BASELINE_BILLS`. `SpikeData` goes in the SPIKE check's `data` (the UI draws bars from it).
- `duplicate_of` preference: PAID history / CLEARED first, then HELD; tie-break by closest due date.
- Unknown property or vendor: dependent checks return SKIP with a rationale ("no property, spike not computed").

## 2. Convex (`convex/`)

- `schema.ts`: the tables in code-standards §7. Money fields match `bill.ts`.
- `bills.ts`: `listBills` and `getBill` return `BillsResponse` / `BillView` newest first, with `audit_chain_intact`. `createBill` stores a file and inserts the row. `humanResume` is assign, approve, reject, and send-draft (the rules in §4 below). `replayOpening` and `resetDemo` live here.
- `seed.ts`: inserts `src/seed` when `properties` is empty. Idempotent.
- There is no `data/lintel.db` and no `src/db`. A ledger snapshot is a query result passed into the pure engine.

## 3. Audit (`src/audit/`)

- `chain.ts`: `hashEvent(prev_hash, e) = sha256(prev_hash|bill_id|seq|ts|actor|action|decision|rationale)` hex via `node:crypto`. Genesis `prev_hash` = 64 zeros. `verifyChain(events): boolean`.
- `append.ts`: `appendEvents(db, billId, drafts: Omit<AuditEvent, "id"|"seq"|"prev_hash"|"hash">[]): AuditEvent[]`: reads the last event for the bill, assigns seq, chains hashes, inserts. Same transaction as the bill write.
- Insert-only. `wipeLiveData` is the only delete.

## 4. Pipeline (`convex/pipeline/process.ts`), the orchestrator

`processBill` is a Convex **action**. It follows master-spec §4. It calls mutations for every write and calls Pranil's actions for HTTP. It does not set a status itself.

1. Id `BILL-<yymmdd>-<4 hex>`, `created_at` now. `createBill` stores a document when there is one.
2. FORM/FEED → `normalizeForm(form, kind)`. DOCUMENT → `extractBill` action (`extractDocument`). Then `commitExtraction`.
3. `commitMatch` loads the ledger and runs `matchBill`. No model.
4. Vendor is `UNVERIFIED_CONTRACTOR` and `LINTEL_CRS_ENABLED=true` → `verifyVendor` action, then `commitCrs`. Else outcome `NOT_RUN`.
5. `commitPolicy` runs `decide()`. A cleared contractor with x402 enabled then runs `settleX402` and `commitPayment` stores the hash. Every other cleared bill is `commitPayment` with mode `SIMULATED`.
6. Audit rows, in this order, each inside the mutation that learned the fact: `INTAKE` (actor HUMAN_INPUT / SYSTEM_FEED / AI_EXTRACTION), `EXTRACT_FIELDS`, `RESOLVE_VENDOR`, `RESOLVE_PROPERTY` (actor `HUMAN_ALIAS` when method is HUMAN_ALIAS, else DETERMINISTIC_RULE), one `CHECK` per check (DETERMINISTIC_RULE, decision PASS/HALT/BLOCK/INFO for SKIP), `VERIFY_VENDOR` (CRS_SANDBOX) if run, `DECISION`, `ROUTE_PAYMENT` (PAYMENT_ROUTER, EXECUTE) if CLEARED.
7. If HELD/BLOCKED, the mutation inserts investigation `PENDING` and the action schedules `investigate`. Return the `BillView`. FORM/FEED target is under 2 seconds.
- `investigate`: build `InvestigationContext` (bill, property, vendor, history same property+vendor max 6, related live bills max 6, `POLICY_TEXT`), set RUNNING + audit `INVESTIGATION_STARTED`, `await investigate(ctx)`, save brief, audit `INVESTIGATION_COMPLETED`/`FAILED` (actor AI_INVESTIGATOR, rationale = summary or error, data = provider, run id). Never touches bill status.
- `humanResume` in `convex/bills/resume.ts`:
  - assign: only HELD bills whose reasons include NEEDS_PROPERTY_MATCH. Audit `HUMAN_ASSIGN_PROPERTY` (HUMAN_OPERATOR) and, if `match.address_key`, insert alias + `ALIAS_STORED`. New match = method HUMAN_ASSIGNED, confidence 1.00. Re-run `decide` (ledger excludes self), write new CHECK + DECISION rows, update status, `resolved_by = "HUMAN"`, payment if CLEARED.
  - approve: only HELD with **no** priority-2 reasons (fields and property must be trusted first). Status CLEARED, `resolved_by HUMAN`, payment from the vendor's default rail. Audit `HUMAN_APPROVE` with the approver role and note.
  - reject: HELD → REJECTED. Audit `HUMAN_REJECT`.
  - send-draft: brief DONE with a draft → `draft_sent = true`, audit `DRAFT_SENT` (HUMAN_OPERATOR). Nothing is actually sent.
  - BLOCKED bills reject every action with `ConvexError`.
- `replayOpening`: wipe live bills, audit, investigations, and aliases, then `processBill({ kind: "FEED", form, feed_label: "Saturday intake" })` for each `OPENING_BATCH` item **in order**. `resetDemo` wipes only.

## 5. Functions the UI calls

There is no `src/app/api`. Piyush uses the Convex client.

| Function | Kind | Returns |
|---|---|---|
| `listBills` | query | `BillsResponse` (newest first, totals, `audit_chain_intact`) |
| `getPortfolio` | query | `PortfolioResponse` |
| `processBill` | action | `BillView` |
| `humanResume` | mutation | `BillView`, with a `kind` of assign, approve, reject, or send-draft |
| `replayOpening` | mutation | `ReplayResponse` |
| `resetDemo` | mutation | `{ ok: true }` |
| `verifyAudit` | query | chain ok or the first broken bill |

- After `processBill`, assign, and replay, schedule `investigate` with the Convex scheduler for every new or still HELD/BLOCKED bill without a brief. Replay runs those investigations one after another. Do not use Next `after()`.
- A bad argument throws `ConvexError`. Unknown bill and an illegal action do too, with a message the drawer can show.

## 6. Tests (`tests/`)

- `tests/golden.test.ts`: every row of master-spec §6 against `decide()` with the seed ledger. Until Pranil's matcher is real, build each row's `MatchResult` by hand in a fixture helper; switch to the real `matchBill` once it lands (keep both if useful). Assert status, reasons, and that the rationale contains the numbers (`"+281.2%"`, `"$2,340.00"`, `"RW-99201"`).
- `tests/pipeline.test.ts`: replay totals = 680.00 / 6100.00 / 2290.40; replay twice gives the same totals; assign on BILL-104 stores an alias and clears; then ALIAS_TWIN clears with method HUMAN_ALIAS; the $686 chip blocks after replay; approve on a BLOCKED bill throws. The pure checks run in Vitest with no network. The replay test runs against a Convex test identity.
- `tests/audit.test.ts`: chain verifies; tampering one rationale breaks `verifyChain`.
- `tests/boundary.test.ts`: fail if any file under `src/engine/` or `src/match/` imports `@anthropic-ai/sdk`, `src/agents`, `src/integrations`, `convex/`, `node:fs`, or calls `fetch(`. Fail if a file under `convex/` other than `intake.ts`, `crs.ts`, `payments.ts`, and `pipeline.ts` calls `fetch(`.

---

## Checklist (update only this list, in the same commit as the work)

- [x] Engine: `checkExtraction`, `checkMatch`, `checkLineSum` + unit tests
- [x] Engine: exact + fuzzy duplicate checks (self excluded, 20-day window) + tests
- [x] Engine: spike check with `SpikeData` (amount + usage) + tests
- [x] Engine: vendor trust + two-track policy + approver ladder
- [x] Engine: `decide()` + `explain()`; golden tests green for all §6 rows (hand-built matches)
- [x] Audit: append + hash chain + `verifyAudit` + tests
- [x] Convex: schema, idempotent seed, `listBills`, `getBill`, `verifyAudit`
- [ ] Pipeline: `processBill` action (FORM/FEED path) + audit rows; pipeline test for replay totals
- [ ] Functions: `listBills`, `getPortfolio`, `processBill`, `replayOpening`, `resetDemo` (unblocks Piyush; post in #anmol-update)
- [ ] `humanResume`: assign (alias + re-evaluate), approve, reject, send-draft + tests
- [ ] Investigation scheduled from the action; `runInvestigation` writes brief + audit rows and does not change status
- [ ] DOCUMENT path: Convex file storage → `extractBill` → same pipeline
- [ ] Golden tests switched to the real `matchBill`; boundary test green
- [ ] 6:00 PM gate: replay totals correct from the UI
- [ ] Freeze checklist (master-spec §9) items you own all green
- [x] Real data only (`feature/properties-info`): no seed, no replay, no simulated payments; Properties & vendors view with add property / vendor / account (`convex/portfolio/admin.ts` + `tests/portfolio/admin.test.ts`). See master-spec amendment.
- [x] UI revamp (`feature/ui-revamp`): real routes under one app shell (Inbox, Bill detail with the printing ticket, Properties, Vendors, Policy, Audit log, upload-first drawer, printer landing), plain-language copy throughout. No contract changes. See `context/ui-context.md`.
- [x] Receipt story (Variation C) built as `src/components/story/ReceiptStory`: scripted demo hero on `/` (3D printer kept below), live full-screen story on every upload driven by the Convex subscription, replay from the bill page. `liveScript` tested in `tests/ui/story.test.ts`.
