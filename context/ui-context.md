# UI Context

Owner: **Piyush**. One page at `/`, no other routes. The desk has two views, **Desk** and **Properties & vendors**, switched in the navbar. It opens on the **receipt printer** (`ReceiptPrinter`): scrolling feeds the live AP tab out of a 3D thermal printer, printed from the same `listBills` data. The end of the tab offers "Open the AP desk ↓", and the AP desk sits directly below as a full-screen section (`#desk`). Pressing `J` anywhere scrolls to the desk and opens Test a bill; a skip link and the `?bill=` / `?panel=` hints jump straight to the desk. Judges stand at a shared, loud table for two minutes: everything that matters must be readable from a meter away without clicking. Demo screen is 1440x900; it must not break at 1280x800. Below 1280 the four cards go two by two, and below 768 they stack.

Data comes only from Convex (`listBills`, `getPortfolio`, `processBill`, `humanResume`, `addProperty`, `addVendor`, `addVendorAccount`) through `useConvexDesk`. Everything on screen is what is saved in the database: there is no seed, no replay, and no simulated data. The UI never computes a status, a total, a percentage, or a why-sentence; it renders what `BillView` and `Totals` say and picks which engine number to quote. Which human controls exist comes from `humanRefusal` (`src/engine/human.ts`), never from the UI.

---

## 1. Layout: one bill told as a four-step story

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Lintel   (Desk) Properties & vendors                                   Policy  [+ Test a bill J] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ TODAY  ● Needs you $6,100.00 · 2   ✕ Blocked $680.00 · 1   ✓ Cleared $2,290.40 · 1      ✓ Audit chain intact │
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

- **Top bar:** brand (click returns to the desk), the two views (`Desk`, `Properties & vendors`), `Policy` (opens the policy sheet), and `Test a bill` (shortcut `J`). Nothing else.
- **Insight strip:** one quiet 40px line under the top bar on both views: the three totals with counts and the audit chain indicator.
- **Bill tabs:** hidden when there are no bills. Needs-you first, then blocked, cleared, rejected. One row; it scrolls sideways with an edge fade and keeps the selected tab in view.
- **Story header:** status chip, vendor, amount, then the verdict in 40px plus a quiet line: property · invoice · due · source.
- **Card 1, Read in / AI read:** the fields as read. Uploaded documents show a per-field confidence; anything under 0.85 is red.
- **Card 2, Code decided:** one evidence block chosen by verdict. Spike: usage bars vs the last 3 bills. Duplicate: already-paid vs this bill side by side. Needs a property: the printed address with the unit marked plus the best guess and its score. Vendor: vendor file, CRS result, signals, auto-pay limit. Line sum: lines vs printed total. Cleared: why it cleared. Learned alias: `address → property`, taught once.
- **Card 3, Agent drafted:** provider chip and, for CREAO, a quiet `RUN <8 chars>` chip (full id in the tooltip, no link). While running: a skeleton with elapsed seconds. Done: a 3-line summary, the draft subject, `Send` while the bill is HELD or BLOCKED, and `Read draft`. Otherwise it shows the `humanRefusal` text. Cleared bills: "No follow-up needed."
- **Card 4, You decide:** HELD only. Lime ring, the next-step line, `Approve as {approver}` (the one lime button), `Reject`, an optional note. A bill that needs a property gets `Assign to {best guess}` plus `Another property…` instead of Approve. Cleared bills say `Approved for payment via {rail}`; only a real x402 testnet payment adds a `Testnet` tag and its reference. No money moves otherwise, and nothing claims it did. Blocked bills say why nothing will be paid.
- **Extra information opens in a modal, never by expanding a card.** One `Modal` (native `<dialog>`: focus trap, `Esc` and a backdrop click close it, focus returns to the opener).
  - **Details modal:** the links at the foot of cards 2 and 4 open it on the Checks or History tab, with the hash-chain status in the header. Checks: the engine's sentence, then every check with an icon + word chip (Pass, Hold, Block, Skip) and a one-line detail. History: time, actor (AI / CODE / HUMAN / CRS), event, rationale, hash (actor and hash hide below 640px).
  - **Draft modal:** `Read draft` (or `Read full brief` when there is no draft) shows what the agent found, its findings, and the full draft, with `Send` pinned in the footer under the same rules as the card.
- **Overlays** (Test a bill, Policy) slide in from the right over the story; `Esc` or the scrim closes them.

## 1b. Properties & vendors

- A segmented control (`Properties n` / `Vendors n`), a search box, and one solid button (`Add property` / `Add vendor`).
- **Properties list:** name + street and city, service chips (from linked utility accounts), unit count. A lime dot means a HELD bill is matched to it (a `NEEDS_PROPERTY_MATCH` guess does not count).
- **Vendors list:** name, type chip (Utility · type, Known contractor in green, Unverified contractor in red), pays by, number of properties served.
- A row opens a right-hand sheet. **Property:** units, contractor auto-pay limit, utility accounts (+ `Link an account`), bills on the desk (click jumps to the bill). **Vendor:** other spellings the matcher accepts, accounts by property for utilities (+ `Link an account`), bills on the desk.
- **Add forms** live in the same sheet. Validation is deterministic in `src/portfolio/admin.ts` (unique name/address, unique spelling across vendors, unique account number, utilities only for accounts); errors show inline. There is no login: anyone at the desk can add. Rows are never edited or deleted from the UI.

## 2. Visual system

- Tokens live in `src/app/globals.css`: base `bar #0a0a0a`, one surface `card #191919`, `paper #f2f1ec`, `muted #8c8c86`, `lime #c8f25a`, `ok #3ccf91`, `bad #ff7a70`.
- **Lime means "needs you"** and the single primary action, nothing else. Green means cleared or passed; red means blocked, failed, or an error. Status is never color alone: chips are a tinted background + icon + word.
- Type sizes are 12 / 14 / 16 / 24 / 40, in weights 400 / 600. Poppins for text, IBM Plex Mono for labels, ids, and hashes. Content text is at least 14px. Radii are 16 (cards), 10 (inputs, inner blocks), and full (chips, buttons). Spacing is on a 4px grid, with one card style and no card inside a card.
- Money is `$1,234.56` in tabular figures; blocked amounts get one strike-through.

## 3. Opening and live updates

1. On first load, subscribe to `listBills` and `getPortfolio`; never poll, never write. Until the first result: totals read $0.00, the tabs show `Loading…`, and the story is a skeleton.
2. Select the first HELD spike bill, else the first HELD bill, else the newest bill. Keep the selection by id. A brief moving from RUNNING to DONE arrives on the same subscription.
3. An empty desk offers `Test a bill`; with no properties saved it leads with `Add properties & vendors`.
4. Optional read-only URL hints: `?bill=<vendor or id>` selects a bill; `?panel=test` opens Test a bill.

## 4. Test a bill

- **The form is the hero:** vendor, invoice, amount, due date (today by default), service address, account, usage + unit, and line items. No preset scenarios. All inputs share one style.
- **Upload is a slim dashed row:** PDF, PNG, JPEG, WEBP, sent through `processDocument`.
- **Sticky footer:** `Run checks` (lime) shows `Reading → Matching → Checking` while it waits.
- **The result shows inline:** status, verdict, amount, and next step, with `View in desk` and `Test another`. The new bill also lands in the tabs, selected and flashed once. Errors show inline in red, never as `alert()`.

## 5. Component map (`src/components/desk/`)

`LiveDesk` (Convex root; renders `ReceiptPrinter` on top, then the desk in `#desk`) → `Desk` (layout, tabs, story, overlays) with `useDesk` (view, selection, keyboard). `TopBar` (+ `InsightStrip`), `Portfolio` (Properties & vendors view, detail sheets, add forms), `Evidence` (+ `AssignControls`, `PaymentLine`), `Agent`, `Decide`, `Details`, `TestBill`, `Drawers` (Policy sheet, shared `Sheet`), `story.ts` (verdict copy), `ui.tsx` (tokens, icons, chips, buttons), `contract.ts` (`DeskData` / `DeskActions` and labels), `useConvexDesk.ts` (the only file that calls Convex).
