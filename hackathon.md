# Hackathon log
- **Project:** Lintel (Team: Pranil Lama, Anmol Pandey, Piyush Singh)
- **Event:** Cal Hacks 13.0
- **What it does:** Autonomous accounts-payable desk for residential and student housing AP teams that reads utility and contractor bills, matches properties, blocks duplicates and CRS-flagged vendor liens, holds spikes, dispatches CREAO/Claude exception investigators, and logs every step in a SHA-256 hash-chained Convex audit trail.
- **Live app:** https://lintel-brown.vercel.app/
- **Repo:** https://github.com/Pranillama/lintel
- **Frontend:** Vercel
- **Convex deployment:** https://incredible-cobra-296.convex.cloud
- **Components:** none
- **Convex features:** schema, indexes, queries, mutations, actions, scheduled functions, file storage, realtime useQuery
- **Auth:** none
- **AI models:** claude-haiku-5-5, claude-sonnet-5-5
- **Started:** 2026-10-24T07:55:48Z
- **Last updated:** 2026-10-25T08:31:35Z

## How we use Convex
- **Live AP Desk, Totals & Audit Chain:** The Desk view, bill tabs, Today strip, and Properties & vendors view subscribe via realtime `useQuery` (`listBills`, `getPortfolio`) in `src/components/desk/useConvexDesk.ts` and `convex/bills/queries.ts`, updating live without refresh.
- **9-Table Ledger & Indexed Audit Trail:** `convex/schema.ts` defines `properties`, `vendors`, `vendorAccounts`, `history`, `bills`, `auditEvents`, `payments`, `aliases`, and `investigations` with indexes (`by_billId`, `by_createdAt`, `by_billId_seq`, `by_addressKey`) read in `convex/lib/records.ts`.
- **Bill Pipeline Action & File Storage:** `convex/pipeline/process.ts` (`processBill`) stores uploaded PDF/photo bills in Convex file storage (`ctx.storage.store`), calls `extractBill` (`convex/intake/extract.ts`) and `verify` (`convex/crs/vendor.ts`), and commits via internal mutations.
- **Transactional State & SHA-256 Audit Log:** Mutations in `convex/bills/create.ts`, `convex/match/commit.ts`, `convex/engine/policy.ts`, `convex/crs/vendor.ts`, and `convex/bills/resume.ts` (`humanResume`) atomically write the bill, `aliases`, and hash-chained `auditEvents`.
- **Scheduled Background Investigations & Admin:** For `HELD`/`BLOCKED` bills, `convex/pipeline/process.ts` schedules `ctx.scheduler.runAfter(wait, internal.pipeline.investigate.run, { billId })` (`convex/pipeline/investigate.ts`), while `convex/portfolio/admin.ts` powers live property/vendor additions without refresh.

## Log
- `2026-10-24` `9175717` Initial repo bootstrap (`CLAUDE.md`, `AGENTS.md`).
- `2026-10-24` `39e5b8c` Master spec, types, and seed portfolio (`src/types/bill.ts`, `src/seed/portfolio.ts`).
- `2026-10-24` `1386516` Next.js + Convex schema (`convex/schema.ts`).
- `2026-10-24` `14e0354` Policy engine, SHA-256 audit chain, and pipeline (`src/engine/decide.ts`, `convex/pipeline/process.ts`).
- `2026-10-24` `e5653ad` Form normalizer and matcher (`src/intake/normalizeForm.ts`, `src/match/matchBill.ts`).
- `2026-10-24` `e19473b` Claude intake, CRS check, and investigator (`src/agents/intake/extractDocument.ts`, `src/integrations/crs/verifyVendor.ts`).
- `2026-10-24` `7cf81a0` Live CRS P08 parser and CREAO reader (`src/integrations/creao/client.ts`).
- `2026-10-25` `c14c055` AP Command Center UI wired to Convex (`src/components/desk/useConvexDesk.ts`).
- `2026-10-25` `bdebb7d` End-to-end fixes and bill PDFs (`convex/match/commit.ts`, `fixtures/bills/`).
- `2026-10-25` `4877f43` Left-to-right story UI rebuild (`src/components/desk/Desk.tsx`, `src/components/desk/Evidence.tsx`).
- `2026-10-25` `dfd1c90` CREAO 4s spacing and schema resilience (`convex/pipeline/investigate.ts`).
- `2026-10-25` `a698165` Properties & vendors view and admin mutations (`convex/portfolio/admin.ts`, `src/components/desk/Portfolio.tsx`).
- `2026-10-25` `8f0f218` Realistic sample bill PDFs (`scripts/make-demo-bills.mjs`, `fixtures/bills/`).
