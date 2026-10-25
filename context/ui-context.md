# UI Context

Owner: **Piyush**. One page at `/`, no other routes for the demo. It opens on the **receipt printer** (`ReceiptPrinter`): scrolling feeds the live AP tab out of a 3D thermal printer, printed from the same `listBills` data. The end of the tab offers "Open the AP desk ↓", and the AP desk sits directly below as a full-screen section (`#desk`). Pressing `J` anywhere scrolls to the desk and opens Test a bill; a skip link and the `?bill=` / `?panel=` hints jump straight to the desk. Judges stand at a shared, loud table for two minutes: everything that matters must be readable from a meter away without clicking. Demo screen is 1440x900; it must not break at 1280x800. Below 1280 the four cards go two by two, and below 768 they stack.

Data comes only from Convex (`listBills`, `getPortfolio`, `processBill`, `humanResume`, `replayOpening`) through `useConvexDesk`. The UI never computes a status, a total, a percentage, or a why-sentence; it renders what `BillView` and `Totals` say and picks which engine number to quote. Which human controls exist comes from `humanRefusal` (`src/engine/human.ts`), never from the UI.

---

## 1. Layout: one bill told as a four-step story

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Lintel   ● Needs you $6,100.00  ✕ Blocked $680.00  ✓ Cleared $2,290.40  ✓ Chain intact   How it works ▾  [+ Test a bill J] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ (! Bayline $420) (! EBMUD $5,680) (✕ Recology $680) (✓ PG&E $2,290.40)   ← bill tabs, scroll sideways with a fade │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [! Needs you] EBMUD                                                        $5,680.00 │
│ Usage is +281.0% over its usual            Shattuck Student Living · Invoice … · Due … │
│ ┌ 1 Read in ─┐ ┌ 2 Code decided ──────┐ ┌ 3 Agent drafted ──┐ ┌ 4 You decide ─────┐ │
│ │ fields     │ │ ONE evidence block   │ │ CREAO · RUN id    │ │ next step         │ │
│ │ (+ conf.)  │ │ chosen by verdict    │ │ summary, draft,   │ │ [Approve as …]    │ │
│ │            │ │ 8 checks · 1 failed ›│ │ [Send] Read draft │ │ History · 15 ›    │ │
│ └────────────┘ └──────────────────────┘ └───────────────────┘ └───────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** brand (tagline `AI reads · Code decides · Human owns` on wide screens), the three totals, the audit chain indicator, a quiet `How it works` menu (Policy, Real vs simulated, Replay Saturday intake), and `Test a bill` (shortcut `J`).
- **Bill tabs:** needs-you first, then blocked, cleared, rejected. One row; it scrolls sideways with an edge fade and keeps the selected tab in view.
- **Story header:** status chip, vendor, amount, then the verdict in 40px plus a quiet line: property · invoice · due · source.
- **Card 1, Read in / AI read:** the fields as read. Uploaded documents show a per-field confidence; anything under 0.85 is red.
- **Card 2, Code decided:** one evidence block chosen by verdict. Spike: usage bars vs the last 3 bills. Duplicate: already-paid vs this bill side by side. Needs a property: the printed address with the unit marked plus the best guess and its score. Vendor: vendor file, CRS result, signals, auto-pay limit. Line sum: lines vs printed total. Cleared: why it cleared. Learned alias: `address → property`, taught once.
- **Card 3, Agent drafted:** provider chip and, for CREAO, a quiet `RUN <8 chars>` chip (full id in the tooltip, no link). While running: a skeleton with elapsed seconds. Done: a 3-line summary, the draft subject, `Send` while the bill is HELD or BLOCKED, and `Read draft`. Otherwise it shows the `humanRefusal` text. Cleared bills: "No follow-up needed."
- **Card 4, You decide:** HELD only. Lime ring, the next-step line, `Approve as {approver}` (the one lime button), `Reject`, an optional note. A bill that needs a property gets `Assign to {best guess}` plus `Another property…` instead of Approve. Cleared bills show the payment rail with a `SIMULATED` tag. Blocked bills say why nothing will be paid.
- **Extra information opens in a modal, never by expanding a card.** One `Modal` (native `<dialog>`: focus trap, `Esc` and a backdrop click close it, focus returns to the opener).
  - **Details modal:** the links at the foot of cards 2 and 4 open it on the Checks or History tab, with the hash-chain status in the header. Checks: the engine's sentence, then every check with an icon + word chip (Pass, Hold, Block, Skip) and a one-line detail. History: time, actor (AI / CODE / HUMAN / CRS), event, rationale, hash (actor and hash hide below 640px).
  - **Draft modal:** `Read draft` (or `Read full brief` when there is no draft) shows what the agent found, its findings, and the full draft, with `Send` pinned in the footer under the same rules as the card.
- **Overlays** (Test a bill, Policy, Real vs simulated) slide in from the right over the story; `Esc` or the scrim closes them.

## 2. Visual system

- Tokens live in `src/app/globals.css`: base `bar #0a0a0a`, one surface `card #191919`, `paper #f2f1ec`, `muted #8c8c86`, `lime #c8f25a`, `ok #3ccf91`, `bad #ff7a70`.
- **Lime means "needs you"** and the single primary action, nothing else. Green means cleared or passed; red means blocked, failed, or an error. Status is never color alone: chips are a tinted background + icon + word.
- Type sizes are 12 / 14 / 16 / 24 / 40, in weights 400 / 600. Poppins for text, IBM Plex Mono for labels, ids, and hashes. Content text is at least 14px. Radii are 16 (cards), 10 (inputs, inner blocks), and full (chips, buttons). Spacing is on a 4px grid, with one card style and no card inside a card.
- Money is `$1,234.56` in tabular figures; blocked amounts get one strike-through.

## 3. Opening and live updates

1. On first load, call `replayOpening`. While it runs: totals read $0.00, the tabs show `Reading…`, and the story is a skeleton.
2. Select the first HELD spike bill (EBMUD), else the first HELD bill.
3. Subscribe to `listBills`; never poll. Keep the selection by id. A brief moving from RUNNING to DONE arrives on the same subscription.
4. A failed replay shows a red line with `Try again`. An empty desk offers `Test a bill` and `Replay`.
5. Optional read-only URL hints: `?bill=recology` selects a bill after the replay; `?panel=test` opens Test a bill.

## 4. Test a bill

- **Scenario cards are the hero:** a 2-column grid built from `JUDGE_CHIPS`, `ALIAS_TWIN`, and `LINE_SUM_FIXTURE`. Each card has a plain-English name and one line saying what the bill is, never the outcome. The twin card hints "Best after you assign the $420 Bayline bill" until the alias exists.
- **`Edit details` is collapsed by default:** vendor, invoice, amount, due date, then service address, account, usage + unit, and line items. All inputs share one style.
- **Upload is a slim dashed row:** PDF, PNG, JPEG, WEBP, sent through `processDocument`.
- **Sticky footer:** `Run checks` (lime) shows `Reading → Matching → Checking` while it waits.
- **The result shows inline:** status, verdict, amount, and next step, with `View in desk` and `Test another`. The new bill also lands in the tabs, selected and flashed once. Errors show inline in red, never as `alert()`.

## 5. Component map (`src/components/desk/`)

`LiveDesk` (Convex root; renders `ReceiptPrinter` on top, then the desk in `#desk`) → `Desk` (layout, tabs, story, overlays) with `useDesk` (replay, selection, keyboard). `TopBar`, `Evidence` (+ `AssignControls`, `PaymentLine`), `Agent`, `Decide`, `Details`, `TestBill`, `Drawers` (Policy, Real vs simulated), `story.ts` (verdict copy), `ui.tsx` (tokens, icons, chips, buttons), `contract.ts` (`DeskData` / `DeskActions` and labels), `useConvexDesk.ts` (the only file that calls Convex). `src/components/__mocks__/mockDesk.ts` runs the same engine in the browser for tests and previews; never import it from `src/app`.
