# Add-on: Capital One (Nessie) bill payment

Research spec, ready to build. No code has been written for it. Researched Oct 25, 2026 against the code on `main` at `8f0f218`.

Today a cleared bill stops at **"Approved for payment via {rail}"**: no money moves and no payment row is written (master-spec amendment, Oct 25). This add-on makes the last step real in Capital One's banking sandbox. Once deterministic code clears a bill, or a person approves a held one, Lintel pays it from a Capital One sandbox account through the **Nessie API**. It then stores the sandbox reference and shows it on the bill.

> The model reads the bill. Code decides whether it gets paid. **Code pays it, exactly once, through Capital One.** A person owns the exceptions.

Cross-links: `context/master-spec.md` §4 step 6 (settlement), §5.2 (CLEARED → rail), §8 "do not say"; `context/ai-workflow-rules.md` §2 (contract changes), §8 (never invent references); `src/types/bill.ts` (`PaymentRail`, `PaymentInstruction`); sibling `context/add-ons/cartesia-voice.md` (the voice reads the payment status from this spec).

---

## 1. The Capital One track

| Item | Value | Status |
|---|---|---|
| Prize | **"[Capital One] Best Use of Nessie"**, $1,200 cash, 1 winning team, + $300 Giftogram per person | Confirmed on https://cal-hacks-13-0.devpost.com/ |
| Required API | Nessie (implied by the prize name) | No further rules published |
| Judging | No Capital One–specific criteria. General Devpost criteria: Application, Intentionality, Functionality (live demo **and** a clear Devpost video for sponsors judging asynchronously), Creativity, Technical Complexity | Confirmed (general) |
| **Deadline** | **Devpost submission Oct 25, 2026, 9:00 AM PDT** | Confirmed. Select the track on Devpost before then, even if only the spec ships |

**Why Nessie and not the "real" Capital One APIs:** developer.capitalone.com only lists Enhanced Decisioning Data, Prefill Data Orchestrator, and Retrieve Consumer Bank Products. It lists no public money-movement, ACH, or virtual-card API, and onboarding looks partner-gated. Nessie is Capital One's hackathon banking simulator. You get a key with a GitHub login, and it is the API the prize names. **No real money moves**, and the UI and Devpost must say so (§7).

## 2. Current flow, and where payment plugs in

```
processBill (action)
  … → commitPolicy(decide)
         ├─ CLEARED ──► today: audit ROUTE_PAYMENT "<rail> APPROVED_FOR_PAYMENT", payment = null
         │               (+ x402 branch for contractors when LINTEL_X402_ENABLED; settleX402 is a stub that throws)
         └─ HELD/BLOCKED ──► schedule investigate
humanResume (mutation)
  approve ──► status CLEARED, resolved_by HUMAN, audit HUMAN_APPROVE   (no payment today)
```

Two trigger points, both after a deterministic CLEARED:

| # | Trigger | Where | How |
|---|---|---|---|
| A | Auto-cleared bill | `convex/pipeline/process.ts`, right after `commitPolicy` returns `CLEARED` | `ctx.runAction(internal.payments.nessie.pay, { billId })` |
| B | Human approves a HELD bill | `convex/bills/resume.ts`, `approve` branch | A mutation cannot call the network, so `ctx.scheduler.runAfter(0, internal.payments.nessie.pay, { billId })` inside the same transaction as the HUMAN_APPROVE row |

**Never a trigger:** BLOCKED (no pay control exists), REJECTED, HELD, a bill whose `decision.rail` is null, or a bill that already has a payment row (§4).

**Routing is deterministic.** `LINTEL_NESSIE_ENABLED=true` routes **every** cleared bill (utility and contractor) through Nessie. When that flag is on, the existing x402 branch is skipped, so one bill can never take two rails. With the flag off, behaviour is exactly today's.

## 3. Nessie API facts used by this spec

Legend: **[C]** confirmed (docs, OpenAPI spec, or a live probe on Oct 25 2026). **[U]** unverified.

- **Base URL:** `https://api.nessieisreal.com` [C, live]. The OpenAPI spec lists `https://prod-api.nessieisreal.com` and `https://qa-api.nessieisreal.com` [C]. The old `api.reimaginebanking.com` is **dead** [C].
- **Docs:** https://nessieisreal.com/docs. OpenAPI 3.0.3: https://nessieisreal.com/nessie-openapi-spec.yaml [C].
- **Auth:** the API key goes in the query string on every call, `?key=NESSIE_API_KEY` [C].
  - That key will show up in URL logs, so keep it only in the Convex env and never log the full URL.
- **It is a mock bank.** Nessie calls itself "a REST API for banking simulation" [C].
- **Quirks to code around** [C, live]:
  - A missing key returns `502`.
  - A made-up key returns `200 []` on some GETs, and even let a purchase POST succeed.
  - Error bodies are often bare strings (`"Bill with this id does not exist"`) or Pydantic text, not the documented `{code,message}`.
  - Unknown routes return `403 Missing Authentication Token`.
- **No idempotency support** [C]: an `Idempotency-Key` field is rejected. **No documented rate limits** [U].

**Endpoints this spec uses:**

| Purpose | Call | Notes |
|---|---|---|
| Treasury customer (one-time) | `POST /customers` | Setup script only |
| Operating account (one-time) | `POST /customers/{id}/accounts` | Type checking. `_id` → `NESSIE_ACCOUNT_ID` |
| Fund it (one-time) | `POST /accounts/{id}/deposits` `{medium, amount, description}` | `amount` is an integer |
| Balance | `GET /accounts/{id}` | Read by the pre-pay check and the UI |
| **Pay a bill (v1)** | `POST /accounts/{id}/bills` | Body below. Returns `201 "Bill created"` with **no `_id`** [C per spec] |
| Find our payment | `GET /accounts/{id}/bills` | Match on `nickname` = Lintel bill id |
| Read one | `GET /bills/{billId}` | |
| Vendor as merchant (v2) | `POST /merchants` `{name, category, address}` | Only `name` is required [C] |
| Pay a merchant (v2) | `POST /accounts/{id}/purchases` `{merchant_id, medium:"balance", amount, description}` | `amount` is an **integer** [C]. Returns `objectCreated._id` [C]. **This route is live but missing from the OpenAPI spec**; the docs Quick Start mentions it |

Nessie Bill shape [C]:
- Fields: `_id, status, payee, nickname, creation_date, payment_date, recurring_date (1–31), upcoming_payment_date, payment_amount (float), account_id`.
- `status` is one of `pending | cancelled | completed | recurring`.
- Create requires `status, payee, payment_amount`.

### 3.1 Why v1 uses Bills, not Purchases

| | `POST /accounts/{id}/bills` (v1) | `POST /accounts/{id}/purchases` (v2) |
|---|---|---|
| Amount | **float**, so exact cents ($2,290.40 stays $2,290.40) | **integer**; units (dollars or cents) unverified. Sending $2,290.40 would mean rounding money or guessing units |
| Domain fit | It is literally bill pay: payee, payment date, recurring date | A card-style purchase |
| Counterparty | `payee` is free text (vendor name) | `merchant_id`, so it links to a vendor record |
| Reference | Create response has no id → re-list and match `nickname` | Returns `_id` directly |
| Debits balance? | [U] | [U] |

Lintel's rule is that financial math is exact and deterministic (CLAUDE.md §4). Bills keeps the exact cents. Purchases move to v2 only after a day-one spike (§9 step 2) proves what the integer `amount` means.

## 4. Exactly-once payment (Nessie has no idempotency, so Lintel provides it)

The `payments` table is already unique per bill (`savePayment` upserts by `billId`). The flow is split into three steps so a retry can never pay twice.

```
pay({ billId })  — internalAction, convex/payments/nessie.ts
  1. reserve  = runMutation(reserveNessiePayment, { billId })
       - bill.status must be CLEARED and decision.rail non-null, else return "skipped" (no row)
       - if a payment row exists with status SCHEDULED/SENT → return "already" (no call)
       - if a payment row exists with status FAILED → continue only when the call came from Retry (§6)
       - insert payment { provider: "CAPITAL_ONE_NESSIE", status: "SCHEDULED", reference: null,
                          idempotency_key: bill.id, mode: "SANDBOX" }
       - audit: PAYMENT_ROUTER · ROUTE_PAYMENT · INFO · "CAPITAL_ONE_NESSIE SCHEDULED $2,290.40 to PG&E"
  2. pre-check (deterministic, no model)
       - GET /accounts/{NESSIE_ACCOUNT_ID} → balance; if balance < amount → fail("Insufficient sandbox balance: $X < $Y")
       - reconcile: GET /accounts/{id}/bills; if one already has nickname == bill.id → skip to step 4 with its _id
         (covers "the POST went through but the response was lost")
  3. POST /accounts/{NESSIE_ACCOUNT_ID}/bills?key=…
       { "status": "completed",
         "payee": "<vendor display name>",
         "nickname": "<bill.id>",                       // the dedupe key we search on
         "payment_date": "<today, YYYY-MM-DD>",
         "payment_amount": <bill.amount, already rounded to cents> }
       then GET /accounts/{id}/bills and take the _id whose nickname == bill.id (must be exactly one, else fail)
       timeout 10 s per call (AbortController)
  4. commit = runMutation(commitNessiePayment, { billId, reference: _id, status: "SENT" })
       - audit: PAYMENT_ROUTER · ROUTE_PAYMENT · EXECUTE · "CAPITAL_ONE_NESSIE SENT $2,290.40 ref <_id> (sandbox)"
  fail(reason): runMutation(commitNessiePayment, { status: "FAILED", reference: null, error: reason })
       - audit: PAYMENT_ROUTER · ROUTE_PAYMENT · HALT · "CAPITAL_ONE_NESSIE FAILED: <reason>"
```

Rules:

- **A payment failure never changes the bill's status.** The bill stays CLEARED, meaning the decision stands. The payment shows FAILED with the reason, and a person can press Retry. This is the "portal down" stretch from master-spec §3.
- **The amount is `bill.amount`**, which is already rounded to cents by the engine. The action never recomputes it.
- **The reference is whatever Nessie returned.** Never a placeholder (ai-workflow-rules §8). If no `_id` can be found, the payment is FAILED, not SENT.
- `pay` never rejects. Every path ends in SENT, FAILED, skipped, or already.

## 5. Contract changes (additive, need the 👍 in ai-workflow-rules §2)

```ts
// src/types/bill.ts
export type PaymentRail = "UTILITY_PORTAL" | "ACH" | "CHECK" | "X402_USDC";   // unchanged: rail = how policy says to pay

export interface PaymentInstruction {
  rail: PaymentRail;
  mode: "LIVE_TESTNET" | "SANDBOX";                    // + "SANDBOX" (Nessie is a simulator; never call it LIVE)
  status: "SCHEDULED" | "SENT" | "FAILED";
  reference: string | null;
  idempotency_key: string;
  provider?: "X402" | "CAPITAL_ONE_NESSIE";            // + who executed it
  error?: string | null;                               // + failure reason shown in the UI
  sent_at?: IsoTimestamp | null;                       // + when Nessie confirmed
}

export interface PortfolioResponse { flags: { …; nessie_enabled: boolean } }   // + flag
```

The rail stays the policy's answer (`UTILITY_PORTAL` for an enrolled utility, `ACH` for a contractor). `provider` says that Capital One's sandbox executed it. That keeps `decide()` and the golden tests untouched: **the engine does not change at all.**

No new `AuditAction` is needed. `ROUTE_PAYMENT` with `INFO`/`EXECUTE`/`HALT` and the `PAYMENT_ROUTER` actor already exist.

Optional v2: `Vendor.nessie_merchant_id?: string | null`, set when an admin adds a vendor and `LINTEL_NESSIE_ENABLED` is on.

## 6. UI (Piyush lane, `src/components/desk/`)

`PaymentLine` in `Evidence.tsx` today renders "Approved for payment via {rail}" plus a `Testnet` tag for x402. The new states:

| Payment | Card 4 line |
|---|---|
| none, flag off | `Approved for payment via Utility portal` (today) |
| SCHEDULED | `Paying through Capital One…` + spinner, `Sandbox` tag |
| SENT | `Paid through Capital One` · `Sandbox` tag · `Ref 5a1b…0003` (mono, full id in tooltip) · `from Operating ••0002` |
| FAILED | Red: `Capital One payment failed: {error}` + `Retry payment` (secondary button) |

- `Retry payment` calls a new public mutation `retryPayment({ billId })`. It checks: bill CLEARED, payment FAILED. It then appends a `HUMAN_OPERATOR` audit row and schedules `pay` again.
- **Top bar / insight strip (optional):** `Capital One sandbox · Operating ••0002 · $48,210.60`, read from a `getTreasury` action that is cached for 30 s. This is not a total the UI computes. It is Nessie's balance, shown as is.
- **Copy rule:** always say "sandbox". Never "paid $X" without a reference on screen (master-spec §8 "do not say").

## 7. Setup (one time, before the demo)

`scripts/nessie-setup.mjs` (new, run by hand, prints IDs and never writes them to git):

1. `POST /customers` → "Lintel Demo Properties LLC" with an address on Market St, SF.
2. `POST /customers/{id}/accounts` → `{ type: "Checking", nickname: "Operating", rewards: 0, balance: 50000 }` (whether a balance can be set on create is [U]; fall back to step 3).
3. `POST /accounts/{id}/deposits` → fund it if needed.
4. Print `NESSIE_ACCOUNT_ID`, then set it in the Convex dashboard along with `NESSIE_API_KEY` and `LINTEL_NESSIE_ENABLED=true`.

Env: `NESSIE_API_KEY`, `NESSIE_BASE_URL` (default `https://api.nessieisreal.com`), `NESSIE_ACCOUNT_ID`, `LINTEL_NESSIE_ENABLED`.

Devpost / README line (keep it true): *"Cleared bills are paid through Capital One's Nessie banking sandbox. The bill, its amount, and the payee are recorded in a simulated Capital One account and the sandbox reference is stored in the audit log. No real money moves."*

## 8. Risks and open questions

| # | Risk | Plan |
|---|---|---|
| 1 | The deadline is 9:00 AM today | Select the Capital One track on Devpost now. Ship v1 only if the freeze checklist is green; otherwise demo the spec + a recorded sandbox call |
| 2 | Nessie key checks are inconsistent (made-up keys succeed on some routes) | Setup script verifies the key with `GET /accounts/{id}` returning our account, not `[]`; fail closed |
| 3 | `POST /bills` returns no id | Nickname = Lintel bill id, re-list, require exactly one match |
| 4 | Whether a Bill debits the balance | Spike test step 2. If it doesn't, the balance pre-check still runs, and the v2 Purchase path is the one that debits |
| 5 | Integer `amount` on purchases/deposits | Spike test: deposit 100, read the balance, see whether it is 100 or 1.00 |
| 6 | Key in query string | Never log the full URL; redact `key=` in error text before storing it |
| 7 | `boundary.test.ts` allows `fetch` in `convex/payments/` already | Put the action in `convex/payments/nessie.ts`; no test change |
| 8 | Nessie down during judging | Payment FAILED with reason, bill stays CLEARED, Retry works later. That is itself a good demo of the guardrails |

## 9. Build plan (each step has a check)

| # | Step | Owner lane | Verify |
|---|---|---|---|
| 1 | Get the key (GitHub login on nessieisreal.com), run `nessie-setup.mjs` | Pranil | `GET /accounts/{id}` returns the Operating account |
| 2 | Spike: create a Bill with `payment_amount: 12.34`, re-list it, read the balance before and after; deposit 100 and read the balance | Pranil | Answers risks 4 and 5 in this file |
| 3 | Contract PR: `mode: "SANDBOX"`, `provider`, `error`, `sent_at`, `nessie_enabled` flag | Anmol (frozen file, 👍 from all) | `npm run typecheck` green |
| 4 | `src/integrations/nessie/client.ts` (typed fetch wrapper, key redaction) + `convex/payments/nessie.ts` (`pay`, `reserveNessiePayment`, `commitNessiePayment`) | Pranil | Unit tests with a mocked `fetch`: SENT, FAILED-balance, FAILED-timeout, reconcile-existing, second call → "already" |
| 5 | Wire trigger A in `processBill` and trigger B in `humanResume` approve; `retryPayment` mutation | Anmol | `tests/pipeline.test.ts`: cleared bill → one SCHEDULED then SENT row; BLOCKED/HELD → no row; approve → scheduled once; double approve → still one payment |
| 6 | `PaymentLine` states, Retry button, optional treasury strip | Piyush | Run BILL-101 (auto) and BILL-103 approve (human) in the browser; both show `Paid through Capital One · Sandbox · Ref …`; the ref matches `GET /bills/{id}` |
| 7 | README + Devpost paragraph (§7), select the track | Pranil | Read it aloud: every claim is on screen |

Demo beat (fits master-spec §8 at 0:05–0:25): *"PG&E cleared, so Lintel paid it through Capital One's sandbox. Here's the reference, and it's in the audit chain. The EBMUD spike won't pay until VP Finance approves."* Approve EBMUD, and a second Capital One reference appears.

Estimated effort: steps 4–6 ≈ 3–4 focused hours.

## Checklist (update only this list)

- [ ] Track selected on Devpost before 9:00 AM
- [ ] Nessie key + treasury account set up
- [ ] Spike answers: Bill debits? integer units?
- [ ] Contract change approved and merged
- [ ] `nessie` client + `pay` action + unit tests
- [ ] Triggers wired (auto-clear, human approve) + retry
- [ ] `PaymentLine` states in the UI
- [ ] README / Devpost copy
