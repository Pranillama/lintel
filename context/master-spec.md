# Lintel Master Spec

Locked Saturday Oct 24, 2026, 11:45 AM PDT by Pranil, Anmol, Piyush.
Hard deadline: **Devpost submit Sunday Oct 25, 9:00 AM PDT.** Judging 10:30 AM, all three at the table.

This is the base spec. If a lane spec or a teammate's agent disagrees with this file, this file wins. Changes go through `context/ai-workflow-rules.md`.

---

## 1. Product in one paragraph

Lintel is an autonomous accounts payable desk for a multi-property real estate portfolio. Bills come in (typed, replayed from a feed, or dropped as a PDF/photo). An intake agent reads them. Deterministic code matches each bill to a property and vendor, checks for duplicates, usage and amount spikes, and policy limits, and decides: **CLEARED**, **HELD**, or **BLOCKED**. For every held or blocked bill, an investigator agent (CREAO, Claude fallback) gathers evidence and drafts the follow-up a human would send. A person owns every exception. Every step lands in an append-only, hash-chained audit log.

> **The model reads the bill. Code decides whether it gets paid. Agents do the legwork. A person owns the exceptions.**

Seats line (use verbatim everywhere): **Fills 2 full-time property AP and utility-audit seats on a 250-property portfolio.**

Source problem: DSD Cohort "Property Bill Automation" (a CTO about to spend $10M because paying bills across hundreds of properties takes employees two full days a month).

---

## 2. Locked decisions

| # | Decision | Locked choice |
|---|---|---|
| 1 | Main track | **Hyphenate**, Autonomous Systems for Finance |
| 2 | Extra tracks | **Microsoft** (README paragraph), **CREAO** (investigator agent via API), **Convex** (the system of record), **CRS** (gated: live sandbox + official test identities by **6:00 PM Sat** or the track is dropped) |
| 3 | Stretch only | Coinbase x402 settlement for cleared contractors. Starts only after the 2:00 AM freeze checklist is green and CRS is live. |
| 4 | Dropped | Mana, Figma (unless someone keeps a true Stage Log), Fetch, Anthropic Public Benefit, Coinbase Trading |
| 5 | Orchestrator | Our own code: `processBill()` is a deterministic state machine. Agents are workers inside it. |
| 6 | Agents | **Intake agent** (Claude, reads PDF/photo). **Investigator agent** (CREAO via REST, Claude tool-use fallback; read-only tools; drafts actions; cannot change status). |
| 7 | Money decisions | 100% deterministic TypeScript. The engine and matcher never import a model SDK. |
| 8 | Statuses | `CLEARED` / `HELD` / `BLOCKED` (+ `REJECTED` after a human). Reason codes explain why. |
| 9 | Policy | Two-track: enrolled utilities clear on account match + no duplicate + no spike. Contractors clear under the property auto-pay limit. |
| 10 | Opening shot | 4-bill blotter replayed through the live engine. Totals land on **Blocked $680.00 · Held $6,100.00 · Cleared $2,290.40**. |
| 11 | Learning | Human assigns "1880 Lombard #B" once, an alias is stored, the next bill with that address matches at 1.00 by `HUMAN_ALIAS` and clears. |
| 12 | Judge chip | Recology, new invoice `RW-10021`, **$686** due today: fuzzy duplicate of `RW-99201`, BLOCKED. |
| 13 | Stack | One Next.js 16 App Router app, TypeScript strict, **Convex as the only backend**, Tailwind 4, Vitest, `@anthropic-ai/sdk`, zod. No auth, no SQLite, no route-handler API, no second app. The browser calls Convex only. |
| 14 | Lanes | Pranil: intake + agents + matching + integrations + README. Anmol: engine + pipeline + DB + audit + API + tests. Piyush: the whole UI + video. |

---

## 3. What we build vs. cut

**Build (the loop, all real):**
1. Intake: injector form, FEED replay, PDF/photo upload. All produce the same `ExtractedBill`.
2. Matching: exact account → stored human alias → address (number + street, unit check) → unresolved. Hold below 0.90.
3. Guardrails: exact duplicate, fuzzy duplicate, line-sum, amount + usage spike, vendor trust, two-track policy.
4. Decision + why-sentence + required approver, deterministic.
5. Human actions: assign property (stores alias, re-evaluates), approve, reject, send drafted action.
6. Investigator brief on every HELD/BLOCKED bill.
7. Audit log, per-bill SHA-256 chain, chain check on every list load.
8. Seats line, policy card, Real vs Simulated modal.

**Cut:** email/IMAP intake, mailroom, vendor-portal scraping, RBAC/login, property CRUD, real payments (Plaid/Stripe/NACHA), ML anomaly models, Slack/email notifications, multi-tenant anything, BILL-105/106 in the opening, the 30-bill/10-vendor seed (we seed what the math needs), the "$9,810 in losses" line.

**Stretch (in order, only after freeze checklist is green):** sparkline polish → line-sum fixture on screen → "portal down" payment failure → CRS (if creds) → x402.

---

## 4. Architecture

The runtime shape is the Eraser diagram, [Lintel end-to-end architecture](https://app.eraser.io/workspace/nCH5coHP4gcTnJ6qBik0?diagram=6zi90Ltsnv4FgTIQQzJK&layout=canvas), in Anmol's Team. Convex is the only backend. The command center subscribes to it. Keys for Claude, CREAO, CRS, and Coinbase live in the Convex environment, never in the browser.

The same diagram has a separate highlighted group, **Add-on: precedent learning (not on the Sunday demo path)**, specified in `context/add-ons/precedent-learning.md`. That group is not part of the pipeline steps below.

```
Browser — AP Command Center (Next.js, thin)
  subscribe: listBills, getBill, verifyAudit
  Judge form / replay / upload  ──►  processBill action
  Assign, approve, reject, send draft  ──►  humanResume mutation
        │
Convex
  Queries (reactive, no network)
    listBills, getBill, verifyAudit
  Mutations (one transaction, no network, no model)
    each writes the bill row and one auditEvents row
    createBill, commitExtraction, commitMatch, commitPolicy,
    commitCrs, commitPayment, humanResume
  Actions (the only place HTTP is allowed)
    processBill      orchestrator                         Anmol
    extractBill      Claude + CREAO, DOCUMENT path only   Pranil
    verifyVendor     CRS sandbox, flag-gated              Pranil
    settleX402       Coinbase on Base Sepolia, stretch    Pranil
    investigate      CREAO, then Claude fallback          Pranil
  File storage: PDFs and photos
  Tables: properties, vendors, vendorAccounts, bills,
          auditEvents, payments, aliases, investigations
```

**`processBill` is a Convex action and the only code path that creates a bill.** The form, the FEED replay, and the upload all call it. There is no demo mode and no second pipeline.

1. `createBill` stores the file when there is one.
2. FORM or FEED runs `normalizeForm()` inside the action. No model. DOCUMENT runs `extractBill`, which calls Claude and CREAO and returns one `ExtractedBill` (confidence and a source snippet on every field). `commitExtraction` saves it. A timeout, refusal, or parse failure sets `extraction_error` and does not invent fields.
3. `commitMatch` runs `matchBill()` from §5.4. That function is pure. Exact account number is confidence 1.00. Then a stored human alias. Then the address score. CREAO does not write `match_confidence`.
4. `verifyVendor` runs only for an `UNVERIFIED_CONTRACTOR` when `LINTEL_CRS_ENABLED=true`. Otherwise the outcome is `NOT_RUN`. `commitCrs` stores whatever the sandbox returned. A timeout is `UNAVAILABLE`, never a pass.
5. `commitPolicy` runs `decide()` from §5. No model.
6. A cleared contractor with `LINTEL_X402_ENABLED=true` runs `settleX402`, then `commitPayment` stores the tx hash and `LIVE_TESTNET`. Every other cleared bill is `commitPayment` with rail `UTILITY_PORTAL` or `ACH` and mode `SIMULATED`. The payment row is unique on bill id.
7. A HELD or BLOCKED bill schedules `investigate`. CREAO first, Claude if CREAO does not return a brief. The action writes the investigation and its audit rows. It does not change bill status. CREAO cold starts are why this step is not on the form's two-second path.

FORM and FEED stay under 2 seconds because they never call `extractBill`. The screen does not poll. `listBills` is a subscription, so a brief moving to DONE shows up on its own.

`decide` and `matchBill` stay pure functions over a `LedgerSnapshot`. They do not import Convex, a model SDK, or `fetch`. Mutations do not call the network. Actions are the only files that may.

**Where AI is allowed:** `extractBill` reading a document into fields; `investigate` drafting a brief. **Where AI is forbidden:** duplicates, variance math, limits, status, approver, rail, payment, the property match decision, vendor creation, audit hashes. Put this list in a comment at the top of `convex/lib/engine.ts`.

---

## 5. Decision rules (the engine)

All thresholds live in `src/seed/policy.ts` (`POLICY`). The policy card text is generated from the same constants.

### 5.1 Checks, in order (every check writes a `CheckResult`, PASS included)

| Check | Rule | Outcome |
|---|---|---|
| `EXTRACTION` | Critical fields: vendor_name, invoice_number, total_amount (> 0), due_date, and account_number **or** service_address. Missing → `MISSING_FIELD`. Confidence < 0.85 → `LOW_CONFIDENCE`. `extraction_error` set → `EXTRACTION_FAILED`. | HALT or PASS |
| `MATCH` | `vendor_id` null → `UNKNOWN_VENDOR`. Property null or confidence < 0.90 → `NEEDS_PROPERTY_MATCH`. Account belongs to another vendor → `VENDOR_ACCOUNT_CONFLICT`. | HALT or PASS |
| `EXACT_DUPLICATE` | Same vendor + `normalizeInvoice()` equal, against history (any date) and live bills with status CLEARED or HELD (not self). Needs vendor + invoice, else SKIP. | BLOCK or PASS |
| `FUZZY_DUPLICATE` | Same vendor + same property + amount within 2% of the prior bill + due dates within 20 days, same comparison set. Fires even when the invoice also matched. | BLOCK or PASS |
| `LINE_SUM` | If line items exist and `abs(sum − total) > 0.01` → `LINE_SUM_MISMATCH`. No line items → SKIP. | BLOCK, PASS, SKIP |
| `SPIKE` | Utilities only (contractors SKIP). Baseline = up to 3 most recent prior bills (history + CLEARED live) for same vendor + property with due_date before this bill's. Fewer than 2 → `NO_BASELINE`. `variance = (x − avg) / avg × 100`. Amount > +25% → `AMOUNT_SPIKE`. Usage present and > +25% vs usage avg → `USAGE_SPIKE`. Negative never trips. | HALT or PASS |
| `VENDOR_TRUST` | `UNVERIFIED_CONTRACTOR` only. CRS `PASS` → PASS. `FLAGGED` → BLOCK `CRS_FLAGGED`. `UNAVAILABLE` → HALT `CRS_UNAVAILABLE`. `NOT_RUN` → HALT `VENDOR_UNVERIFIED`. Others SKIP. | BLOCK, HALT, PASS, SKIP |
| `POLICY` | Utility: match method `EXACT_ACCOUNT` → PASS, rail `UTILITY_PORTAL`; otherwise HALT `UTILITY_NOT_ACCOUNT_MATCHED`. Contractor: amount ≤ property `contractor_auto_pay_limit` → PASS, rail `ACH`; else HALT `OVER_AUTO_PAY_LIMIT`. | HALT or PASS |

Checks that cannot run because an earlier input is missing (no property for SPIKE, no vendor for duplicates) return SKIP with a rationale saying why.

### 5.2 Status and approver (first matching group wins; `reasons` lists every failing check)

| Priority | Reasons | Status | Required approver |
|---|---|---|---|
| 1 | EXACT_DUPLICATE, FUZZY_DUPLICATE, LINE_SUM_MISMATCH, CRS_FLAGGED | **BLOCKED** | NONE (no pay control) |
| 2 | MISSING_FIELD, LOW_CONFIDENCE, EXTRACTION_FAILED, NEEDS_PROPERTY_MATCH, UNKNOWN_VENDOR, VENDOR_ACCOUNT_CONFLICT | **HELD** | OPERATOR |
| 3 | USAGE_SPIKE, AMOUNT_SPIKE, NO_BASELINE | **HELD** | VP_FINANCE if amount > $5,000, else PROPERTY_MANAGER |
| 4 | VENDOR_UNVERIFIED, CRS_UNAVAILABLE | **HELD** | PROPERTY_MANAGER |
| 5 | OVER_AUTO_PAY_LIMIT, UTILITY_NOT_ACCOUNT_MATCHED | **HELD** | VP_FINANCE if amount > $5,000, else PROPERTY_MANAGER (utility-not-matched: OPERATOR) |
| none | | **CLEARED** | NONE. Payment instruction: rail from POLICY, mode SIMULATED, status SCHEDULED. |

`duplicate_of`: the matched prior bill, preferring PAID history / CLEARED over HELD, then the closest due date.

### 5.3 Why-sentence templates (deterministic, built in `src/engine/explain.ts`)

- CLEARED utility: `Matched Bayview Commons by account 4491-882-01. $2,290.40 is −2.1% vs the last 3 PG&E bills ($2,340.00 avg). Not a duplicate. Enrolled utility: cleared to the utility portal (simulated).`
- BLOCKED exact: `Recology invoice RW-99201 was already paid on 2026-10-17 (HIST-…). Same property and amount within 2%, due 14 days apart. Blocked: duplicates are never paid.`
- BLOCKED fuzzy: `New invoice RW-10021, but $686.00 is within 2% of $680.00 (RW-99201) for the same vendor and property, due 5 days apart. Blocked as a likely duplicate.`
- HELD spike: `Usage 160 CCF vs 42 CCF avg (+281.0%); $5,680.00 vs $1,490.00 avg (+281.2%), threshold +25%. Rate is flat (~$35.50/CCF): suspected leak. Held for VP Finance.`
- HELD match: `"1880 Lombard #B" matches Telegraph Hill Lofts on street, but unit #B is not on the property. Confidence capped at 0.80 (needs 0.90). Held for a person to assign.`

Format money as `$1,234.56`, percentages with one decimal and an explicit sign.

### 5.4 Matching (deterministic, `src/match/`)

1. **Vendor:** `normalizeVendorName(bill)` equals the normalized name or any alias → `EXACT_NAME`/`ALIAS`. Else, if the account matches, take the account's vendor (`ACCOUNT`). Else `NONE` (unknown vendor). No fuzzy vendor guessing, no auto-created vendors.
2. **Property, in order:**
   1. `EXACT_ACCOUNT`: `normalizeAccount()` equals a seeded account → that property, confidence 1.00. If the bill's vendor name resolved to a different vendor → `vendor_account_conflict = true`.
   2. `HUMAN_ALIAS`: `normalizeAddressKey(service_address)` equals a stored alias → that property, 1.00.
   3. `ADDRESS`: score every property with `parseAddress()`. Number + street equal → 0.95; +0.05 if a locality token equals the property city or zip (max 1.00). Street equal, number missing → 0.60. Unit present, property has a units list, unit not in it → cap 0.80. Candidates sorted by score; if the top two are within 0.10 → confidence = min(top, 0.85).
   4. Else `UNRESOLVED`, confidence 0.
3. `address_key` is always set when there is a service address, so the UI can offer "assign and remember".

---

## 6. Demo data and expected outcomes

Seed: `src/seed/portfolio.ts` (5 properties, 7 vendors, 9 accounts, 30 paid history bills). Inputs: `src/seed/demo-inputs.ts`. These expected outcomes are the golden tests in `tests/` (Anmol) and were checked against the seed arithmetic on Oct 24.

| Key | Input | Expected status | Reasons / numbers |
|---|---|---|---|
| BILL-101 | PG&E, acct 4491-882-01, $2,290.40, 8,120 kWh | **CLEARED** | EXACT_ACCOUNT 1.00 → Bayview. −2.1% vs $2,340.00; usage −2.2%. Rail UTILITY_PORTAL, SIMULATED. |
| BILL-102 | Recology RW-99201, $680.00, due 2026-11-03 | **BLOCKED** | EXACT_DUPLICATE + FUZZY_DUPLICATE of RW-99201 (paid, due 2026-10-20, 14 days). |
| BILL-103 | EBMUD, acct 88-2110-4471, $5,680.00, 160 CCF | **HELD** | USAGE_SPIKE +281.0% (vs 42 CCF), AMOUNT_SPIKE +281.2% (vs $1,490.00). Approver VP_FINANCE. |
| BILL-104 | Bayline Plumbing, "1880 Lombard #B", no account, $420.00 | **HELD** | NEEDS_PROPERTY_MATCH. ADDRESS → Telegraph Hill Lofts, capped 0.80 (unit #B not on property). Approver OPERATOR. |
| after assign | Human assigns BILL-104 to PROP-002 | **CLEARED** | Alias `1880 LOMBARD #B` stored. Re-evaluated: $420.00 ≤ $1,000 limit, ACH. resolved_by HUMAN. |
| BILL-104B | Bayline, "1880 Lombard #B", $390.00 (after alias) | **CLEARED** | HUMAN_ALIAS 1.00. $390.00 ≤ $1,000, ACH. No human touch. (Before the alias: HELD, same as 104.) |
| CHIP-FUZZY-DUP | Recology RW-10021, $686.00, due 2026-10-25 | **BLOCKED** | FUZZY_DUPLICATE of RW-99201: 0.9% apart, 5 days. Exact rule PASS (new invoice). |
| CHIP-CLEAN-PGE | PG&E, acct 5512-301-07, $1,595.20 | **CLEARED** | −0.9% vs $1,610.00. |
| CHIP-NEW-CONTRACTOR | Apex Rapid HVAC LLC, 410 Townsend St, $3,450.00 | **HELD** | VENDOR_UNVERIFIED (CRS off) + OVER_AUTO_PAY_LIMIT ($3,000 limit). CRS on: FLAGGED → BLOCKED, PASS → HELD on the limit only. |
| CHIP-CONTRACTOR-CLEAN | Pacific Green, 3100 Fillmore St, $890.00 | **CLEARED** | ADDRESS 1.00. $890.00 ≤ $2,500. Not a fuzzy dup of last month's $890 (30 days > 20). |
| BILL-LINESUM | SFPUC, lines $850.00 vs printed $1,850.00 | **BLOCKED** | LINE_SUM_MISMATCH (also AMOUNT_SPIKE +120.2%, listed but status is BLOCKED). |

**Opening totals after replay:** Blocked **$680.00** (102) · Held **$6,100.00** (103 + 104) · Cleared **$2,290.40** (101).

**Replay semantics:** the `replayOpening` mutation wipes live bills, live audit rows, investigations, and aliases (seed history stays), then runs the 4 opening inputs through `processBill` as source `FEED`, label `Saturday intake`, in order. Without the wipe the second replay would flag BILL-101 as a duplicate of itself. `resetDemo` does the wipe only. The operator-only reset button is not in the judge drawer; say so if you press it.

---

## 7. Hyphenate hard requirements → where they live

| Requirement | Where |
|---|---|
| Video opens on "the moment" | First frame = blotter mid-count, totals landing. No title card. (Piyush) |
| Live judge scenario | Judge Live Test drawer → `processBill`. Chips prefill only. (Piyush + Anmol) |
| One seats line | Header + README, `SEATS_LINE`. |
| Real vs simulated + how you know | Modal + README, `REAL_VS_SIMULATED`. Keep it true. |
| Persistent auditable log | Convex `auditEvents`, hash chain, drawer. `verifyAudit` recomputes it. |
| Something new | Agents investigate and draft; code decides money; the system learns aliases from humans. |

**CREAO hard requirements:** agent on agent.creao.ai doing core work (investigation), Agent ID + public run share link at the top of README and Devpost, run visible in the demo (brief shows `provider: CREAO` and the run link), CREAO track selected. Track: **AI-First Disruptor**.
**CRS hard requirements:** live sandbox call shown in the demo, official test identities only, central (the vendor-trust gate on contractor bills). If not live by 6:00 PM: off, row stays out of Real vs Simulated, track not selected.
**Microsoft:** README paragraph: customer (multi-property AP desk), measurable usefulness (dollars blocked/held/cleared per batch, minutes per bill), path to production (Postgres, real rails behind the same `PaymentInstruction`, SSO), responsible design (AI/code/human split, append-only log), end to end.

---

## 8. Two-minute table demo

One narrator (Pranil). Anmol drives the laptop. Piyush handles the judge and the second laptop. All three stay the full 10:30 to 12:30 window or we are not judged.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:05 | Replay runs on load. Four rows settle, totals land: Blocked $680.00 · Held $6,100.00 · Cleared $2,290.40. | Nothing. |
| 0:05–0:25 | Blotter. | "This is the AP desk for a 250-property book; five properties are loaded. Four bills just came in. PG&E is an enrolled utility, 2% under its usual bill, so it cleared to the portal, simulated. The $680 trash bill was already paid." |
| 0:25–0:50 | Select EBMUD: why-card, usage bars, investigator brief with drafted work order. | "Duplicates and spike math are code, not a model. This water bill is four times the usage at the same rate: probably a leak. The investigator agent already pulled the history and drafted the work order; a person sends it." |
| 0:50–1:15 | Select $420 row, assign Telegraph Hill. Then run the $390 twin chip: `HUMAN_ALIAS`, cleared. | "Unit B isn't in that building, so it stops at 0.80. We assign it once. The next bill from that address matches by what the human taught it and clears on its own." |
| 1:15–1:35 | Turn laptop. Injector open, $686 chip visible. | "Type any bill, or use this one. Same engine." |
| 1:35–2:00 | Judge runs it: BLOCKED, fuzzy duplicate of RW-99201. | "New invoice number, within 2% of one we already paid, five days apart. Blocked. Nothing is set to pay." |

If they hand you paper: drop the photo. If fields are not back in 20 s, the row is already HELD: "It won't decide money on a partial read." Type their total into the form.

**Do not say:** "we stopped $X in losses", "200 doors", any CRS score we did not receive, "settled in USDC" without a hash on screen.

---

## 9. Timeline (PDT) and gates

| By | Gate | Owner |
|---|---|---|
| Sat 12:30 PM | Specs merged. Scaffold + typed stubs on `main`, `npm run dev` and `npm test` green. | Pranil |
| Sat 4:00 PM | Each lane works alone: engine golden tests green with no model; matcher tests green; extraction works on 2 fixtures; UI renders mock `BillView`s. | all |
| Sat 6:00 PM | **CRS go/no-go.** **Integration:** form → `processBill` → UI, replay produces the opening totals. | all |
| Sat 9:00 PM | Investigator (CREAO + fallback) on held bills. Alias flow end to end. Audit drawer. | Pranil, Piyush |
| Sat 10:00 PM | **Devpost draft saved** (organizer recommendation), tracks selected, README skeleton. Full demo run twice without a console error. | Pranil |
| Sun 2:00 AM | **Feature freeze.** Only bug fixes and copy after this. Stretch only if the freeze checklist is green. | all |
| Sun 7:30 AM | Video recorded (first frame = blotter). README true. | Piyush, Pranil |
| Sun 8:45 AM | **Submitted.** | Pranil |
| Sun 10:30 AM | At the table, laptops charged, hotspot on, DB replayed. | all |

**Freeze checklist:** replay totals correct twice in a row; $686 chip blocks; alias flow clears the twin; EBMUD shows numbers and a brief; every bill has an intact chain; Real vs Simulated is true; no console errors.

**Kill order if behind at 6:00 PM:** PDF upload → CRS → sparkline → investigator Claude tool-use (keep single-call) → CREAO. **Never cut:** `processBill`, replay, injector, why-card with numbers, audit list, alias flow.
