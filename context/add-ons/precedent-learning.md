# Add-on: Precedent learning

**Not on the Sunday demo path.** Do not build this before the Devpost freeze (Sunday Oct 25, 9:00 AM PDT). Opening shot, judge chip, and `POLICY` numbers stay as master-spec §2, §6, and §8 lock them.

This file is the architecture update for the add-on. `context/ai-workflow-rules.md` §2 still applies when the code lands: `src/types/bill.ts` is frozen, so the contract edits below go in one small PR with a 👍 from the other two owners before any lane codes against them. Until that PR, do not invent a local type.

Hyphenate's coffee-chain slide is the picture: the desk learns from history, runs the next one alone, escalates when there is no precedent (low confidence, hold the payout), and saves the human's answer so the same question is not asked again. Their published line is the same rule: when confident, act; when not, escalate and remember the answer. Workpapers become policies. The system proposes. A person approves.

Lintel already does lap 1 for addresses (master-spec decision 11). This add-on is the rest of that loop. It is a precedent compiler over the audit log. It is not model memory, and it is not a change to `SPIKE_THRESHOLD_PCT`.

**The model reads history and may draft a sentence. Code decides whether a bill is paid. Only a confirmed human action inserts a row that `matchBill()` or `decide()` will read.**

---

## 1. Goal

After the freeze, a human's confirmed answer becomes a row on `LedgerSnapshot`. The next bill matches or clears from that row, and the new audit event names the precedent id. That event is part of the corpus the compiler reads for the proposal after that. That is the recursion.

Three precedent types, in this order:

| # | Type | Status | What one human confirmation stores | What the next bill does |
|---|---|---|---|---|
| 1 | Address alias | **Shipped.** Do not rebuild it. | `aliases` row + `ALIAS_STORED` | `matchBill` method `HUMAN_ALIAS`, confidence 1.00 |
| 2 | Vendor alias | New | `normalizeVendorName(raw)` → an **existing** `vendor_id`, source bill, actor | Existing vendor match `ALIAS`. No new vendor. |
| 3 | Scoped spike exception | New | `vendor_id`, `property_id`, reason, percent cap, optional month window, taught-by role, source audit event ids | `decide` / `checkSpike` allows that spike up to the cap, then the why-sentence cites the precedent |

Address and vendor keys are exact, so one confirmed human action writes the row. A spike exception is a band, so two approvals inside that band only **propose**. The operator confirms the sentence before the row exists.

## 2. Non-goals

- Do not respecify or rewrite the address-alias path. Section 3 is the pattern. Copy it. Do not move it.
- Do not remember approve or reject as an address alias or a vendor alias. Today only assign writes `aliases`. Keep it that way.
- Do not fuzzy-match a vendor name. Do not auto-create a vendor. Do not append onto `vendors.aliases`. That array is seed data. `wipeLive` does not reset it, so a write there would survive replay and can change the opening batch.
- Do not edit `SPIKE_THRESHOLD_PCT` or any other `POLICY` number. A spike exception is a row `decide()` reads. The policy card stays read-only.
- No learned clear for `EXACT_DUPLICATE`, `FUZZY_DUPLICATE`, `LINE_SUM_MISMATCH`, or `CRS_FLAGGED`. Blocked stays blocked. `HUMAN_REJECT` stores nothing.
- Do not put this on the opening replay, the judge chip, `POLICY_TEXT`, or the five-second opening.
- Do not call a model from `src/engine/`, `src/match/`, or any mutation. `matchBill` and `decide` stay pure over `LedgerSnapshot`.

## 3. Already shipped: address alias (the pattern)

Do not implement this again. The later types copy its shape.

- Human assign of a HELD bill whose reasons include `NEEDS_PROPERTY_MATCH` runs in `convex/bills/resume.ts` (`kind: "assign"`).
- The same mutation writes `HUMAN_ASSIGN_PROPERTY`, inserts `aliases` when `match.address_key` is set, and writes `ALIAS_STORED`. `appendEvents` hashes those drafts with the re-decision (`prev_hash`, seq, same transaction as the bill write).
- The alias row is `AddressAlias`: `address_key` (`normalizeAddressKey`, unit included), `raw_address`, `property_id`, `created_at`, `created_by: "HUMAN_OPERATOR"`, `source_bill_id`.
- `matchBill` (`src/match/matchBill.ts`) checks `ledger.aliases` after exact account and before address scoring. Hit → method `HUMAN_ALIAS`, confidence 1.00.
- Next bill: BILL-104B clears with no human touch (master-spec §6). Golden tests for that path stay green.
- `convex/bills/reset.ts` `wipe()` deletes `aliases` with the other live tables. Seed history stays. `replayOpening` and `resetDemo` both use that wipe.

Vendor alias is this pattern with a vendor id instead of a property id, stored on the new precedents table (not on `vendors`). Spike exception adds a propose step in front of the insert.

## 4. Invariants

1. **AI proposes, deterministic code disposes.** A model may phrase the spike card. It does not choose the vendor, the property, the reason, the cap, the window, or the status.
2. **A row exists only after a confirmed human action.** Address: the assign click (shipped). Vendor: the assign-vendor click. Spike: the confirm click. Two spike approvals do not insert the row by themselves.
3. **`matchBill` and `decide` never import a model SDK, `src/agents`, `convex`, or `fetch`.** They read `ledger.precedents` the way `matchBill` already reads `ledger.aliases`.
4. **Blocked has no learned-clear path.** Priority group 0 in `src/engine/decide.ts` is unchanged. A precedent must not remove `EXACT_DUPLICATE`, `FUZZY_DUPLICATE`, `LINE_SUM_MISMATCH`, or `CRS_FLAGGED`, and must not write `PRECEDENT_APPLIED` when the status is `BLOCKED`.
5. **Replay stays the opening shot.** `replayOpening` / `resetDemo` wipe learned precedent rows and proposals together with `aliases`. With an empty precedent table, totals stay **Blocked $680.00 · Held $6,100.00 · Cleared $2,290.40**.
6. **Audit rows are insert-only.** Same mutation as the state change. `appendEvents` sets `prev_hash`. Do not update or delete an audit row to attach a model sentence.
7. **`NO_BASELINE` is not a spike exception.** Fewer than `POLICY.MIN_BASELINE_BILLS` (2) prior bills still holds. An exception does not invent a baseline.

## 5. Data contract

Additive only. Post in `#collaborative-context` and get a 👍 before editing `src/types/bill.ts` or `convex/schema.ts`. Every existing `LedgerSnapshot` literal gains `precedents: []` in that same PR so golden tests still construct.

### 5.1 Types (`src/types/bill.ts`)

```ts
export type PrecedentKind = "VENDOR_ALIAS" | "SPIKE_EXCEPTION";

export interface Precedent {
  id: string; // "PREC-…", minted in the mutation, never by the model
  kind: PrecedentKind;
  /** VENDOR_ALIAS: normalizeVendorName(raw). SPIKE_EXCEPTION: null. */
  normalized_vendor_name: string | null;
  /** VENDOR_ALIAS: the raw string the human saw. */
  raw_vendor_name: string | null;
  vendor_id: VendorId;
  /** SPIKE_EXCEPTION only. Vendor alias is portfolio-wide. */
  property_id: PropertyId | null;
  /** SPIKE_EXCEPTION only. AMOUNT_SPIKE or USAGE_SPIKE. */
  reason_code: "AMOUNT_SPIKE" | "USAGE_SPIKE" | null;
  /** SPIKE_EXCEPTION: max approved variance in the band. Unrounded. Null for vendor alias. */
  percent_cap: number | null;
  /**
   * SPIKE_EXCEPTION: inclusive month numbers 1–12, start <= end, no wrap.
   * Null = every month. Vendor alias: null.
   */
  month_window: { start_month: number; end_month: number } | null;
  taught_by: ApproverRole;
  source_audit_event_ids: string[];
  source_bill_id: BillId;
  created_at: IsoTimestamp;
  created_by: "HUMAN_OPERATOR";
  active: boolean;
}

export interface PrecedentProposal {
  id: string; // "PROP-…"
  status: "PROPOSED" | "CONFIRMED";
  vendor_id: VendorId;
  property_id: PropertyId;
  reason_code: "AMOUNT_SPIKE" | "USAGE_SPIKE";
  percent_cap: number;
  /** max(variance) - min(variance) of the two facts. Display only. */
  band_spread: number;
  source_audit_event_ids: string[];
  source_bill_ids: BillId[];
  /** PRECEDENT_APPLIED ids the card may quote. They do not count as approvals. */
  cited_application_ids: string[];
  /** Deterministic template. This is what confirm stores. */
  template: string;
  /** Model sentence. Null until the phrase action returns, and null is fine. */
  phrase: string | null;
  phrase_model: string | null;
  /** Bill that received the second HUMAN_APPROVE. The card renders here. */
  bill_id: BillId;
  created_at: IsoTimestamp;
}
```

`LedgerSnapshot` gains `precedents: Precedent[]` beside `aliases`.

`AuditAction` gains `"PRECEDENT_PROPOSED" | "PRECEDENT_CONFIRMED" | "PRECEDENT_APPLIED"`. No new `Actor`. Proposed and applied use `DETERMINISTIC_RULE`. Confirmed uses `HUMAN_OPERATOR`.

`HumanKind` (and the `humanResume` arg union) gains `"assign-vendor" | "confirm-precedent"`.

`BillView` gains an optional `precedent_proposal: PrecedentProposal | null`. Absent or null means the UI draws nothing. Do not put the proposal inside `decision.why`.

`SpikeData` / the SPIKE `CheckResult.data` bag gains these keys when the add-on is on (all allowed by today's `data` value union):

| Key | Type | When |
|---|---|---|
| `precedent_id` | string | An active exception covered this reason |
| `precedent_taught_by` | string | That row's `taught_by` |
| `precedent_confidence` | number | `n / (n + 1)` for this vendor + property + reason. Also set on a hold, when no row covered it |
| `precedent_label` | string | `"no precedent"` when `n = 0`, else `""` |

The MATCH check uses the same `precedent_confidence` and `precedent_label` keys for `UNKNOWN_VENDOR` and `NEEDS_PROPERTY_MATCH`. `n` for a vendor hold is the count of active `VENDOR_ALIAS` rows for that normalized name (0 on the bill that is still unknown). `n` for a property hold is the count of `aliases` with that `address_key` (0 until assign). Display only. It does not change `matchBill`.

### 5.2 Convex tables

Anmol, `convex/schema.ts`. New tables, not columns on `vendors`:

- `precedents` — one row per `Precedent`. Index `by_precedentId`.
- `precedentProposals` — one row per `PrecedentProposal`. Index `by_proposalId` and `by_billId`.

`convex/lib/records.ts` `loadLedger` maps `precedents` onto the snapshot. Proposals are not an engine input. `getBill` attaches `precedent_proposal` for that bill id when status is `PROPOSED`.

`wipe()` in `convex/bills/reset.ts` adds `"precedents"` and `"precedentProposals"` to the table list, next to `"aliases"`. It still does not delete `properties`, `vendors`, `vendorAccounts`, or `history`.

## 6. Compiler rules

The compiler is a pure function, `compileSpikeProposal`, in `src/engine/precedent.ts` (Anmol). No IO, no model import. The mutation loads the facts and calls it. It returns a proposal predicate or null.

It reads **audit events and the bill rows those events point at**. It does not read a model transcript. The actions it reads are `HUMAN_ASSIGN_PROPERTY`, `ALIAS_STORED`, and `HUMAN_APPROVE`, plus `PRECEDENT_APPLIED` as citation only.

### 6.1 Address

`ALIAS_STORED` is already the insert. The compiler must not insert a second alias for the same key. It may see the event. It does not write.

### 6.2 Vendor alias — one exact human action

New `humanResume` kind `assign-vendor`.

- Allowed only when `humanRefusal` would allow it: status `HELD`, reasons include `UNKNOWN_VENDOR`, status is not `BLOCKED`.
- Args: `vendorId` of a vendor already on the ledger. Unknown id → `ConvexError`. Missing id → `ConvexError`.
- `normalized = normalizeVendorName(extracted.vendor_name.value)`. Empty → `ConvexError`.
- Refuse if that normalized string already equals a seed vendor name, a seed `vendor.aliases` entry, or an active `VENDOR_ALIAS` precedent (any vendor). No second meaning for one string.
- Same mutation: insert the active `VENDOR_ALIAS` precedent (`property_id`, `reason_code`, `percent_cap`, and `month_window` are null; `taught_by: "OPERATOR"`). `appendEvents` ids are `${bill_id}:${seq}` and the next seq is known before the insert, so `source_audit_event_ids` is that upcoming `PRECEDENT_CONFIRMED` id. Do not leave the row without it.
- Audit `PRECEDENT_CONFIRMED`, actor `HUMAN_OPERATOR`, decision `INFO`, rationale = the normalized name and the vendor id. No `PRECEDENT_PROPOSED` for this kind.
- Then re-run `matchBill` with a ledger that already contains the new precedent (exclude this bill from `ledger.bills`, same as assign), then `decide`, then the new `CHECK` and `DECISION` drafts. `resolved_by = "HUMAN"`. Payment only if the new status is `CLEARED`. This is the assign path in `resume.ts`, with a vendor instead of a property.

`findVendorByName` in `src/match/matchBill.ts` already returns `via: "ALIAS"` for seed aliases (lines 46–49). After that loop, if still null, scan `ledger.precedents` for `kind === "VENDOR_ALIAS"`, `active`, and `normalized_vendor_name === key`. Return `{ id: vendor_id, via: "ALIAS" }`. First active row wins. Do not create a vendor. Property order is unchanged: exact account, then `HUMAN_ALIAS`, then address score.

### 6.3 Spike exception — two approvals propose, a person confirms

A **fact** is one spike reason on one `HUMAN_APPROVE`:

- The bill was HELD, the approve was legal (`human.ts`: no priority-2 reason, not `BLOCKED`).
- `decision.reasons` at approve time included `AMOUNT_SPIKE` or `USAGE_SPIKE`. One bill can emit two facts.
- `variance_pct` is the number already on the SPIKE check: `amount_variance_pct` or `usage_variance_pct`. If that number is missing, skip the fact. Do not parse it out of the rationale.
- `NO_BASELINE` is not a fact. `HUMAN_REJECT` is not a fact.

Group key: `(vendor_id, property_id, reason_code)`.

**Stable band.** Read `POLICY.SPIKE_THRESHOLD_PCT`. Do not add a constant and do not change 25.

- At least two facts in the group.
- Every fact's `variance_pct` is greater than `POLICY.SPIKE_THRESHOLD_PCT` (they were real spike holds).
- `max(variance_pct) - min(variance_pct) <= POLICY.SPIKE_THRESHOLD_PCT` percentage points. A +30 and a +50 are inside the band (spread 20). A +30 and BILL-103's +281 are not. A leak approval must not teach a wide cap.
- Proposed `percent_cap` = `max(variance_pct)`, stored unrounded. Display with one decimal. `decide` compares unrounded `variance <= percent_cap`.
- `taught_by` on the proposal's template is the stricter of the two facts' `required_approver` values: `VP_FINANCE` over `PROPERTY_MANAGER` over `OPERATOR`.
- Do not propose if an active exception for that key already has `percent_cap` greater than or equal to this max, or if a `PROPOSED` row already exists for that key.
- A wider band later (two new facts above the current cap, still inside the spread rule) may propose a **replacement**. It does not update the old row in place.

`PRECEDENT_APPLIED` events are not facts. They do not increment the two-approval count and they do not raise the cap. Copy their ids onto `cited_application_ids` when `data.precedent_id` is in the group, so the card can say the exception already cleared a later bill. An auto-clear must not train the next exception.

On the second approval's mutation, after the `HUMAN_APPROVE` draft, if `compileSpikeProposal` returns a predicate:

- Insert `precedentProposals` with `status: "PROPOSED"`, `phrase: null`.
- Append `PRECEDENT_PROPOSED` in that same `appendEvents` call. Actor `DETERMINISTIC_RULE`, decision `INFO`. Rationale is the template below, not the model. `data` is the predicate fields (vendor, property, reason, cap, source event ids).
- Schedule the phrase action (section 6.4). Scheduling failure leaves `phrase` null. The card still works.

Template (deterministic, this is the stored sentence):

`Allow {amount spikes|usage spikes} up to {cap, one decimal}% for {vendor name} at {property name}, taught by {VP Finance|Property Manager|operator}. Threshold stays +25%.`

Use `POLICY.SPIKE_THRESHOLD_PCT` in the template string. Do not type a second 25.

**Confirm** is `humanResume` kind `confirm-precedent`, args `proposalId`, optional `monthStart` / `monthEnd`, optional `note`.

- Proposal must be `PROPOSED`. Else `ConvexError`.
- `BLOCKED` bills still refuse every kind, including this one. The proposal hangs off the bill that was approved, which is `CLEARED`. Confirm does not change that bill's status, payment, or `resolved_by`.
- Month window: both ends integers 1–12 and `monthStart <= monthEnd`, or both omitted. Anything else → `ConvexError`. Omitted → `month_window: null`.
- Same mutation: insert the active `SPIKE_EXCEPTION` (id `PREC-…`, `taught_by` from the stricter role above, `source_audit_event_ids` = the two `HUMAN_APPROVE` ids). If another active row exists for the same key, set it `active: false` in this mutation. Do not delete it.
- Append `PRECEDENT_CONFIRMED`, actor `HUMAN_OPERATOR`, decision `INFO`, rationale = the template (the note may be appended after it). `data.precedent_id` is the new id. `data.phrase` may copy the model sentence as evidence. The rationale stays the template.
- Mark the proposal `CONFIRMED`.

There is no dismiss kind. Ignoring the card leaves the proposal `PROPOSED` and writes nothing `decide()` reads.

### 6.4 Phrase action (Pranil, optional)

`src/agents/precedent/phrasePrecedent.ts`, called from a Convex **action** (HTTP allowed). Anmol schedules it from the approve mutation the way `investigate` is scheduled. The action writes `phrase` and `phrase_model` on the proposal row only.

- Input is the predicate and the two deterministic rationales. Not the PDF.
- Zod-parse `{ sentence: string }`. Drop every other key.
- If the call fails, times out, or the sentence is empty, leave `phrase` null.
- The sentence must not be parsed for a cap, a vendor, or a reason. Those fields on the row are the ones the compiler stored. If you need a guard, discard the phrase when it contains a percent sign whose number differs from `percent_cap` rounded to one decimal. The template still shows.

This action is the only new model call in the add-on. It must not set `BillStatus`.

## 7. `decide` / `matchBill` insertion points

### 7.1 `checkSpike` (`src/engine/checks.ts`)

Leave the function's early returns alone, including `NO_BASELINE` (the `baseline.length < POLICY.MIN_BASELINE_BILLS` return). Precedents are not consulted on that branch.

After the two `reasons.push` lines (`USAGE_SPIKE` / `AMOUNT_SPIKE`) and before the HALT return:

- For each pushed reason, look up the active `SPIKE_EXCEPTION` with the same `vendor_id`, `property_id`, and `reason_code`. At most one active row per key (section 6.3).
- It applies only when `month_window` is null or the bill's due-date month is inside it. Month is the `MM` of the ISO `due_date` string. No `Date.now()`.
- It applies only when `variance_pct <= percent_cap`. Over the cap, the reason stays and the generic hold stands.
- When it applies, remove that reason. Set `precedent_id` and `precedent_taught_by` on `data`.
- Always set `precedent_confidence = n / (n + 1)` and `precedent_label` for each spike reason that was computed (hold or covered). `n` is the count of active exceptions for that key (0 or 1). When both reasons fired, the card uses the smaller `n`.
- If no spike reasons remain, outcome is `PASS` and the rationale still includes the variance numbers, `threshold +${POLICY.SPIKE_THRESHOLD_PCT}%`, and `precedent {id}`.

Do not strip reasons later in `decide()`. The `CHECK` audit row and the status have to agree. `PRIORITY` in `decide.ts` stays as it is, including group 0.

### 7.2 `explain` (`src/engine/explain.ts`)

Blocked branches stay first (`EXACT_DUPLICATE`, `FUZZY_DUPLICATE`, `LINE_SUM_MISMATCH`, `CRS_FLAGGED`). They do not mention a precedent.

On the cleared utility return (reasons empty, rail `UTILITY_PORTAL`): if `spike.data.precedent_id` is a non-empty string, the sentence keeps the variance numbers and adds `Inside precedent {id}, taught by {role}. Threshold stays +{SPIKE_THRESHOLD_PCT}%.` Role words match `heldFor`: VP Finance, Property Manager, operator.

If a spike reason remains (cap too low, window miss), the existing hold sentence stays. The escalate card carries the confidence. The why-sentence does not become a model sentence.

### 7.3 `matchBill`

Section 6.2. Vendor only. Do not touch the `HUMAN_ALIAS` block.

### 7.4 `PRECEDENT_APPLIED`

In the `commitPolicy` mutation (master-spec §4 step 5, `convex/engine/`), when the SPIKE check's `data.precedent_id` is set **and** the decision status is not `BLOCKED`, append `PRECEDENT_APPLIED` in that same `appendEvents` call, after the SPIKE `CHECK` draft and before `DECISION`.

- Actor `DETERMINISTIC_RULE`, decision `PASS`.
- Rationale names the precedent id and `precedent_taught_by`.
- `data`: `precedent_id`, `vendor_id`, `property_id`, `reason_code`, `variance_pct`.

That row is the corpus citation for the next proposal (section 6.3). If status is `BLOCKED`, do not append it, even if a spike reason was covered. The blocked why-sentence is the one that ships.

## 8. Where it sits after the freeze

Do not add these branches to the Sunday `processBill` / `humanResume` path. When someone builds it:

| Place | What changes |
|---|---|
| `processBill` step 3 `commitMatch` | `matchBill` may return vendor `ALIAS` from `ledger.precedents`. No new step. |
| `processBill` step 5 `commitPolicy` | `decide` → `checkSpike` may pass on an exception. Same mutation appends `PRECEDENT_APPLIED` when section 7.4 says so. |
| `humanResume` `assign` | Unchanged. Address alias stays inline in `resume.ts`. |
| `humanResume` `approve` | Unchanged clear. Then, same mutation, maybe insert a proposal + `PRECEDENT_PROPOSED`, then schedule `phrasePrecedent`. |
| `humanResume` `reject` / `send-draft` | Unchanged. Reject remembers nothing. |
| `humanResume` `assign-vendor` | New. Section 6.2. |
| `humanResume` `confirm-precedent` | New. Section 6.3. Does not pay the bill. |
| `replayOpening` / `resetDemo` | `wipe()` also clears `precedents` and `precedentProposals`. |

`humanRefusal`: `assign-vendor` only for HELD + `UNKNOWN_VENDOR`. `confirm-precedent` only when that bill has a `PROPOSED` proposal. `BLOCKED` still returns `"Blocked bills have no pay or approve control."` for every kind.

## 9. Audit events

| Action | When | Actor | Decision | Same mutation as |
|---|---|---|---|---|
| `ALIAS_STORED` | Address assign (shipped) | `HUMAN_OPERATOR` | `INFO` | assign + re-decision |
| `PRECEDENT_CONFIRMED` | Vendor assign-vendor, or spike confirm | `HUMAN_OPERATOR` | `INFO` | the precedent insert |
| `PRECEDENT_PROPOSED` | Spike compiler returned a predicate | `DETERMINISTIC_RULE` | `INFO` | the `HUMAN_APPROVE` that completed the pair |
| `PRECEDENT_APPLIED` | Next bill's spike check used the row, and status is not `BLOCKED` | `DETERMINISTIC_RULE` | `PASS` | `commitPolicy` |

Hash rule is the one in `src/audit/append.ts`: `hashEvent(prev_hash, e)`, genesis 64 zeros, id `${bill_id}:${seq}`. The model phrase is not a new audit event and is not patched onto an old one.

`data.precedent_id` on `PRECEDENT_APPLIED` is how the next compiler pass finds the citation. Do not keep a second memory store.

## 10. UI (Piyush)

Follow `context/ui-context.md`. The UI renders numbers it is given. It does not compute the confidence, the cap, or the why-sentence. Policy drawer stays `Read-only at this desk.` Do not append learned sentences to `policy_text`.

**Escalate card.** On a HELD bill whose reasons include `NEEDS_PROPERTY_MATCH`, `UNKNOWN_VENDOR`, `AMOUNT_SPIKE`, `USAGE_SPIKE`, or `NO_BASELINE`, render a card between the why-sentence and the guardrail table.

- Route line: `Routed to {required_approver}.` Use the same role words as the why-sentence.
- Confidence line: format `precedent_confidence` as a percent with no decimal (`0.00` → `0%`, `0.50` → `50%`). When `precedent_label` is `no precedent`, the line is `{pct} · no precedent`.
- Hold line: `Holds this payout.` Status is still HELD. No payment control is added.
- `n = 0` is that empty state. The coffee-chain slide prints it as `confidence 41% · no precedent`. The 41 is Hyphenate's picture of the empty state, not a Lintel constant. Do not hardcode `0.41`. The number is `n / (n + 1)`. Zero peers is `0% · no precedent`.
- `NO_BASELINE` uses the same empty card. It is the cousin of this signal (fewer than two history bills vs. no taught exception). Do not treat them as one gate. A spike exception must not clear `NO_BASELINE`.

**Confirm card.** When `precedent_proposal.status` is `PROPOSED`, show it on that bill even if the bill is already `CLEARED` (the second approval cleared it). This is not an Approve button and it does not pay.

- Title the card with the template. If `phrase` is non-null, show it under the template in secondary text. Confirm stores the template's predicate either way.
- Show vendor, property, reason, percent cap, the two source bill ids, and any cited application ids.
- Optional month window: two month inputs, empty by default.
- Button: `Confirm policy`. Calls `humanResume` `confirm-precedent`.
- `BLOCKED`: no escalate-to-clear, no confirm, no approve. Existing copy: `Blocked bills cannot be paid.`

Actor chips: `PRECEDENT_PROPOSED` and `PRECEDENT_APPLIED` are `CODE` (slate). `PRECEDENT_CONFIRMED` is `HUMAN` (blue). No new hue.

## 11. Test plan

New spike fixture is **not** added to `OPENING_BATCH`, `demo-inputs` opening rows, or the judge chips.

| Test | Expect |
|---|---|
| Golden §6 rows, `precedents: []` | Unchanged, including BILL-103 HELD on `USAGE_SPIKE` + `AMOUNT_SPIKE`, BILL-104 / BILL-104B alias path, CHIP-FUZZY-DUP BLOCKED. |
| `replayOpening` twice, and replay after a precedent row was inserted | Wipe removes precedents and proposals. Totals `680.00` / `6100.00` / `2290.40`. |
| Vendor: unknown name HELD `UNKNOWN_VENDOR`. `assign-vendor` to an existing id. Next bill with that exact normalized name | `vendor_match: "ALIAS"`, no new `vendors` row, `vendors.aliases` unchanged. A different unknown name still holds. |
| Spike fixture, not in the opening: two `HUMAN_APPROVE` facts at +30% and +40% for the same utility vendor + property + `AMOUNT_SPIKE`, then confirm. Next utility bill at +35% with a real baseline | `CLEARED`. Why-sentence contains the `PREC-` id and the taught-by role, and still says threshold +25%. SPIKE check `PASS` with `precedent_id`. Audit has `PRECEDENT_APPLIED`. |
| Same fixture, next bill at +50% (over the cap) | `HELD` `AMOUNT_SPIKE`. No `PRECEDENT_APPLIED`. |
| Same fixture, next bill with only one prior (or the `NO_BASELINE` path) | `HELD` `NO_BASELINE`. Exception does not apply. |
| Spike fixture plus an exact or fuzzy duplicate (human previously approved some other bill, or a precedent row is on the ledger) | `BLOCKED`. No pay control. No `PRECEDENT_APPLIED`. Why-sentence is the duplicate sentence. |
| `LINE_SUM_MISMATCH` or `CRS_FLAGGED` with a spike exception that would have covered the amount | `BLOCKED`. Group 0 wins. |
| Two approvals at +30% and +281% | No proposal. |
| One approval | No proposal. |
| Confirm without a `PROPOSED` row, or `assign-vendor` to an unknown vendor id | `ConvexError`. |
| `tests/boundary.test.ts` | `src/engine/**` and `src/match/**` still do not import a model SDK. The phrase action is the only new file that may. |

## 12. Do not touch

- `src/seed/policy.ts` numbers, `POLICY_TEXT`, `SEATS_LINE`, `REAL_VS_SIMULATED`.
- Opening totals: Blocked **$680.00**, Held **$6,100.00**, Cleared **$2,290.40**.
- `decide` status priority for `BLOCKED` (`PRIORITY[0]`: `EXACT_DUPLICATE`, `FUZZY_DUPLICATE`, `LINE_SUM_MISMATCH`, `CRS_FLAGGED`).
- Master-spec §6 expected outcomes, the judge chip `RW-10021` / `$686`, and decision 11's address-alias outcome.
- `src/seed/portfolio.ts` vendor list and seed `aliases` arrays.
- The address insert in `convex/bills/resume.ts` except to leave it working. Do not fold it into the spike compiler.
- Lane checklists in `context/lanes/`. This add-on is not a Sunday checklist item.

## 13. Implementer checklist

All unchecked. Owners match `context/code-standards.md` §2. Do not start until the frozen-file PR in section 5 has merged.

- [ ] Anmol: contract PR — `Precedent`, `PrecedentProposal`, `LedgerSnapshot.precedents`, three `AuditAction`s, two `HumanKind`s, optional `BillView.precedent_proposal`, SPIKE/MATCH data keys. Existing snapshots pass `precedents: []`.
- [ ] Anmol: `convex/schema.ts` tables `precedents` and `precedentProposals`. `loadLedger` maps them. `wipe()` deletes both with `aliases`.
- [ ] Anmol: `src/engine/precedent.ts` `compileSpikeProposal` + unit tests (band, leak spread, one approval, citations do not count).
- [ ] Anmol: `checkSpike` applies an active exception before the generic hold; `NO_BASELINE` unchanged; `explain` cites id and taught-by; `PRIORITY[0]` untouched.
- [ ] Anmol: `commitPolicy` appends `PRECEDENT_APPLIED` only when section 7.4 says so, same `appendEvents` call.
- [ ] Anmol: `humanResume` `assign-vendor` and `confirm-precedent`. Approve may insert `PRECEDENT_PROPOSED` in the approve mutation. Reject writes no precedent.
- [ ] Anmol: tests in section 11, including replay totals and "duplicate still blocks".
- [ ] Pranil: `findVendorByName` also reads active `VENDOR_ALIAS` precedents and returns `ALIAS`. No fuzzy vendor, no vendor insert. `tests/match/` covers the next-bill hit and a miss.
- [ ] Pranil: `phrasePrecedent` action. Predicate in, one sentence or null out. Not imported by the engine. Skip is allowed; the template still confirms.
- [ ] Piyush: escalate card (confidence from the API, `0% · no precedent` at zero peers, hold the payout). Confirm card on the proposal bill. `BLOCKED` gets neither. Policy drawer stays read-only.
