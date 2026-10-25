# Lintel

**Autonomous Property Bill & Accounts Payable System of Work**
Built at **Cal Hacks 13.0** (October 23–25, 2026 · Palace of Fine Arts, San Francisco)

**CREAO Agent ID:** `cfc435a7-6765-4fb3-8c00-8d55d3c7af52`

**CREAO Public Agent Install / Share Link:** https://agent.creao.ai/install/cfc435a7-6765-4fb3-8c00-8d55d3c7af52?version=74747abd-5af9-4356-9c2d-ad4d86e2e0e6

**Verified live run:** `9daa058a-a0d7-4d83-afa3-5a1c2e9ee317` / thread `984de11d-548e-4564-a4fc-ba77c845787b`

The model reads the bill. Code decides whether it gets paid. Agents do the legwork. A person owns the exceptions.

Fills 2 full-time property AP and utility-audit seats on a 250-property portfolio.

---

## Overview

Lintel is an autonomous accounts payable desk for a multi-property real estate portfolio. Bills come in typed, replayed from a feed, or dropped as a PDF or photo. An intake agent reads them. Deterministic code matches each bill to a property and vendor, checks duplicates, usage and amount spikes, and policy limits, and decides **CLEARED**, **HELD**, or **BLOCKED**. For every held or blocked bill, an investigator agent gathers evidence and drafts the follow-up a human would send. A person owns every exception. Every step lands in an append-only, hash-chained audit log.

---

## Problem

**DSD Cohort — Property Bill Automation.** Multi-property real estate operators process thousands of utility and contractor bills across dozens of properties and meters, taking employees two full days a month.

## What it does

End-to-end AP desk. The 4-bill opening replay lands Blocked `$680.00` · Held `$6,100.00` · Cleared `$2,290.40`. A person assigns `1880 Lombard #B` once; the next bill with that string matches by `HUMAN_ALIAS`. The Judge Live Test drawer runs any typed bill through the same `processBill` path.

## How it decides

| Who | Owns |
| --- | --- |
| AI | `extractDocument` (Claude Haiku 5.5), `investigate` via CREAO with a Claude Sonnet 5.5 fallback |
| Code | `matchBill`, `decide`, duplicate / spike / line-sum / CRS / policy checks, SHA-256 hash chain |
| Humans | Property assignment, exception approval and rejection, sending drafted follow-ups |

`extractDocument` returns fields, confidence, and source snippets. `investigate` drafts a follow-up after the decision. Neither sets status, the approver, or the rail. `decide()` does.

## Real vs Simulated

Copied from `REAL_VS_SIMULATED` in `src/seed/policy.ts`.

| Component | Status | How to verify |
| --- | --- | --- |
| Guardrail engine (duplicates, spike math, policy) | REAL | Type any bill in Judge Live Test; the rationale prints the arithmetic. tests/ cover every rule. |
| Property and vendor matching (account, alias, address) | REAL | Type 2450 Market St or 1880 Lombard #B and watch the match method change. |
| Human alias learning | REAL | Assign a held address once; the next bill with that string matches by HUMAN_ALIAS. |
| Bill reading from PDF/photo (intake agent) | REAL | Drop a PDF; fields arrive with confidence and source snippets. Timeout holds the bill. |
| Exception investigator agent (CREAO, Claude fallback) | REAL | Open any held bill; the brief shows provider and CREAO run link. |
| Append-only, hash-chained audit log in Convex auditEvents | REAL | Audit drawer shows each event hash; chain status is checked on every load. |
| Opening batch of 4 bills | REAL | Structured bill records replayed through the same engine on every load; no stored verdicts. |
| Portfolio: 5 properties standing in for a 250-property book, 3 months of bill history | SEEDED | src/seed/portfolio.ts |
| Usage baselines (CCF, kWh) | SEEDED | src/seed/portfolio.ts; not a utility data feed. |
| Payment execution (utility portal, ACH) | SIMULATED | Cleared bills show rail + SIMULATED badge; no money moves. |
| Drafted emails and work orders | SIMULATED | Send logs an audit event; nothing leaves the app. |
| CRS Credit API vendor background check (FCRA BLJ / OFAC / Criminal) | REAL | Run CHIP-NEW-CONTRACTOR (Apex Rapid HVAC LLC, P08 Priya Venkatesan) with LINTEL_CRS_ENABLED=true; returns live Stitch Credit sandbox civil judgment ($12,300) and state tax lien ($7,450). |

The CRS row is the live Stitch Credit sandbox (`https://api-sandbox.stitchcredit.com/api`) for persona P08 (PRIYA VENKATESAN, SSN 666701008). It is a sandbox background check, not a production credit pull.

## Architecture

[Lintel end-to-end architecture diagram](https://app.eraser.io/workspace/nCH5coHP4gcTnJ6qBik0?diagram=6zi90Ltsnv4FgTIQQzJK&layout=canvas)

```
Browser — AP Command Center (Next.js, thin)
  subscribe: listBills, getBill, verifyAudit
  Judge form / replay / upload  ──►  processBill action
  Assign, approve, reject, send draft  ──►  humanResume mutation
        │
Convex
  Queries (reactive, no network)
    listBills, getBill, verifyAudit
  Mutations (one transaction, no network, no model)
    each writes the bill row and one auditEvents row
    createBill, commitExtraction, commitMatch, commitPolicy,
    commitCrs, commitPayment, humanResume
  Actions (the only place HTTP is allowed)
    processBill      orchestrator                         Anmol
    extractBill      Claude + CREAO, DOCUMENT path only   Pranil
    verifyVendor     CRS sandbox, flag-gated              Pranil
    settleX402       Coinbase on Base Sepolia, stretch    Pranil
    investigate      CREAO, then Claude fallback          Pranil
  File storage: PDFs and photos
  Tables: properties, vendors, vendorAccounts, bills,
          auditEvents, payments, aliases, investigations
```

`processBill` is the only code path that creates a bill. The form, the feed replay, and the upload all call it.

## Microsoft: Built for the Real World

Lintel is the accounts payable desk for a multi-property operator. Each batch shows dollars blocked, held, and cleared — the opening replay is Blocked $680.00, Held $6,100.00, and Cleared $2,290.40 — and the desk measures minutes saved per bill against the two-full-days-a-month review this work replaces. The path to production keeps the same `PaymentInstruction` contract: Postgres and Convex persistence, a real utility portal, and ACH rails sit behind that contract, with enterprise SSO on the operator desk. Models read the bill and draft the follow-up; deterministic code owns duplicates, spike math, limits, status, and payment. Every transition is an append-only SHA-256 hash-chained audit log entry. Intake, match, guardrails, human exception handling, and the settlement instruction run as one path.

## Run locally

```bash
npm install
```

Copy `.env.example` to `.env.local`. Fill values locally. Do not commit secrets, and do not prefix a secret with `NEXT_PUBLIC_`.

Variables the repo reads:

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Public Convex URL. `npx convex dev` writes it. The only `NEXT_PUBLIC_` value. |
| `ANTHROPIC_API_KEY` | Claude. The intake agent and the investigator fallback use the SDK default; `convex/bills/queries.ts` reads this name for the extraction flag. |
| `LINTEL_EXTRACT_MODEL` | Intake model. Default `claude-haiku-5-5`. |
| `LINTEL_INVESTIGATOR_MODEL` | Investigator fallback. Default `claude-sonnet-5-5`. |
| `CREAO_API_KEY` | Server-only CREAO key. |
| `CREAO_AGENT_ID` | `cfc435a7-6765-4fb3-8c00-8d55d3c7af52` |
| `LINTEL_CRS_ENABLED` | `true` calls the CRS sandbox for `UNVERIFIED_CONTRACTOR` vendors. Otherwise the outcome is `NOT_RUN`. |
| `CRS_BASE_URL` | Optional. Default `https://api-sandbox.stitchcredit.com/api`. |
| `CRS_API_KEY` | Optional bearer token. If unset, login uses the username and password. |
| `CRS_USERNAME` | Stitch Credit sandbox login. |
| `CRS_PASSWORD` | Stitch Credit sandbox login. |
| `LINTEL_X402_ENABLED` | Stretch flag. Cleared contractor settlement stays simulated unless this is `true`. |

Convex actions read server keys from the Convex environment, not from the browser.

```bash
npx convex dev
node scripts/sync-convex-env.mjs
npm run dev
npm test
npm run extract -- fixtures/bills/BILL-103-ebmud.pdf
```

`npm run dev` starts Next.js and `convex dev` together. Let the standalone `npx convex dev` write `NEXT_PUBLIC_CONVEX_URL`, then stop it before `npm run dev` so two Convex processes are not fighting. `node scripts/sync-convex-env.mjs` is the step that copies server variables into Convex. This checkout does not include that script yet; until it does, set the same names in the Convex dashboard. `npm test` never calls the network. The extract CLI prints one `ExtractedBill` for a local PDF or image. `fixtures/bills/` holds one fictional sample bill PDF per demo input in `src/seed/demo-inputs.ts`, plus a blurred phone photo (`CHIP-CLEAN-PGE-pge-photo.png`) that is held for low confidence. Uploading a PDF lands on the same verdict as typing that bill. `npm run fixtures:bills` regenerates them with the local Google Chrome.

## Team

- **Pranil Lama** ([@Pranillama](https://github.com/Pranillama)) — Intake normalizer & document extraction agent (Claude Haiku 5.5), deterministic property/vendor matcher, exception investigator agent (CREAO AI + Claude Sonnet 5.5 fallback), CRS Credit API integration, sponsor setup & submission.
- **Anmol Pandey** ([@axp8948](https://github.com/axp8948)) — Convex backend, deterministic guardrail & policy engine (`decide`), `processBill` orchestrator pipeline, SHA-256 hash-chained audit log, golden test suite.
- **Piyush Singh** — Next.js 16 AP Command Center UI, live blotter & replay, Judge Live Test drawer, why-card & usage sparklines, audit verification drawer, demo video.
