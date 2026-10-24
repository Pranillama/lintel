# UI Context

Owner: **Piyush**. One screen, the AP Command Center at `/`. No other routes for the demo. Judges stand at a shared, loud table for two minutes: everything that matters must be readable from a meter away without clicking.

Data comes only from Convex (`listBills`, `getPortfolio`, `processBill`, `humanResume`, `replayOpening`). The UI never computes a status, a total, a percentage, or a why-sentence; it renders what `BillView` and `Totals` say. Until those functions are live, build against mock `BillView` objects in `src/components/__mocks__/` (clearly mock, never imported by `page.tsx` in the final build). The page is a client component under `ConvexProvider`.

---

## 1. Layout (desktop 1440×900 is the demo screen; must not break at 1280×800)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Lintel   AI reads · CODE decides · HUMAN owns          [Policy] [Real vs Simulated] [Judge Live Test] │
│ Fills 2 full-time property AP and utility-audit seats on a 250-property portfolio.  250-property book · 5 loaded │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│   BLOCKED $680.00          HELD $6,100.00          CLEARED $2,290.40        chain ✓ intact   │
├───────────────────────────────────────────────┬──────────────────────────────────────────┤
│ Saturday intake · 4 bills          [Replay]   │  DETAIL (selected bill)                   │
│ ─────────────────────────────────────────────  │  Vendor · Property · $amount · [STATUS]  │
│ PG&E · Bayview Commons     $2,290.40 CLEARED  │  Why: one sentence, numbers in it          │
│   Simulated portal                            │  Guardrails: 8 rows PASS/HALT/BLOCK/SKIP   │
│ Recology · Shattuck        $̶6̶8̶0̶.̶0̶0̶ BLOCKED  │  Match: method · confidence · candidates   │
│   Exact duplicate of RW-99201                 │  Usage bars (spike bills)                  │
│ EBMUD · Shattuck           $5,680.00 HELD     │  Investigator brief + draft [Send]         │
│   +281% usage · rate flat                     │  Actions: [Assign] [Approve] [Reject]      │
│ Bayline · Lombard #B       $420.00   HELD     │  Audit timeline (actor chips, hashes)      │
│   Unit not on property                        │                                            │
│ ── Live ──                                    │                                            │
│ (judge / injector bills appear here, newest first)                                        │
└───────────────────────────────────────────────┴──────────────────────────────────────────┘
```

- Left column ~44%, detail ~56%. Rows are dense (one line + one subline), no cards with shadows.
- The detail pane is always visible; selecting a row swaps it. No modal for bill details, no route change.
- Drawers (Judge Live Test, Policy, Real vs Simulated) slide over the detail pane from the right, never over the blotter or totals.

## 2. Visual language

- Ink on a light background. Neutral grays for structure. **Color only inside status chips and check outcomes.**
- Status chips: `CLEARED` green, `HELD` amber, `BLOCKED` red, `REJECTED` gray. Same hue for check outcomes PASS/HALT/BLOCK; SKIP is gray.
- Actor chips in the audit timeline: `AI` (violet) for AI_EXTRACTION / AI_INVESTIGATOR, `CODE` (slate) for DETERMINISTIC_RULE / PAYMENT_ROUTER / SYSTEM_FEED, `HUMAN` (blue) for HUMAN_*, `CRS` (teal). These colors mirror the header legend `AI reads · CODE decides · HUMAN owns`.
- Numbers: tabular figures (`font-variant-numeric: tabular-nums`), right-aligned amounts, `$1,234.56`. BLOCKED amounts get one strike-through.
- Type: Geist Sans for text, Geist Mono for invoice numbers, account numbers, hashes. Body 14px, row amounts 16px, totals 32px.
- Badges: `SIMULATED` small outline badge next to any rail; `SEEDED` where seed data is shown (usage baselines).
- Pixel standard: aligned baselines in rows, consistent 8px spacing grid, no layout shift when a brief arrives (reserve its space with a skeleton), no text overflow at 1280px.

## 3. The five-second opening (the video's first frame)

1. On first load (and on `Replay`), call `replayOpening`. While waiting, show the four row skeletons with `Reading…` and totals at `$0.00`.
2. When the response arrives, reveal rows top to bottom with a 250 ms stagger (CSS only). Each row's chip flips from `Reading…` to its status.
3. Totals count up over ~1.2 s to the values in `ReplayResponse.totals`. The Recology amount strikes through once its row lands.
4. After the last row, auto-select the EBMUD row (the first HELD bill with a spike reason; fall back to the first HELD).
5. No logo animation, no title card, no confetti. Respect `prefers-reduced-motion` (skip the stagger and count-up).

Replay is real `processBill` calls; the animation only paces the reveal of a response that already came back.

## 4. Detail pane

Order top to bottom:

1. **Header:** vendor, property (or `Unmatched`), amount, status chip, `resolved by HUMAN` tag when applicable, source tag (`FEED · Saturday intake`, `FORM`, `DOCUMENT · file.pdf`).
2. **Why:** `decision.why`, one sentence, 16px. This is the most important text on screen.
3. **Guardrails table:** one row per `decision.checks` entry: check name, outcome chip, `rationale`. Always 8 rows; PASS rows are what make it read like an audit, not an error console.
4. **Match:** method chip (`EXACT_ACCOUNT`, `HUMAN_ALIAS`, `ADDRESS`, `HUMAN_ASSIGNED`, `UNRESOLVED`), confidence, candidates with scores and reasons. For `NEEDS_PROPERTY_MATCH`, show the bill's raw `service_address` snippet next to the top candidate with the unit token highlighted, plus `[Assign to {candidate}]` and a property dropdown for any other choice. The button text says it will remember: `Assign and remember this address`.
5. **Usage bars** (only when the SPIKE check has `baseline_usage` or `baseline_amounts`): 3 seeded bars + this bill's bar, labeled with values, `SEEDED` badge. Plain divs, no chart library.
6. **Investigator brief:** provider chip (`CREAO` or `CLAUDE`), status. PENDING/RUNNING shows a skeleton with `Investigating…` (CREAO can take up to a minute; the rest of the pane is already useful). DONE shows summary, findings bullets, and the draft (kind, to, subject, body) with `[Send]` (calls the send endpoint; button becomes `Sent ✓` and an audit row appears). If `creao_share_url` exists, show `View CREAO run ↗`. FAILED shows the error in one gray line. Copy under the brief: `Agents draft. People send. Code decides.`
7. **Actions:**
   - HELD: `[Approve as {required_approver}]`, `[Reject]`, optional note field. NEEDS_PROPERTY_MATCH uses Assign instead of Approve.
   - BLOCKED: **no Approve, no Pay, no override.** Show `Blocked bills cannot be paid.`
   - CLEARED: rail + `SIMULATED` badge + payment reference. No actions.
8. **Audit timeline:** `audit` events in seq order: time, actor chip, action, decision chip, rationale. Show `hash` as the first 8 chars in mono. Footer: `chain ✓ intact` or `chain ✗ broken` from `BillsResponse.audit_chain_intact`.

## 5. Judge Live Test drawer

- Button in the header, always visible, high contrast. Keyboard shortcut `J`.
- Two tabs: **Type a bill** (default) and **Drop a PDF / photo**.
- Type tab fields: vendor, invoice #, account #, service address, amount, due date (default today 2026-10-25), usage qty + unit, optional line items (collapsed). Large inputs; amount field autofocused.
- Chips above the form from `JUDGE_CHIPS` plus `ALIAS_TWIN`: clicking a chip **fills the inputs in plain sight**; nothing runs until `Run autonomous pipeline` is pressed. The $686 Recology chip is first.
- Drop tab: drag area + file picker (PDF, PNG, JPEG, WEBP). Shows the filename, then the same result flow. If extraction fails, the resulting HELD bill shows `EXTRACTION_FAILED`; offer `Type it instead` which switches tabs and keeps whatever fields came back.
- On run: button disabled with `Running…`; on response, close the drawer, insert the new bill at the top of `Live`, select it, and flash its row once. The blotter never clears between runs.
- Errors from Convex show inline in the drawer, never as `alert()`.

## 6. Policy card and Real vs Simulated

- **Policy** drawer: `PortfolioResponse.policy_text` as a numbered list, plus a small table of properties with their contractor auto-pay limits. Header line: `Read-only at this desk.`
- **Real vs Simulated** drawer: table from `PortfolioResponse.real_vs_simulated` (component, status chip REAL/SIMULATED/SEEDED, how to verify). Footer shows feature flags (CRS, CREAO, x402, extraction) as on/off.

## 7. Live updates

- Subscribe to `listBills`. Do not poll.
- Keep the selected bill selected when the subscription updates (by id). No flicker: replace data in place.
- A brief moving from PENDING to DONE arrives on that same subscription.

## 8. Component map (suggested, all under `src/components/`)

`CommandCenter` (client root), `HeaderBar`, `TotalsBar`, `Blotter`, `BillRow`, `DetailPane`, `GuardrailTable`, `MatchPanel`, `UsageBars`, `InvestigatorPanel`, `ActionBar`, `AuditTimeline`, `JudgeDrawer`, `PolicyDrawer`, `RealVsSimulatedDrawer`, `StatusChip`, `ActorChip`, `Money`. Call Convex with `useQuery`, `useMutation`, and `useAction`. Do not wrap a REST client.

`src/app/page.tsx` renders `<CommandCenter />` and nothing else.
