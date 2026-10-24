# Lane: Piyush (AP Command Center UI, demo video)

You own everything a judge sees. The first five seconds of the video and of the table demo are your screen. The UI renders decisions; it never makes them.

**Read first:** `context/ui-context.md` (your main spec), `context/master-spec.md` §2, §6 (expected outcomes, so you know what the screen should show), §8 (the 2-minute script), `src/types/bill.ts` (every shape you render).

**Your folders:** `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/`, `public/`.

**You consume (from Anmol):** the API in `context/lanes/anmol-spec.md` §5. Types: `BillsResponse`, `BillView`, `Totals`, `PortfolioResponse`, `ReplayResponse`, `AssignPropertyBody`, `HumanDecisionBody`. Stub routes exist from the scaffold; real ones land through the afternoon (watch `#anmol-update`).

---

## 1. Build order

1. **Mocks (first hour).** `src/components/__mocks__/bills.ts`: hand-written `BillView` objects that look like master-spec §6 outcomes (opening four + one judge bill + one with a DONE investigation brief). Only used while the API is stubbed; delete the import from `page.tsx` before the 6:00 PM gate.
2. **Skeleton.** `CommandCenter` (client component), header with legend + seats line + three buttons, `TotalsBar`, `Blotter` + `BillRow`, empty `DetailPane`.
3. **Detail pane.** Why line, `GuardrailTable` (8 rows), `MatchPanel`, `AuditTimeline`, `ActionBar` (rules in ui-context §4.7: no pay control on BLOCKED).
4. **Opening animation.** Replay on load, stagger, count-up, auto-select EBMUD, reduced-motion fallback (ui-context §3).
5. **Judge Live Test drawer.** Type tab + chips (prefill only) + Run; Drop tab with upload; inline errors (ui-context §5).
6. **Assign flow.** "Assign and remember this address" with the snippet next to the candidate; after the call, the row re-renders CLEARED with `resolved by HUMAN`.
7. **Investigator panel.** Skeleton while PENDING/RUNNING, brief + draft + Send when DONE, CREAO run link; polling every 2 s while any brief is pending (ui-context §7).
8. **Usage bars, Policy drawer, Real vs Simulated drawer.**
9. **Pixel pass** at 1440×900 and 1280×800: alignment, no overflow, no layout shift when briefs arrive, consistent spacing. Be picky; judges see this from a meter away.

## 2. API client (`src/components/api-client.ts`)

Typed wrappers: `getBills()`, `getPortfolio()`, `processForm(form)`, `processDocument(file)` (multipart field `file`), `assign(id, propertyId)`, `approve(id, note?)`, `reject(id, note?)`, `sendDraft(id)`, `replay()`, `reset()`. Throw an `Error` with the API's `{ error }` message on non-2xx; components show it inline.

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
- **Architecture image:** update the FigJam "Lintel System Architecture" board to match master-spec §4 (code orchestrator; intake + investigator agents; CRS gated; x402 stretch; no CREAO in the extract path) and export it for README/Devpost.

---

## Checklist (update only this list, in the same commit as the work)

- [ ] Mocks + `CommandCenter` skeleton rendering the opening four from mocks
- [ ] Header (legend, seats line, buttons), `TotalsBar`, `Blotter`, `BillRow`
- [ ] `DetailPane`: why, `GuardrailTable`, `MatchPanel`, `AuditTimeline`, `ActionBar`
- [ ] `api-client.ts`; switched from mocks to the live API (6:00 PM gate)
- [ ] Opening animation from `POST /api/demo/replay` + auto-select + reduced motion
- [ ] Judge Live Test drawer: type tab, chips, run, insert + select new bill
- [ ] Judge drawer: document upload tab + extraction-failed path
- [ ] Assign-and-remember flow; alias twin chip demo works end to end
- [ ] Investigator panel + polling + Send + CREAO link
- [ ] Usage bars, Policy drawer, Real vs Simulated drawer
- [ ] Pixel pass at 1440×900 and 1280×800
- [ ] FigJam architecture board updated + exported
- [ ] Video recorded (first frame = blotter) + Devpost image
