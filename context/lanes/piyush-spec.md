# Lane: Piyush (AP Command Center UI, demo video)

You own everything a judge sees. The first five seconds of the video and of the table demo are your screen. The UI renders decisions; it never makes them.

**Read first:** `context/ui-context.md` (your main spec), `context/master-spec.md` §2, §6 (expected outcomes, so you know what the screen should show), §8 (the 2-minute script), `src/types/bill.ts` (every shape you render).

**Your folders:** `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/`, `public/`.

**You consume (from Anmol):** the Convex functions in `context/lanes/anmol-spec.md` §5. Types: `BillsResponse`, `BillView`, `Totals`, `PortfolioResponse`, `ReplayResponse`, `AssignPropertyBody`, `HumanDecisionBody`. Subscribe with `useQuery`. Do not poll and do not add a fetch client.

---

## 1. Build order

1. **Mocks (first hour).** `src/components/__mocks__/bills.ts`: hand-written `BillView` objects that look like master-spec §6 outcomes (opening four + one judge bill + one with a DONE investigation brief). Only used while the API is stubbed; delete the import from `page.tsx` before the 6:00 PM gate.
2. **Skeleton.** `CommandCenter` (client component), header with legend + seats line + three buttons, `TotalsBar`, `Blotter` + `BillRow`, empty `DetailPane`.
3. **Detail pane.** Why line, `GuardrailTable` (8 rows), `MatchPanel`, `AuditTimeline`, `ActionBar` (rules in ui-context §4.7: no pay control on BLOCKED).
4. **Opening animation.** Replay on load, stagger, count-up, auto-select EBMUD, reduced-motion fallback (ui-context §3).
5. **Judge Live Test drawer.** Type tab + chips (prefill only) + Run; Drop tab with upload; inline errors (ui-context §5).
6. **Assign flow.** "Assign and remember this address" with the snippet next to the candidate; after the call, the row re-renders CLEARED with `resolved by HUMAN`.
7. **Investigator panel.** Skeleton while PENDING/RUNNING, brief + draft + Send when DONE, CREAO run link. The row updates from the `listBills` subscription (ui-context §7).
8. **Usage bars, Policy drawer, Real vs Simulated drawer.**
9. **Pixel pass** at 1440×900 and 1280×800: alignment, no overflow, no layout shift when briefs arrive, consistent spacing. Be picky; judges see this from a meter away.

## 2. Convex client

Use `useQuery`, `useMutation`, and `useAction` for `listBills`, `getPortfolio`, `processBill`, `humanResume`, `replayOpening`, and `resetDemo`. Document upload passes a Convex storage id into `processBill`. Show the `ConvexError` message inline.

## 3. Rules

- Never compute status, totals, percentages, or why-text in the UI. Render `decision.why`, `decision.checks[].rationale`, `totals`.
- Chips fill inputs only. Nothing runs until the user presses Run.
- BLOCKED bills: no Approve, no Pay, no override button.
- Every rail shows a `SIMULATED` badge unless `payment.mode === "LIVE_TESTNET"`.
- Actor chips and status colors exactly as ui-context §2; keep the header legend `AI reads · CODE decides · HUMAN owns`.
- No chart or animation libraries: CSS transitions and divs. Tailwind is installed.
- No `alert()`, no `console.log` left in committed code.

## 4. Demo assets (after the 2:00 AM freeze)

- **Video (≤ 2:30):** first frame = the blotter mid-count. No title card. Then follow master-spec §8: EBMUD why-card + brief, assign + alias twin, judge chip blocks. Record at 1440×900, readable text. Voiceover optional; captions for the key numbers.
- **Devpost image:** a clean screenshot of the opening state with EBMUD selected.
- **Architecture image:** the Eraser file is the source of truth (master-spec §4). Export that diagram for the README and Devpost. Do not draw a second architecture that puts SQLite or a Next route handler in front of the bill.

---

## Checklist (update only this list, in the same commit as the work)

- [x] Mocks + `CommandCenter` skeleton rendering the opening four from mocks (`__mocks__/mockDesk.ts` runs the real engine)
- [x] Header (legend, seats line, buttons), `TotalsBar`, `Blotter`, `BillRow`
- [x] `DetailPane`: why, `GuardrailTable`, `MatchPanel`, `AuditTimeline`, `ActionBar`
- [x] Convex client wired; switched from mocks to `listBills` (6:00 PM gate). Code-complete via `useConvexDesk`; not yet run against a live deployment.
- [x] Opening animation from `replayOpening` + auto-select + reduced motion
- [x] Judge Live Test drawer ("Test a bill"): type tab, chips incl. line-sum, run, insert + select new bill
- [x] Judge drawer: document upload tab + extraction-failed path
- [x] Assign-and-remember flow; alias twin chip demo works end to end (on the mock desk)
- [x] Investigator panel + live brief updates + Send + CREAO link
- [x] Usage bars, Policy drawer, Real vs Simulated drawer
- [x] Pixel pass at 1440×900 and 1280×800 (clipping sweep on every bill state and drawer)
- [ ] Eraser architecture diagram exported for the README
- [ ] Video recorded (first frame = blotter) + Devpost image
- [x] `ReceiptPrinter`: scroll-driven 3D thermal printer that prints the tab from a `listBills` response (lines in `receipt/receiptLines.ts`, tests in `tests/ui/`). Mounted as the landing section of `/`, above the desk.
