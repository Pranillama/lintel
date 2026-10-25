# UI Context

Owner: **Piyush**. Next.js App Router with real routes (revamp on `feature/ui-revamp`). `/` is the receipt-printer landing; everything else sits under one app shell (`src/app/(app)/layout.tsx` → `AppProvider` + `AppShell`). Demo screen is 1440x900; it must not break at 1280x800.

Data comes only from Convex (`listBills`, `getPortfolio`, `processBill`, `humanResume`, `addProperty`, `addVendor`, `addVendorAccount`) through `useConvexDesk`, wrapped once in `AppProvider` and read by every screen with `useApp()`. Everything on screen is what is saved in the database: no seed, no replay, no simulated data. The UI never computes a status, a total, a percentage, or a why-sentence; it renders what `BillView`, `Totals` and `PortfolioResponse` say and picks which engine number to quote. Which human controls exist comes from `humanRefusal` (`src/engine/human.ts`), never from the UI.

**Operator-first copy.** Say what happened in plain words; codes, ids and hashes are never primary text. Verdict and next action first, details collapsed. Card titles name who did the work with a small chip: **What the bill says** (AI for documents, CODE for the feed, YOU when typed), **What Lintel checked** (CODE), **What the AI prepared** (AI), **What you need to do** (YOU). Confidence reads **Sure** (≥ 0.95), **Double-check** (0.85–0.95), **Unsure** (< 0.85, `POLICY.MIN_FIELD_CONFIDENCE`), with the source snippet in a tooltip. Actors read as people do: "Lintel's rules", "Claude", "CRS identity check", "A person, as Property Manager" (`plain.ts`).

---

## 1. Routes

| Route | Screen (`src/components/app/`) |
|---|---|
| `/` | `Landing`: receipt printer + pitch + always-visible "Skip to the inbox" |
| `/inbox` | `InboxScreen` (`?status=held\|blocked\|cleared\|rejected`, `?upload=1` opens the drawer) |
| `/bills/[id]` | `BillScreen` |
| `/properties`, `/properties/[id]` | `PropertiesScreen` |
| `/vendors`, `/vendors/[id]` | `VendorsScreen` |
| `/policy` | `PolicyScreen` (read-only) |
| `/audit` | `AuditScreen` |

Old desk links (`/?panel=test`, `/?bill=`) redirect into the inbox.

## 2. App shell

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Lintel   (Inbox 2) Properties  Vendors  Audit log                Policy  [+ Upload a bill J] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ TODAY  ● Needs you $6,100.00 · 2   ● Blocked $680.00 · 1   ● Cleared $2,290.40 · 1    ✓ Audit trail intact │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Sticky top bar: brand (→ `/`), the four sections (Inbox carries the needs-you count), `Policy`, and `Upload a bill` (shortcut `J` outside fields).
- Totals strip: the three server totals with counts (each links to the filtered inbox) and the audit-chain indicator (links to `/audit`).

## 3. Screens

- **Landing:** `ReceiptPrinter` prints today's tab from `listBills` over a 320vh scroll; a one-line pitch sits beside it; "Skip to the inbox" is always visible; the end offers "Open the inbox" and "Print it again". No WebGL → a flat receipt clipped by scroll.
- **Inbox:** groups in order Processing now (this browser's uploads in flight), Needs you, Blocked, Cleared, Rejected, each with count and server total. Filters: status tabs, property, vendor, search. Rows: stamp, vendor + one-line story, property, due, who acts next, amount. Right rail: a mini "Today's tab" receipt.
- **Bill detail:** header (stamp, vendor, amount, property · invoice · due · source, "Next that needs you"). Left: `ReceiptTicket` prints the bill's real audit rows line by line with a printer LCD narrating, then drops the status stamp; reduced motion shows the finished ticket. Right: the sticky decision card (**What you need to do**: verdict, next step, `Approve as {approver}` / `Assign to {guess}` / `Reject` / note; outcome card once resolved), then tabs: **What Lintel checked** (one evidence block chosen by verdict; spike bars with a dashed hold line; all checks collapsed), **What the bill says**, **What the AI prepared** (draft with `Send`), **History** (plain actors; fingerprints behind **Verify**).
- **Properties:** table (name + address, services, units, needs-you). Property page: needs-you / auto-pay limit / units, **Usage vs usual** per linked utility (the newest bill's SPIKE baseline, with the hold line), bills, utility accounts + `Link an account`. `Add property` sheet.
- **Vendors:** table (type, pays by, properties, needs-you). Vendor page: trust card (vendor file + CRS result), other spellings Lintel accepts, accounts by property, bills. `Add vendor` sheet.
- **Policy:** read-only from `POLICY`: Paid on its own / Waits for a person / Never paid, who approves a held bill (Operator, Property Manager up to $5,000, VP Finance above), contractor auto-pay limits by property, the rule text behind a disclosure.
- **Audit log:** every bill's audit rows, newest first: time, who (chip), what happened + plain note, bill (vendor · invoice). Filter by who acted; **Verify fingerprints** reveals short hashes and explains the chain.
- **Upload drawer:** right-hand sheet over any screen. A large drop zone for a PDF or photo first; "No file? Type it in" opens the form (vendor, invoice, amount, due, address, account, usage + unit, line items). `Read and check` shows three paced steps (the engine reports no progress), runs through `track()` so the inbox shows it under Processing now, then the verdict with `Open the bill` / `Upload another`. Errors inline.

## 4. Visual system

- Tokens live in `src/app/globals.css`: base `bar #0a0a0a`, surface `card #191919`, `paper #f2f1ec`, `muted #8c8c86`, `lime #c8f25a`, `ok #3ccf91`, `bad #ff7a70`.
- **Lime means "needs you"** and the single primary action, nothing else. Green = cleared/passed; red = blocked/failed/error. Status is never color alone: stamps and chips carry a word.
- Type sizes 12 / 14 / 16 / 24 / 40, weights 400 / 600. Poppins for text, IBM Plex Mono for labels, receipts and hashes. Radii 16 (cards), 10 (inputs), full (chips, buttons). 4px grid; no card inside a card.
- Money is `$1,234.56` in tabular figures; blocked amounts get one strike-through.

## 5. Not in the UI (contract gaps)

No per-vendor spend totals, bank details, GL codes, editable policy, or audit rows for admin adds: the contract has none, so the UI shows counts only or omits them. No property history query was added; usage trends reuse the SPIKE check baseline already on each bill.

## 6. Component map

`src/components/app/`: `AppProvider` (one Convex subscription, upload state, `track`), `AppShell`, `kit.tsx` (Screen, header, Stamp, Empty, Loading, Overlay, BillLinks, WhoChip), `plain.ts` (confidence words, actor and event labels), `ticket.ts` + `ReceiptTicket` (per-bill printing ticket), the screens above, `UploadDrawer`, `portfolio.tsx` (chips, Field/INPUT, add sheets). Reused from `src/components/desk/`: `Evidence`, `Agent`, `Decide`, `Details` (`humanize`), `Drawers` (`Sheet`), `story.ts` (verdict copy), `ui.tsx`, `contract.ts`, `useConvexDesk.ts` (the only file that calls Convex). Landing: `src/components/ReceiptPrinter.tsx` + `receipt/`.
