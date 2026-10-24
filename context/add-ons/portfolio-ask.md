# Add-on: Portfolio ask

Spec only. Implement after the freeze checklist in `context/master-spec.md` §9 is green. This is not in the two-minute script (§8). No new route: `src/app/page.tsx` still renders `<CommandCenter />` only.

The model reads a question into a typed query. Code resolves the property, sums paid history, and writes both the sentence and the bars. A person sees the answer in a drawer. The tool cannot pay, approve, reject, or assign.

Cross-links: master-spec §4 (Eraser diagram, Convex-only backend), §8, §9; `context/ui-context.md` (one screen, drawers, plain-div bars); `context/code-standards.md` §2–§4; lane specs under `context/lanes/`. There is no shared add-on index. Do not edit those files or another lane's checklist for this work. Check off only the list at the bottom of this file.

---

## 1. Goal

An operator types a question on the command center. One Convex action calls Claude through the installed `@anthropic-ai/sdk` with `tool_choice` forced to a single tool, `ask_portfolio`. Zod accepts a query and rejects amount fields. Pure functions resolve one property, expand the period from demo clock `2026-10-25`, aggregate `HistoricalBill` rows, and fill a template sentence plus an optional bar series. The drawer renders that payload. An append-only ask log records what was shown.

Stack already in `package.json`: Next 16, Convex, `@anthropic-ai/sdk`, zod. Do not add a chart library, the Vercel AI SDK, or any other dependency.

## 2. Non-goals

Voice, speech synthesis, a hosted realtime voice agent, and the Web Speech API.

Also out: multi-property comparison, forecasting, free-form chart types, GL answers (no GL field on the schema, the matcher, or the seed), grouping by `billing_period_start` / `billing_period_end`, adding kWh to CCF, a second model pass that rewrites dollars, and any payment, approve, reject, or assign tool. `ask_portfolio` cannot call `processBill`, `humanResume`, or settlement. It cannot see SQL or run code.

## 3. User-visible behavior

Header button `Ask`, after Policy, Real vs Simulated, and Judge Live Test. No keyboard shortcut (`J` stays on Judge Live Test). The drawer slides over the detail pane from the right and does not cover the blotter or the totals (`context/ui-context.md` §1). It does not auto-open on load or on replay.

Contents: one text field, Send, then either the template sentence plus bars, or a refusal sentence. Refusal shows candidate names when the name is ambiguous, and shows no total and no bars. Convex errors render inline. Never `alert()`. The drawer does not compute money; it renders the action payload.

The client sends `{ question: string, selected_bill_id: string | null }`. `selected_bill_id` is the blotter selection, not a model field. The browser never holds the model key. The key stays in the Convex environment, same as `extractBill`.

### Demo prompts

Clock is `2026-10-25`, so last month is September 2026 and this month is October 2026.

| Prompt | Selected bill | Query the tool must emit | What the drawer shows |
|---|---|---|---|
| What was last month's Bayview total? | ignored | `property_query` "Bayview" or "Bayview Commons", `period` `last_month`, `metric` `amount_usd`, `group_by` `none`, `chart` `none` | Bayview Commons, September 2026, paid history by due date: $3,460.00 (2 bills). No bars. |
| For this property, monthly bill amounts. | EBMUD row, `EXACT_ACCOUNT`, confidence `1.00`, `PROP-003` | `property_query` `selected`, `period` `trailing_3`, `metric` `amount_usd`, `group_by` `month`, `chart` `bar` | Shattuck Student Living bars Aug 2026 $4,120.00, Sep 2026 $4,210.00, Oct 2026 $4,210.00, plus the template sentence for that total. |

The tool description steers those two mappings. Code does not parse the utterance. If the model emits a different legal query, code answers that query. It does not "fix" the period.

## 4. Tool contract

One tool, name `ask_portfolio`. `tool_choice` is `{ type: "tool", name: "ask_portfolio" }`. The tools array has no other tool.

Tool description, use verbatim:

```
Read a portfolio question into a query. Do not calculate amounts.
property_query: the property name the operator said, or "selected" when they said "this property".
period: "last_month" for last month; "this_month" for this month; "trailing_3" for a monthly series with no month named; or YYYY-MM when they name a month.
metric: "amount_usd" only.
group_by: "none" for a single total; "month" for a monthly series; "utility_type" when they ask for a split by utility.
chart: "bar" when they ask for a chart or a monthly series; "none" for a total only.
```

Input fields:

| Field | Allowlist | Who fills it |
|---|---|---|
| `property_query` | Free text, or the token `selected` | Model |
| `period` | `last_month`, `this_month`, `trailing_3`, or `YYYY-MM` | Model. Code expands it. |
| `metric` | `amount_usd` only | Model |
| `group_by` | `none`, `month`, `utility_type` | Model |
| `chart` | `none`, `bar` | Model |

`categories`, `data`, and `total` are code-only. Zod is a strict object: those keys, plus `amount`, `amounts`, `dollars`, `series`, `usage`, `kwh`, and `ccf`, fail the parse. So does `metric` other than `amount_usd`, `chart: "line"`, and any unknown key. `period` matches the three tokens or `/^\d{4}-(0[1-9]|1[0-2])$/`.

On a zod failure or a missing tool call, the action returns a refusal, sentence `That question is not a portfolio total.`, total null, chart null. It still writes the ask log.

Types land in `src/types/bill.ts` only after the contract note in §10. Shape:

```ts
export interface AskPortfolioQuery {
  property_query: string;
  period: string;
  metric: "amount_usd";
  group_by: "none" | "month" | "utility_type";
  chart: "none" | "bar";
}

export interface AskAnswer {
  outcome: "answered" | "refused";
  sentence: string;
  chart: { categories: string[]; data: number[] } | null;
  property_id: PropertyId | null;
  property_name: string | null;
  months: string[];
  history_ids: string[];
  total: number | null;
  refusal_reason:
    | "AMBIGUOUS_PROPERTY"
    | "UNKNOWN_PROPERTY"
    | "LOW_MATCH_CONFIDENCE"
    | "NO_SELECTED_BILL"
    | "BAD_TOOL_INPUT"
    | null;
}
```

`chart` is null when `chart` is `none` or the outcome is `refused`. When `chart` is `bar`, `categories` and `data` are the same length and `data` is the bucket totals.

## 5. Resolve, period, aggregate, narrate, chart

All four pure functions live in `src/engine/ask.ts`. They take the clock as `2026-10-25`. They do not call `Date.now()`, `fetch`, or a model. `tests/boundary.test.ts` already fails an engine file that imports `@anthropic-ai/sdk`.

Do not call `matchBill()`. `matchBill` resolves account, then alias, then street address. This resolver does not.

### `resolveAskProperty`

Corpus for each property is the normalized `name` plus `city` only. Not street, zip, units, or vendor. Normalize by lowercasing and turning every run of non-alphanumeric characters into a single space.

1. If the normalized query is `selected` or `this property`, use the selected bill. No bill: `NO_SELECTED_BILL`. Confidence below `POLICY.MIN_MATCH_CONFIDENCE` (`0.90`): `LOW_MATCH_CONFIDENCE`. At or above `0.90`, with a non-null `match.property_id`: that property. The $420 Lombard `#B` row is `ADDRESS` at `0.80`. Refuse it. Do not sum Telegraph Hill.
2. Else if the normalized query equals one property's normalized name: that property.
3. Else a property hits when every query token is a whole word in its corpus. One hit: that property. Several: `AMBIGUOUS_PROPERTY` and those display names, sorted by property id. Zero: `UNKNOWN_PROPERTY`. `bay` does not hit `bayview`.

`San Francisco` is a city on four properties (`PROP-001`, `PROP-002`, `PROP-004`, `PROP-005`). `PROP-003` is Berkeley. Token `hill` hits only Telegraph Hill Lofts.

A refusal returns candidate names and does not call the aggregate. No total.

### `expandPeriod`

| Token | Months from clock `2026-10-25` | Sentence note |
|---|---|---|
| `last_month` | `2026-09` | none |
| `this_month` | `2026-10` | history invoices due in October, not a closed month |
| `trailing_3` | `2026-08`, `2026-09`, `2026-10` | the October note, because October is in the range |
| `YYYY-MM` | that month | the October note only when the month is `2026-10` |

Calendar months come from the clock string. No `Date.now()`.

### `aggregatePaidHistory`

```ts
aggregatePaidHistory(input: {
  history: HistoricalBill[];
  vendors: Vendor[];
  propertyId: PropertyId;
  months: string[];
  groupBy: "none" | "month" | "utility_type";
}): { total: number; billCount: number; historyIds: string[]; categories: string[]; data: number[] }
```

Population is the `history` argument only. The action passes `LedgerSnapshot.history` from `loadLedger` (`convex/lib/records.ts`, `ctx.db.query("history").take(200)`). The index on `history` is `by_historyId` only. Do not add an index or a month column. Thirty rows fit in that fetch. If the fetch length equals the take cap, throw. Do not answer a truncated book.

Month is `due_date.slice(0, 7)`. `billing_period_start` and `billing_period_end` exist on `ExtractedBill` only. Ignore them.

Keep rows for `propertyId` whose month is in `months`. Sum `amount` with `roundUsd` on every addition, same as `computeTotals`. Do not sum `usage_qty`. `historyIds` are `HistoricalBill.id`, sorted ascending.

`group_by` `none`: one bucket, `data` is `[total]`. `month`: one bucket per expanded month, including a `$0.00` month, categories `Aug 2026`, `Sep 2026`, `Oct 2026`. `utility_type`: join `Vendor.utility_type` on `vendor_id`. Order `ELECTRIC`, `WATER`, `TRASH`, `GAS`, then `CONTRACTOR` for a null utility type. Drop empty buckets. Display labels `Electric`, `Water`, `Trash`, `Gas`, `Contractor`.

`total` is the running `roundUsd` over the included rows, not a sum of displayed buckets after the fact. One row is in one bucket, so they match.

### `narrateAsk`

Same style as `src/engine/explain.ts`: a template, `formatUsd` from `src/engine/format.ts`, no model.

Single month, `group_by` `none`: `{name}, {Month YYYY}, paid history by due date: {formatUsd(total)} ({n} bills).`

`group_by` `month`: `{name}, paid history by due date, {first month} through {last month}: {formatUsd(total)} ({n} bills).`

`group_by` `utility_type`: the single-month sentence, then the labels and amounts in bucket order, separated by commas.

When the period note applies, append ` These are history invoices due in October, not a closed month.`

Full month name in the sentence (`September 2026`). Short name on chart categories (`Sep 2026`).

### Chart

`AskBars` is plain divs, the same rule as `UsageBars` in `context/ui-context.md` §4 (that component is a per-bill spike stub; do not reuse it for this series). Bar length is `value / max(data)`. Each bar is labeled with its category and `formatUsd`. `SEEDED` badge, because the rows are seeded paid history. Not an image. Not SVG from the model. No chart package.

## 6. Resolution and refusal

| Utterance | Selection | Result |
|---|---|---|
| What was last month's Bayview total? | any | `PROP-001`. `2026-09`. $3,460.00. 2 bills (PG&E $2,330.00 + SFPUC $1,130.00). |
| For this property, monthly bill amounts. | EBMUD, confidence `1.00`, `PROP-003` | Answer. Bars $4,120.00, $4,210.00, $4,210.00. |
| Last month for the San Francisco property | any | `AMBIGUOUS_PROPERTY`. Names: Bayview Commons, Telegraph Hill Lofts, Marina Gate Retail Plaza, Soma Tech Atrium. No total. |
| Property X | any | `UNKNOWN_PROPERTY`. No total. |
| This property | $420 Lombard `#B`, confidence `0.80` | `LOW_MATCH_CONFIDENCE`. No total. Do not sum Telegraph Hill. |

Refusal sentences, code templates:

- Ambiguous: `"San Francisco" matches more than one property: Bayview Commons, Telegraph Hill Lofts, Marina Gate Retail Plaza, Soma Tech Atrium.`
- Unknown: `No property matches "Property X".`
- Low confidence: `This bill matches {name} at 0.80. Needs 0.90 before "this property" can be summed.`
- No selection: `Select a bill before asking about this property.`

## 7. Data sources

Read `properties`, `vendors`, and `history` through the existing ledger fetch. Read the selected bill's `match.property_id`, `match.confidence`, and `match` property name from that bill's stored record.

Do not union `ledger.bills` or the live blotter into the aggregate. `BILL-102` is invoice `RW-99201`, $680.00, and that invoice is already paid history (`HIST` row, `due_date` `2026-10-20`, Shattuck, `src/seed/portfolio.ts`). A union would count $680.00 twice. October Shattuck from history alone is $4,210.00.

Grounded September 2026 figures, `due_date` month, current seed: Bayview Commons `PROP-001` $3,460.00 (2 bills). Five single-property September totals sum to $16,820.00. `HISTORY` has 30 rows, Aug–Oct 2026. The five-property figure is a test cross-check, not a drawer answer. Recompute from `src/seed/portfolio.ts` in the test if the seed changes. Do not copy the invoices into a second fixture.

`loadLedger` also returns live `bills`. The aggregate function's argument type is `HistoricalBill[]`, so a live bill cannot be passed without a cast.

## 8. Ask log

New table `askLog`. Do not append chat turns to `auditEvents`. `verifyAudit` walks `auditEvents` only and must stay unchanged.

Insert-only. Fields: `askId` (`ASK-<yymmdd>-<4 hex>`), `createdAt`, `question`, `toolInput` (JSON string or null when zod rejects), `propertyId` (null on refusal), `months`, `historyIds`, `dollarsShown` (the number shown, else null), `outcome` (`answered` | `refused`), `refusalReason` (the code, else null).

`replayOpening` and `resetDemo` both call `wipe` in `convex/bills/reset.ts`. Add `"askLog"` to that table list. Leave `bills`, `auditEvents`, `payments`, `aliases`, and `investigations` in the list. If another add-on has already added a table there, keep it. Do not delete `history`.

## 9. Ownership

Post the contract note (§10) and merge the `src/types/bill.ts` PR before the three lanes write code. After that, each lane stays in its own folders (`context/ai-workflow-rules.md` §3).

| Lane | May create or edit | Must not touch |
|---|---|---|
| Anmol | `src/engine/ask.ts`, `tests/ask.test.ts`, `askLog` in `convex/schema.ts`, `convex/ask/**`, the `"askLog"` entry in `convex/bills/reset.ts` | `src/engine/explain.ts`, `totals.ts`, `decide.ts`, `checks.ts`; `src/audit/**`; `convex/pipeline/process.ts`; `humanResume`; payments; `src/match/**`; `src/seed/**`; `src/shared/normalize.ts`; `package.json` |
| Pranil | `src/agents/ask/parseAsk.ts` only. Export the tool object as data. Import `@anthropic-ai/sdk` inside the function, not at module scope. Return the raw tool input as `unknown`. | `src/engine/**`, `src/match/matchBill.ts`, the Convex action, the drawer, `package.json` |
| Piyush | `src/components/AskDrawer.tsx`, `src/components/AskBars.tsx`, and the header mount in the command center | A new route, `page.tsx` beyond the existing `<CommandCenter />`, `UsageBars`, blotter totals, `package.json`, any sum in the component |

The action is Anmol's. It calls `parseAsk`, parses with the zod schema, loads the ledger, runs the pure functions, inserts the log, and returns `AskAnswer`. It does not set a bill status. A bad selected-bill id throws `ConvexError` with a short message.

`parseAsk` is not ready: the action throws `ConvexError("ask model not wired")`. Do not stub a dollar amount in the action.

## 10. Contract note

`src/types/bill.ts` is frozen. Before anyone edits it, post this in `#collaborative-context` and wait for a thumbs-up from the other two owners. Anmol then opens one PR that touches only `src/types/bill.ts`:

> Add-on portfolio ask. New types only: `AskPortfolioQuery`, `AskAnswer`. No change to `HistoricalBill`, `BillRecord`, `MatchResult`, `LedgerSnapshot`, or `AuditEvent`. Anmol owns the pure aggregate, `askLog`, and the Convex action. Pranil owns the Claude tool call. Piyush owns the drawer. No new dependency.

Until that PR merges, do not invent a local copy of those types.

## 11. Acceptance

`tests/ask.test.ts`, Vitest, no network, no `@anthropic-ai/sdk` import. Pass `HISTORY`, `PROPERTIES`, and `VENDORS` from `src/seed/portfolio.ts`. Pass clock `"2026-10-25"`.

- `expandPeriod` rows in §5.
- Bayview + `2026-09` + `group_by` `none` → total `3460`, count `2`, ids for `PGE-0882-2609` and `SFW-2450-2609`.
- The five September property totals sum to `16820`. Recompute from `HISTORY` if the seed changes.
- `HISTORY` length is `30`.
- Shattuck `trailing_3` `group_by` `month` → `4120`, `4210`, `4210`. October is `4210`, which counts `RW-99201` once.
- Token `hill` → `PROP-002`. Exact normalized `bayview commons` → `PROP-001`.
- `San Francisco` → four names, and the test does not read a total.
- `Property X` → unknown.
- Selected confidence `1` on `PROP-003` resolves. Selected confidence `0.8` refuses and does not aggregate.
- Zod rejects `{ total: 1 }`, `{ data: [] }`, `{ categories: [] }`, `{ metric: "kwh" }`, and `{ chart: "line" }`.
- The narrated Bayview sentence is the demo sentence in §3, built with `formatUsd`.
- `this_month` narration contains `history invoices due in October, not a closed month`.

`npm test` includes the existing boundary test. This file must keep that test green.

---

## Checklist (update only this list, in the same commit as the work)

- [ ] Contract note posted; `AskPortfolioQuery` and `AskAnswer` merged in `src/types/bill.ts` alone
- [ ] `resolveAskProperty`, `expandPeriod`, `aggregatePaidHistory`, `narrateAsk` + `tests/ask.test.ts` (no model import)
- [ ] `askLog` table, insert mutation, wipe on replay and `resetDemo`; `verifyAudit` still ignores it
- [ ] `parseAsk`: one tool, `tool_choice` forced, browser has no key
- [ ] Convex action wires zod → pure functions → log → `AskAnswer`
- [ ] `AskDrawer` + plain-div `AskBars` on the command center, no new route
- [ ] Freeze checklist was green before the first of these commits, and the two-minute script was not changed
