# Lane: Anmol (engine, pipeline, DB, audit, API, tests)

You own the part that decides money and records it. Everything here is deterministic code. You are the critical path: the UI and the agents plug into what you serve.

**Read first:** `context/master-spec.md` §4 to §6 (architecture, rules, golden outcomes), `context/code-standards.md`, `src/types/bill.ts`, `src/seed/`.

**Your folders:** `src/engine/`, `src/pipeline/`, `src/db/`, `src/audit/`, `src/app/api/`, `tests/` (except `tests/match/`, `tests/intake/`).

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

## 2. DB (`src/db/`)

- `db.ts`: `getDb()` opens `data/lintel.db` (creates `data/`), runs `schema.sql` / migrations, seeds from `@/seed` if `properties` is empty. `openDb(":memory:")` for tests. Idempotent.
- `repo.ts`: `getLedgerSnapshot(): LedgerSnapshot`, `insertBill`, `updateBill`, `getBill`, `listBillViews(): BillView[]` (newest first), `insertAlias`, `upsertInvestigation`, `getInvestigation`, `wipeLiveData()` (bills, audit, investigations, aliases; never seed tables).
- Store complex fields as JSON text columns; parse on read with zod or a typed parse helper.

## 3. Audit (`src/audit/`)

- `chain.ts`: `hashEvent(prev_hash, e) = sha256(prev_hash|bill_id|seq|ts|actor|action|decision|rationale)` hex via `node:crypto`. Genesis `prev_hash` = 64 zeros. `verifyChain(events): boolean`.
- `append.ts`: `appendEvents(db, billId, drafts: Omit<AuditEvent, "id"|"seq"|"prev_hash"|"hash">[]): AuditEvent[]`: reads the last event for the bill, assigns seq, chains hashes, inserts. Same transaction as the bill write.
- Insert-only. `wipeLiveData` is the only delete.

## 4. Pipeline (`src/pipeline/`), the orchestrator

- `processBill.ts`: `processBill: ProcessBillFn`
  1. id `BILL-<yymmdd>-<4 hex>`, `created_at` now.
  2. FORM/FEED → `normalizeForm(form, kind)`; DOCUMENT → `await extractDocument(doc)`.
  3. `ledger = getLedgerSnapshot()`, `match = matchBill(extracted, ledger)`.
  4. Vendor is `UNVERIFIED_CONTRACTOR` and `LINTEL_CRS_ENABLED=true` → `await verifyVendor(...)`; else `{ outcome: "NOT_RUN", ... }`.
  5. `decision = decide(...)`. If CLEARED: `payment = { rail, mode: "SIMULATED", status: "SCHEDULED", reference: "SIM-<rail>-<id>", idempotency_key: sha256(vendor_id|normalizeInvoice(invoice)) }`.
  6. Audit drafts in this order: `INTAKE` (actor HUMAN_INPUT / SYSTEM_FEED / AI_EXTRACTION), `EXTRACT_FIELDS`, `RESOLVE_VENDOR`, `RESOLVE_PROPERTY` (actor `HUMAN_ALIAS` when method is HUMAN_ALIAS, else DETERMINISTIC_RULE), one `CHECK` per check (DETERMINISTIC_RULE, decision PASS/HALT/BLOCK/INFO for SKIP), `VERIFY_VENDOR` (CRS_SANDBOX) if run, `DECISION`, `ROUTE_PAYMENT` (PAYMENT_ROUTER, EXECUTE) if CLEARED.
  7. One transaction: insert bill + events. If HELD/BLOCKED, insert investigation `PENDING`.
  8. Return `{ bill, events }`. Target < 2 s for FORM/FEED.
- `investigation.ts`: `runInvestigation(billId)`: build `InvestigationContext` (bill, property, vendor, history same property+vendor max 6, related live bills max 6, `POLICY_TEXT`), set RUNNING + audit `INVESTIGATION_STARTED`, `await investigate(ctx)`, save brief, audit `INVESTIGATION_COMPLETED`/`FAILED` (actor AI_INVESTIGATOR, rationale = summary or error, data = provider, run id). Never touches bill status.
- `actions.ts`:
  - `assignProperty(billId, propertyId)`: only HELD bills whose reasons include NEEDS_PROPERTY_MATCH. Audit `HUMAN_ASSIGN_PROPERTY` (HUMAN_OPERATOR) and, if `match.address_key`, insert alias + `ALIAS_STORED`. New match = method HUMAN_ASSIGNED, confidence 1.00. Re-run `decide` (ledger excludes self), write new CHECK + DECISION rows, update status, `resolved_by = "HUMAN"`, payment if CLEARED.
  - `approveBill(billId, note?)`: only HELD with **no** priority-2 reasons (fields and property must be trusted first). Status CLEARED, `resolved_by HUMAN`, payment from the vendor's default rail. Audit `HUMAN_APPROVE` with the approver role and note.
  - `rejectBill(billId, note?)`: HELD → REJECTED. Audit `HUMAN_REJECT`.
  - `sendDraft(billId)`: brief DONE with a draft → `draft_sent = true`, audit `DRAFT_SENT` (HUMAN_OPERATOR). Nothing is actually sent.
  - BLOCKED bills reject every action with 409.
- `replay.ts`: `replayOpening()`: `wipeLiveData()`, then `processBill({ kind: "FEED", form, feed_label: "Saturday intake" })` for each `OPENING_BATCH` item **in order**; returns bills + totals. `resetDemo()` = wipe only.

## 5. API (`src/app/api/`), thin handlers, `export const dynamic = "force-dynamic"` on each

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/bills` | GET | | `BillsResponse` (bills newest first, totals, `audit_chain_intact` = every bill's chain verifies) |
| `/api/portfolio` | GET | | `PortfolioResponse` (seed + `POLICY_TEXT`, `SEATS_LINE`, `REAL_VS_SIMULATED`, flags from env) |
| `/api/bills/process` | POST | JSON `ProcessBillInput`, or multipart with `file` (→ DOCUMENT, base64) | `BillView` |
| `/api/bills/[id]/assign` | POST | `AssignPropertyBody` | `BillView` |
| `/api/bills/[id]/approve` | POST | `HumanDecisionBody` | `BillView` |
| `/api/bills/[id]/reject` | POST | `HumanDecisionBody` | `BillView` |
| `/api/bills/[id]/send-draft` | POST | | `BillView` |
| `/api/demo/replay` | POST | | `ReplayResponse` |
| `/api/demo/reset` | POST | | `{ ok: true }` |

- After `processBill`, `assign`, and `replay`, schedule investigations with `after()` from `next/server` for every new or still HELD/BLOCKED bill without a brief (replay: run the investigations one after another inside one `after`).
- In Next 16, dynamic route `params` is a Promise: `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params`. Check `node_modules/next/dist/docs/` if unsure.
- Validate bodies with zod; 400 on bad input, 404 unknown bill, 409 illegal action.

## 6. Tests (`tests/`)

- `tests/golden.test.ts`: every row of master-spec §6 against `decide()` with the seed ledger. Until Pranil's matcher is real, build each row's `MatchResult` by hand in a fixture helper; switch to the real `matchBill` once it lands (keep both if useful). Assert status, reasons, and that the rationale contains the numbers (`"+281.2%"`, `"$2,340.00"`, `"RW-99201"`).
- `tests/pipeline.test.ts`: `processBill` against `openDb(":memory:")`: replay totals = 680.00 / 6100.00 / 2290.40; replay twice gives the same totals; assign on BILL-104 stores an alias and clears; then ALIAS_TWIN clears with method HUMAN_ALIAS; the $686 chip blocks after replay; approve on a BLOCKED bill throws.
- `tests/audit.test.ts`: chain verifies; tampering one rationale breaks `verifyChain`.
- `tests/boundary.test.ts`: fail if any file under `src/engine/` or `src/match/` imports `@anthropic-ai/sdk`, `src/agents`, `src/integrations`, `src/db`, `node:fs`, or calls `fetch(`.

---

## Checklist (update only this list, in the same commit as the work)

- [ ] Engine: `checkExtraction`, `checkMatch`, `checkLineSum` + unit tests
- [ ] Engine: exact + fuzzy duplicate checks (self excluded, 20-day window) + tests
- [ ] Engine: spike check with `SpikeData` (amount + usage) + tests
- [ ] Engine: vendor trust + two-track policy + approver ladder
- [ ] Engine: `decide()` + `explain()`; golden tests green for all §6 rows (hand-built matches)
- [ ] DB: schema, idempotent seed, `getLedgerSnapshot`, repo functions, `openDb(":memory:")`
- [ ] Audit: append + hash chain + `verifyChain` + tests
- [ ] Pipeline: `processBill` (FORM/FEED path) + audit rows; pipeline test for replay totals
- [ ] API: `GET /api/bills`, `GET /api/portfolio`, `POST /api/bills/process`, `POST /api/demo/replay`, `/reset` (unblocks Piyush; post in #anmol-update)
- [ ] Actions: assign (alias + re-evaluate), approve, reject, send-draft + routes + tests
- [ ] Investigation trigger via `after()`; `runInvestigation` writes brief + audit rows
- [ ] DOCUMENT path: multipart upload → `extractDocument` → same pipeline
- [ ] Golden tests switched to the real `matchBill`; boundary test green
- [ ] 6:00 PM gate: replay totals correct from the UI
- [ ] Freeze checklist (master-spec §9) items you own all green
