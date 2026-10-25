# Lintel — Devpost Submission Copy

> Ready-to-paste copy for the Cal Hacks 13.0 Devpost form.

---

## Project Name

**Lintel**

## Tagline (<= 140 chars)

An AP agent that reads every property bill, verifies the property and vendor, and only asks a human when policy says it must.

## Links

- **Live Deployed App:** https://lintel-brown.vercel.app/
- **Public GitHub Repository:** https://github.com/Pranillama/lintel
- **Convex Production Deployment:** https://incredible-cobra-296.convex.cloud
- **Convex Hackathon Log (`hackathon.md`):** https://github.com/Pranillama/lintel/blob/main/hackathon.md
- **CREAO Agent (`cfc435a7-6765-4fb3-8c00-8d55d3c7af52`):** https://app.creao.ai/agent/install/G5fE3N3q

---

## Inspiration

Small and mid-sized property management teams drown in recurring utility and contractor bills. A single 5-property portfolio receives dozens of PG&E, EBMUD, SFPUC, Recology, plumbing, and HVAC invoices every month — each formatted differently, often addressed to shorthand street names (`"1880 Lombard #B"` instead of `"1880 Lombard St, Units 101–408"`), occasionally billed twice (`RW-99201`), and sometimes hiding a 3.8x water main leak or an unvetted contractor with active civil judgments and tax liens.

Existing AP tools force an awful choice: either a human rubber-stamps every PDF by hand, or an opaque LLM "agent" auto-pays hallucinations. We built **Lintel** around a strict architectural conviction: **LLMs should read and investigate, while a pure deterministic policy engine decides and a SHA-256 hash chain proves every step.**

---

## What it does

Lintel is an autonomous accounts-payable operations desk for a 5-property San Francisco & Berkeley portfolio (**Lintel Property Holdings LLC**, **Telegraph Hill Lofts**, **Shattuck Student Living**, **Marina Gate Retail Plaza**, and **Soma Tech Atrium**):

1. **Multi-Format Document Intake (Claude Haiku 5.5):** Drop a real PDF/photo utility bill or contractor invoice into the **`Test a bill [J]`** modal. Claude Haiku 5.5 extracts vendor name, service address, account number, invoice number, billing period, usage (`kWh` / `CCF`), line items, and per-field confidence scores.
2. **Deterministic Property & Vendor Matcher + Alias Memory:** Matches bills by utility account number (`1.00`), normalized street address (`0.90`), or learned human aliases (`0.95`), while capping ambiguous unit numbers (`"1880 Lombard #B"`, `0.80`) so a human confirms the mapping once and Lintel remembers it forever.
3. **6-Check Pure Policy Guardrail Engine:** Evaluates `EXTRACTION_INCOMPLETE`, `NEEDS_PROPERTY_MATCH`, `EXACT_DUPLICATE`, `POSSIBLE_DUPLICATE`, `AMOUNT_SPIKE` / `USAGE_SPIKE` (against the 90-day property/vendor baseline), and `ABOVE_AUTO_LIMIT`.
4. **Live CRS Credit Bureau Vendor Verification:** Queries the **CRS Sandbox API** (PitchPoint Fraud Finder, Criminal, and Eviction records) before clearing any unverified contractor. When **Apex Rapid HVAC LLC** submits a `$3,850.00` emergency compressor invoice, CRS persona `P08` (`Priya Venkatesan`) returns a **$12,300 Alameda County civil judgment and $7,450 contractor tax lien**, automatically **BLOCKING** payment.
5. **CREAO AI Exception Investigator:** Whenever a bill is `HELD` or `BLOCKED`, Lintel schedules a background investigation with our hosted **CREAO Exception Investigator** agent (`cfc435a7-6765-4fb3-8c00-8d55d3c7af52`), producing a root-cause brief (`likely_cause`, `recommendation`, and a ready-to-send vendor dispute or maintenance work-order draft) right inside the Desk.
6. **SHA-256 Hash-Chained Audit Trail in Convex:** Every event (`EXTRACTED -> MATCHED -> CRS_VERIFIED -> POLICY_EVALUATED -> HELD/BLOCKED/CLEARED -> HUMAN_APPROVED`) hashes `{ seq, bill_id, type, actor, timestamp, prev_hash, payload }`. The UI recomputes the chain live and displays a verified badge.

---

## How we built it

- **Frontend:** Next.js 16 (App Router, React 19, TypeScript), styled as a financial operations desk (**Desk**, **Properties & vendors**, **Policy**, and **Test a bill `[J]`**).
- **Backend & Real-Time State Machine:** **Convex** (`convex/schema.ts`, `convex/pipeline/process.ts`, `convex/bills/resume.ts`, `convex/portfolio/admin.ts`) stores the 9-table relational ledger, uploaded PDF files in Convex file storage, scheduled CREAO investigations (`ctx.scheduler.runAfter` with 4s spacing), and atomic state + audit mutations.
- **AI & Sponsor Integrations:**
  - **Anthropic Claude Haiku 5.5 (`claude-haiku-5-5`)** for structured document extraction and **Claude Sonnet 5.5 (`claude-sonnet-5-5`)** for exception investigation synthesis.
  - **CRS Credit API** (`src/integrations/crs/verifyVendor.ts`) for live Bearer-authenticated PitchPoint Fraud Finder + Criminal + Eviction checks.
  - **CREAO AI** (`src/integrations/creao/client.ts`) for hosted multi-turn exception investigation runs (`ActionCreate_a_thread_and_run_it`).
- **Multi-Agent Development Workflow:** Built in **Cursor** with lane-isolated specifications (`context/lanes/01..06`) and coordinated with **Grok Bot** in Slack (`#collaborative-context`).

---

## Sponsor Prize Track Breakdown

### Convex (Best use of Convex)
Lintel uses **Convex** (`https://incredible-cobra-296.convex.cloud`) as its reactive state machine, relational ledger, file storage layer, and background job scheduler (full technical log in [`/hackathon.md`](https://github.com/Pranillama/lintel/blob/main/hackathon.md)):
- **Realtime Reactive Subscriptions (`useQuery`):** `src/components/desk/useConvexDesk.ts` subscribes to `api.bills.queries.listBills` and `api.bills.queries.getPortfolio`. When a PDF is dropped or an operator clicks an action button, the bill tabs, dollar totals (`Blocked`, `Held`, `Cleared`), SHA-256 chain status, and Properties & vendors directory update live without a page refresh.
- **9-Table Schema with Secondary Indexes (`convex/schema.ts`):** Relational tables for `properties`, `vendors`, `vendorAccounts`, `history`, `bills`, `auditEvents`, `payments`, `aliases`, and `investigations` with `by_billId`, `by_createdAt`, `by_billId_seq`, and `by_addressKey` indexes.
- **Transactional State + Audit Mutations:** Every pipeline step and human override (`convex/bills/resume.ts`) writes the updated bill status, any learned `HUMAN_ALIAS`, and the next SHA-256 hash-chained `auditEvents` row in one atomic Convex mutation.
- **File Storage & Scheduled Investigations:** `convex/pipeline/process.ts` stores uploaded PDFs in Convex file storage (`ctx.storage.store`) and schedules background CREAO investigations via `ctx.scheduler.runAfter(wait, internal.pipeline.investigate.run, { billId })` (`convex/pipeline/investigate.ts`).

### Anthropic (Claude for Public Benefit)
- **Who benefits:** Operations, accounts-payable, and maintenance staff at residential and student housing communities (modeled on Berkeley and San Francisco multi-unit properties like **Shattuck Student Living** at `2110 Shattuck Ave, Berkeley` and **Telegraph Hill Lofts**). Catching a **+281% water spike (`160 CCF` vs `42 CCF` baseline)** before auto-pay runs alerts maintenance to a building leak immediately, while blocking duplicate invoices and lien-flagged contractors protects housing operating budgets.
- **Role of Claude:** **Claude Haiku 5.5 (`claude-haiku-5-5`)** performs structured multimodal PDF/photo extraction (`src/agents/intake/extractDocument.ts`) with per-field confidence scores; **Claude Sonnet 5.5 (`claude-sonnet-5-5`)** synthesizes plain-English root-cause investigation briefs and vendor/maintenance outreach messages (`src/agents/investigator/investigate.ts`).
- **Hard Failure Boundaries:** Claude never holds unilateral authority to disburse funds. If any required extraction field has confidence `< 0.85`, returns malformed JSON, or hits its `20,000ms` timeout, the deterministic engine routes the bill to **`HELD` (`EXTRACTION_INCOMPLETE`)** for human review.

### CRS Credit API (Best Use of CRS API)
- **Live PitchPoint + Criminal + Eviction Integration (`src/integrations/crs/verifyVendor.ts`, `convex/crs/vendor.ts`):** Authenticates via `POST /users/login` (caching the Bearer token) and dispatches parallel requests across `POST /pitchpoint/fraud-finder`, `POST /criminal/new-request`, and `POST /eviction/new-request`.
- **Real Public-Record Guardrail in Action:** Dropping `BILL-108-apex-hvac-contractor.pdf` (`$3,850.00` from unverified contractor **Apex Rapid HVAC LLC**) runs CRS sandbox persona **`P08` (Priya Venkatesan, 1422 Broadway, Oakland CA)**, uncovering a **$12,300 Alameda County civil judgment + $7,450 contractor tax lien**, flipping the vendor to `FLAGGED`, and **BLOCKING** payment (`CRS_SIGNAL`).

### CREAO AI (Best Build on CREAO)
- **Hosted Agent (`cfc435a7-6765-4fb3-8c00-8d55d3c7af52`):** Installed at [https://app.creao.ai/agent/install/G5fE3N3q](https://app.creao.ai/agent/install/G5fE3N3q) and invoked from Convex via `POST https://api.creao.ai/v1/agents/cfc435a7-6765-4fb3-8c00-8d55d3c7af52/ActionCreate_a_thread_and_run_it` (`src/integrations/creao/client.ts`).
- **Rate-Limit Spacing & Resilient Parsing:** `convex/pipeline/investigate.ts` and `src/agents/investigator/spacing.ts` space background CREAO runs 4 seconds apart so burst bill uploads never hit HTTP 429, and parse both raw JSON and fenced JSON artifacts into the live **Agent drafted** card.

### SpaceXSI (Make it Legendary with SpaceXSI — Cursor & Grok Bot)
- **Cursor Multi-Agent Architecture:** We froze TypeScript types (`src/types/bill.ts`), policy constants (`src/seed/policy.ts`), and 6 lane specifications (`context/lanes/01..06`) so 3 engineers and Cursor agents could build the policy engine, Convex state machine, CRS/CREAO clients, and Next.js UI in parallel with 29 Vitest tests.
- **Grok Bot Fleet in Slack (`#collaborative-context`):** Six Grok Bot agents (`Jam`, `Sprout`, `Mochi`, `Eng Head`, `Bolt`, `Hoot`) worked alongside the team in Slack to research sponsor APIs, test CRS personas and CREAO endpoints, review PRs against lane contracts, generate realistic 2-page sample bill PDFs, and verify the production deployment.

---

## Challenges we ran into

- **Adapting to Live Upstream Schemas:** Both CRS Sandbox (`P08` returning `courts` and `taxLiens` arrays alongside nested `fraudFinder` flags) and CREAO's OpenAPI runtime (`data.messages[].content` containing fenced JSON artifacts) differed from initial assumptions. We built resilient, defensive parsers (`extractP08Signal`, `extractAssistantText`, `parseBriefJson`) backed by unit tests so live calls never crash the pipeline.
- **Preventing Burst Rate Limits on Background Agent Runs:** Dropping multiple exception bills at once initially triggered CREAO HTTP 429 rate limits. We designed a deterministic slot reservation helper (`nextSlotDelayMs` in `src/agents/investigator/spacing.ts`) paired with Convex's `ctx.scheduler.runAfter` so every background investigation runs cleanly.
- **Deterministic vs. Probabilistic Boundary:** Keeping `decide.ts` 100% pure (zero network calls, zero `Date.now()`, zero randomness) meant every Convex mutation and Vitest test could replay the exact same bill and get the exact same `PolicyVerdict` and SHA-256 hash.

---

## Accomplishments that we're proud of

- **Real Live Integrations End-to-End:** Every sponsor integration (Convex reactive ledger + file storage + scheduled jobs, Anthropic Claude Haiku 5.5 + Sonnet 5.5, CRS PitchPoint + Criminal + Eviction sandbox, and CREAO hosted agent `cfc435a7-6765-4fb3-8c00-8d55d3c7af52`) runs live in production at [https://lintel-brown.vercel.app/](https://lintel-brown.vercel.app/).
- **One-Click Human-in-the-Loop Alias Learning:** Resolving an ambiguous address (`"1880 Lombard #B"`) doesn't just clear one bill — it writes a permanent `HUMAN_ALIAS` rule in Convex that automatically matches the next bill (`BILL-104b-bayline-repeat.pdf`).
- **Tamper-Evident SHA-256 Audit Chain:** Every state transition is cryptographically linked to its predecessor and verified in real time in the browser.

---

## What we learned

- Separating **probabilistic perception** (Claude reading unstructured PDFs and CREAO drafting investigation briefs) from **deterministic authorization** (a pure 6-check policy engine and CRS public-record gates) is the key to making financial AI agents trustworthy in production.
- Freezing shared TypeScript contracts and lane boundaries in `/context` before writing implementation code let a 3-person team merge 26 PRs in 36 hours without stepping on each other.

---

## What's next for Lintel

- **Direct ACH & On-Chain Settlement:** Activating the payment settlement rail (`PAYMENT_RELEASED`) once a bill clears policy or receives human sign-off.
- **Outbound Voice Verification:** Dispatching an automated voice check to property supers when a utility spike is held, logging the transcript into the same SHA-256 audit chain.
- **Email Inbox Forwarding (`ap@lintel.ops`):** Ingesting utility PDFs directly from forwarded property-management email inboxes.
