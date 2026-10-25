# Lintel — Autonomous Property Bill Operations Desk

**An AP agent that reads every property bill, verifies the property and vendor, and only asks a human when policy says it must.**

- **Live Deployed App:** [https://lintel-brown.vercel.app/](https://lintel-brown.vercel.app/)
- **Convex Production Deployment:** `https://incredible-cobra-296.convex.cloud` (Dev: `https://artful-orca-848.convex.cloud`)
- **Hackathon Build Log (`hackathon.md`):** [`./hackathon.md`](./hackathon.md)
- **CREAO Exception Investigator Agent:**
  - **Agent ID:** `cfc435a7-6765-4fb3-8c00-8d55d3c7af52` (`Lintel Exception Investigator`)
  - **Agent Share / Install URL:** [https://app.creao.ai/agent/install/G5fE3N3q](https://app.creao.ai/agent/install/G5fE3N3q) ([direct version link](https://agent.creao.ai/install/cfc435a7-6765-4fb3-8c00-8d55d3c7af52?version=74747abd-5af9-4356-9c2d-ad4d86e2e0e6))
  - **Verified Live CREAO Run IDs:** `d114c848-6cdb-4e15-add1-498cff6e6107`, `9daa058a-a0d7-4d83-afa3-5a1c2e9ee317`, `0a0709da-57d4-43c9-9424-75a45c1793e0`

Lintel sits between incoming utility/contractor invoices and the payment rail for a 5-property San Francisco & Berkeley portfolio:

```
Bill (PDF / photo / sample)  -->  Extract (Claude Haiku 5.5)  -->  Match Property & Vendor
                                                                         |
   +---------------------------------------------------------------------+
   v
6-Check Policy Engine  +  CRS Credit Bureau Check  +  CREAO Exception Investigator
   |
   +--> CLEARED   (auto-approved inside policy envelope + SHA-256 audit hash)
   +--> HELD      (spike / unit ambiguity / unverified vendor -> 1-click human decision)
   +--> BLOCKED   (exact duplicate or adverse CRS lien/judgment -> payment refused)
```

Every decision — automatic or human — appends an immutable event to a **SHA-256 hash-chained audit trail** (`prev_hash -> hash`) stored in **Convex** and verified live in the UI.

## How we use Convex

Lintel runs its entire real-time accounts-payable ledger, 6-check policy pipeline, and SHA-256 hash-chained audit log on **Convex** (`https://incredible-cobra-296.convex.cloud`). Uploaded PDF and photo bills are stored in Convex file storage and orchestrated by `convex/pipeline/process.ts` (`processBill` action), which calls Claude Haiku 5.5 extraction (`convex/intake/extract.ts`) and CRS Credit Bureau verification (`convex/crs/vendor.ts`) before committing atomic state transitions and append-only audit events (`convex/bills/create.ts`, `convex/match/commit.ts`, `convex/engine/policy.ts`, `convex/bills/resume.ts`). When a bill is held or blocked, `convex/pipeline/process.ts` schedules a background exception investigation via `ctx.scheduler.runAfter(wait, internal.pipeline.investigate.run, { billId })` (`convex/pipeline/investigate.ts`) with 4-second rate-limit spacing. The Next.js Desk and Properties & vendors views subscribe via realtime `useQuery` (`api.bills.queries.listBills`, `api.bills.queries.getPortfolio` in `src/components/desk/useConvexDesk.ts`) so bill tabs, dollar totals, investigation briefs, and human overrides update live without a page refresh — see [hackathon.md](./hackathon.md) for the full technical breakdown and commit log.

---

## Sponsor Tracks & Integrations

| Sponsor Track | How Lintel Uses It | Key Code |
|---|---|---|
| **Convex** | Real-time reactive database (`properties`, `vendors`, `vendorAccounts`, `history`, `bills`, `auditEvents`, `payments`, `aliases`, `investigations`), file storage for uploaded bill PDFs, scheduled background actions (`internal.pipeline.investigate.run`), and atomic mutations that write both bill state and SHA-256 audit events in a single transaction. Details in [`hackathon.md`](./hackathon.md). | `convex/schema.ts`, `convex/pipeline/process.ts`, `convex/bills/resume.ts`, `src/components/desk/useConvexDesk.ts` |
| **Anthropic (Claude for Public Benefit)** | **Claude Haiku 5.5 (`claude-haiku-5-5`)** extracts structured line items, meter usage (`kWh`/`CCF`), billing periods, and per-field confidence scores from uploaded utility PDFs and contractor invoices; **Claude Sonnet 5.5 (`claude-sonnet-5-5`)** synthesizes root-cause investigation briefs and vendor/tenant outreach emails when CREAO escalates or is offline. Strict safety boundaries hold any bill with `< 0.85` extraction confidence or a timeout. | `src/agents/intake/extractDocument.ts`, `src/agents/investigator/investigate.ts` |
| **CRS Credit API** | Authenticates against the **CRS Sandbox API** (`POST /users/login`) and queries **PitchPoint Fraud Finder / Criminal / Eviction** endpoints (`POST / pitchpoint/fraud-finder`, `/criminal/new-request`, `/eviction/new-request`) using sandbox test personas (`P01`–`P10`). Surfaces real public-record risk — e.g., persona **`P08` (Priya Venkatesan, Oakland CA)** returns a **$12,300 Alameda County civil judgment + $7,450 contractor tax lien**, automatically **BLOCKING** an unverified HVAC contractor invoice before disbursement. | `src/integrations/crs/verifyVendor.ts`, `convex/crs/vendor.ts` |
| **CREAO AI** | Hosted **Lintel Exception Investigator** agent on CREAO (`POST https://api.creao.ai/v1/agents/{id}/ActionCreate_a_thread_and_run_it`) inspects held/blocked bills alongside 90-day property history and CRS findings, returning a structured `InvestigationBrief` (`likely_cause`, `recommendation`, `confidence`, and ready-to-send email/SMS `draft_message`). | `src/integrations/creao/client.ts`, `convex/pipeline/investigate.ts` |
| **SpaceXSI (Cursor & Grok Bot)** | Built by a 3-person team using **Cursor** (lane-isolated `/context` contracts, Cloud Agents, TDD checks) and **Grok Bot** (`Jam`, `Sprout`, `Mochi`, `Eng Head`, `Bolt`, `Hoot`) coordinating live in Slack (`#collaborative-context`) for sponsor research, PR reviews, and deployment checks. | `CLAUDE.md`, `AGENTS.md`, `context/` |

---

## Anthropic: Claude for Public Benefit

Lintel is built for **housing operations, accounts-payable, and maintenance staff at residential and student housing communities** (modeled on Berkeley and San Francisco multi-unit properties like **Shattuck Student Living** at `2110 Shattuck Ave, Berkeley` and **Telegraph Hill Lofts**). Small property-operations teams drown in hundreds of monthly water, electric, refuse, and emergency repair invoices:
- **Preventing water loss & tenant disruption:** Catching a **+281% water spike (`160 CCF` vs `42 CCF` baseline)** on a student housing building before auto-pay runs alerts maintenance to an underground main or toilet flapper leak immediately instead of weeks later.
- **Protecting housing budgets from duplicate billing & contractor fraud:** Blocking duplicate refuse bills and unvetted contractors with active civil judgments or mechanic's liens protects operating reserves that keep housing affordable and well-maintained.
- **Hard AI Failure Boundaries (Claude proposes; deterministic policy disposes):** Claude never holds direct authority to disburse funds. If Claude Haiku 5.5 returns any required field with confidence `< 0.85`, returns malformed JSON, or hits its `20,000ms` AbortController timeout, Lintel refuses to guess and routes the bill to **`HELD` (`EXTRACTION_INCOMPLETE`)** for human inspection.

---

## Built with Cursor & Grok Bot (SpaceXSI)

A 3-person team built Lintel across 77+ commits and 26 pull requests in 36 hours by pairing **Cursor** and **Grok Bot** as full teammates:
- **Cursor Multi-Agent Architecture (`CLAUDE.md`, `AGENTS.md`, `context/`):** Before writing application code, we froze TypeScript contracts (`src/types/bill.ts`), deterministic policy thresholds (`src/seed/policy.ts`), and 6 lane specs (`context/lanes/01-intake-and-matching.md` through `06-frontend-command-center.md`). This allowed 3 engineers and Cursor agents to build the pure policy engine, Convex state machine, CRS/CREAO integrations, and Next.js Desk in parallel with zero merge conflicts.
- **Grok Bot Multi-Agent Fleet in Slack (`#collaborative-context`):** Six specialized Grok Bot agents (`Jam`, `Sprout`, `Mochi`, `Eng Head`, `Bolt`, and `Hoot`) operated alongside the human team in Slack — extracting sponsor API documentation, testing live CRS PitchPoint personas (`P01`–`P10`) and CREAO agent endpoints, auditing pull requests against the frozen lane contracts, generating the 11 realistic two-page sample bill PDFs (`scripts/make-demo-bills.mjs`), and verifying the production Vercel + Convex deployment.

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- npm

### 1. Install dependencies
```bash
npm install
```

### 2. Configure `.env.local`
Copy `.env.example` to `.env.local` and fill in your credentials:
```bash
cp .env.example .env.local
```

Required environment variables for full live mode:
- `NEXT_PUBLIC_CONVEX_URL` — your Convex deployment URL (Production: `https://incredible-cobra-296.convex.cloud`)
- `ANTHROPIC_API_KEY` — Claude Haiku 5.5 (PDF/image intake) & Sonnet 5.5 (investigator fallback)
- `LINTEL_CRS_ENABLED=true`, `CRS_API_BASE_URL`, `CRS_USERNAME`, `CRS_PASSWORD` — CRS Sandbox API credentials
- `CREAO_API_KEY`, `CREAO_AGENT_ID=cfc435a7-6765-4fb3-8c00-8d55d3c7af52`, `CREAO_BASE_URL=https://api.creao.ai` — CREAO Exception Investigator agent

Push the backend environment variables to your Convex deployment with one command:
```bash
npm run convex:env
```

### 3. Start Convex + Next.js
```bash
npx convex dev      # Terminal 1: syncs schema & functions
npm run dev         # Terminal 2: starts http://localhost:3000
```

---

## Live Demo Walkthrough (4-Act AP Story)

Open **[https://lintel-brown.vercel.app/](https://lintel-brown.vercel.app/)** (or `http://localhost:3000`). The header provides four primary controls: **`Desk | Properties & vendors | Policy`** and **`Test a bill [J]`**:

1. **Act I — Auto-Clear (`BILL-101` — PG&E `$2,290.40` at 2450 Market St):**
   - Account `4491-882-01` matches **Lintel Property Holdings LLC** at `1.00` confidence.
   - Amount is **-2.1%** vs the 90-day paid average (`$2,340.00`). All 6 policy checks pass -> **`CLEARED`** with zero human clicks.
2. **Act II — Exact Duplicate Blocked (`BILL-102` — Recology `$680.00` at 2110 Shattuck Ave):**
   - Invoice `RW-99201` matches historical paid invoice `HIST-021`.
   - Policy check `EXACT_DUPLICATE` fires -> **`BLOCKED`** immediately (`$680.00` saved).
3. **Act III — 3.8x Water Spike Held + CREAO Investigation (`BILL-103` — EBMUD `$5,680.00` at 2110 Shattuck Ave):**
   - Usage jumped from `42 CCF` (`$1,490` avg) to `160 CCF` (**+281.2%** vs baseline).
   - Policy checks `AMOUNT_SPIKE` and `USAGE_SPIKE` hold the bill -> **CREAO Investigator** drafts a root-cause brief and maintenance work-order inspection note -> Human clicks **Hold & ask vendor** or **Approve & pay `$5,680.00`**.
4. **Act IV — Ambiguous Unit Held + One-Click Learning (`BILL-104` — Bayline Plumbing `$420.00` at `"1880 Lombard #B"`):**
   - Street matches **Telegraph Hill Lofts**, but unit `#B` isn't in `101–408`, capping confidence at `0.80` (`NEEDS_PROPERTY_MATCH`).
   - Clicking **Link to Telegraph Hill Lofts & approve** writes a permanent `HUMAN_ALIAS` rule (`1880 lombardst#b -> PROP-002`) so the next `#B` bill auto-matches at `0.95`.

### Live Drop-In Test Bills (`Test a bill [J]`)
Click **`Test a bill [J]`** in the top-right header (or press `J` / drag any PDF from `fixtures/bills/` onto the dropzone):
- **`BILL-108-apex-hvac-contractor.pdf` (`$3,850.00` — Apex Rapid HVAC LLC):** Triggers a live **CRS Credit Bureau** lookup on persona `P08` (`Priya Venkatesan`), uncovering a **$12,300 civil judgment + $7,450 tax lien**, flipping the vendor to `FLAGGED`, and **BLOCKING** the invoice (`CRS_SIGNAL`).
- **`BILL-104b-bayline-repeat.pdf` (`$310.00` — Bayline Plumbing `#B`):** Proves the alias learned in Act IV auto-matches `1880 Lombard #B` on the second bill.

---

## Verification & Tests

```bash
npm test              # 29 Vitest unit + integration tests across policy, matching, CRS, CREAO, and audit chain
npx tsc --noEmit      # Strict zero-error TypeScript check across src/ and convex/
npm run build         # Production Next.js 16 build
```
