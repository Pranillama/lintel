# Lintel — Devpost draft

Paste-ready. Do not submit this file by itself; the Sunday 8:45 AM Devpost submit is still open.

**CREAO Agent ID:** `cfc435a7-6765-4fb3-8c00-8d55d3c7af52`

**CREAO Public Agent Install / Share Link:** https://agent.creao.ai/install/cfc435a7-6765-4fb3-8c00-8d55d3c7af52?version=74747abd-5af9-4356-9c2d-ad4d86e2e0e6

**Verified live run:** `9daa058a-a0d7-4d83-afa3-5a1c2e9ee317` / thread `984de11d-548e-4564-a4fc-ba77c845787b`

## Project title

Lintel

## Elevator pitch

The model reads the bill. Code decides whether it gets paid. Agents do the legwork. A person owns the exceptions.

## Seats line

Fills 2 full-time property AP and utility-audit seats on a 250-property portfolio.

## Tracks to select

- Hyphenate (Autonomous Systems for Finance)
- Microsoft (Built for the Real World)
- CREAO (AI-First Disruptor)
- CRS Credit API
- Convex

## Inspiration / DSD Problem

DSD Cohort — Property Bill Automation. Multi-property real estate operators process thousands of utility and contractor bills across dozens of properties and meters, taking employees two full days a month. A CTO is about to spend heavily because that review does not scale. Lintel is the desk that does the review: read the bill, match it to a property, stop duplicates and spikes in code, and hand a person only the exceptions.

## What it does

Lintel is an end-to-end accounts payable desk. On load, four seeded bills replay through `processBill` and the blotter lands Blocked `$680.00` · Held `$6,100.00` · Cleared `$2,290.40`. PG&E at Bayview clears because the account matches and the bill is inside the spike band. The $680 Recology bill is blocked as a duplicate of one already paid. The EBMUD bill is held on a usage spike. `1880 Lombard #B` is held because unit B is not on the property (address confidence capped at 0.80). Assign it once and the alias is remembered; the next bill with that string matches by `HUMAN_ALIAS` and can clear on its own. The Judge Live Test drawer types any bill into the same engine. Held and blocked bills get an investigator brief and a drafted follow-up. A person approves, rejects, or sends. Cleared payments show a rail and a `SIMULATED` badge. No money moves.

## How we built it

Next.js 16 is the AP Command Center. Convex is the system of record: the screen subscribes to `listBills`, `getBill`, and `verifyAudit`. `processBill` is the only path that creates a bill (form, feed replay, or upload).

- Intake of a typed or replayed bill is `normalizeForm` (no model). A PDF or photo goes through `extractDocument` on Claude Haiku 5.5 (`claude-haiku-5-5`, override `LINTEL_EXTRACT_MODEL`). Every field has a confidence and a source snippet. Timeout, refusal, or a parse failure returns an `ExtractedBill` with `extraction_error` set. The engine holds that bill. The model does not invent totals.
- `matchBill` is pure: exact account, then a stored human alias, then an address score. No fuzzy vendor guessing.
- `decide` runs every check in order and writes a `CheckResult` for each: extraction, match, exact duplicate, fuzzy duplicate, line-item sum, usage and amount spike, vendor trust, policy. Status and approver come from that table. Thresholds live in `src/seed/policy.ts`.
- Vendor trust calls the CRS sandbox only for an `UNVERIFIED_CONTRACTOR` when `LINTEL_CRS_ENABLED=true`. `V-APEX` (Apex Rapid HVAC LLC) is persona P08. Any error is `UNAVAILABLE`. The code never synthesizes a score.
- After the decision, a held or blocked bill runs `investigate`. CREAO goes first when `CREAO_API_KEY` and `CREAO_AGENT_ID` are set (90 second budget, poll every 2 seconds). Claude Sonnet 5.5 (`claude-sonnet-5-5`) is the fallback: one `messages.create` call, same zod brief schema. The brief cannot change status.
- Every mutation appends an audit event. The hash is SHA-256 of `prev_hash|bill_id|seq|ts|actor|action|decision|rationale`. `verifyAudit` recomputes the chain. The first previous hash is 64 zeros.
- Cleared utility and ACH payments are `PaymentInstruction` with mode `SIMULATED`. x402 on Base Sepolia is a stretch flag (`LINTEL_X402_ENABLED`) and is not a live settlement in this build.

## Sponsor Track Breakdowns

### Hyphenate (Autonomous Systems for Finance)

The autonomous system is the desk, not a chatbot. Agents propose evidence and drafts. `decide` and `matchBill` dispose: duplicate detection, spike math, line-sum, approval limits, and status are deterministic and covered by the golden tests. The seats line is the header claim. Real versus simulated is a table the operator can check, including how to verify each row. The audit log is persistent and recomputed on load. The new behavior is the loop: an agent drafts the work order, a person assigns an address once, and the next bill from that address clears because the system stored the alias.

### CREAO (AI-First Disruptor)

The investigator is a live CREAO agent, Agent ID `cfc435a7-6765-4fb3-8c00-8d55d3c7af52`.

Public install / share link: https://agent.creao.ai/install/cfc435a7-6765-4fb3-8c00-8d55d3c7af52?version=74747abd-5af9-4356-9c2d-ad4d86e2e0e6

Verified live run `9daa058a-a0d7-4d83-afa3-5a1c2e9ee317`, thread `984de11d-548e-4564-a4fc-ba77c845787b`.

`investigate` posts the `InvestigationContext` to `https://agent.creao.ai/api/v1/runs`, polls until the run completes, and parses the brief. A completed run uses `result.text` when it matches the schema; otherwise it reads the first JSON artifact. The brief stores `provider: CREAO` and `creao_run_id`. If CREAO fails or the keys are unset, Claude Sonnet 5.5 drafts the same schema. CREAO does not set match confidence, status, or payment.

### CRS Credit API

Live Stitch Credit sandbox at `https://api-sandbox.stitchcredit.com/api`, not a production credit pull. Official persona P08, PRIYA VENKATESAN, SSN 666701008, mapped from `V-APEX.crs_identity_ref`. With `LINTEL_CRS_ENABLED=true`, CHIP-NEW-CONTRACTOR (Apex Rapid HVAC LLC) calls `POST /pp/fcrablj/data`. The verified sandbox report is a civil judgment of $12,300 and a state tax lien of $7,450. The parser maps bankruptcies, liens, and judgments to `FLAGGED` with the amounts the report returned. A timeout or a bad payload is `UNAVAILABLE`, never a pass. CRS off leaves `NOT_RUN`, and an unverified contractor is held. A flagged contractor is blocked (`CRS_FLAGGED`) and has no pay control.

### Microsoft (Built for the Real World)

Target customer: the multi-property AP desk. Measurable usefulness: dollars blocked, held, and cleared on every batch (opening replay Blocked $680.00, Held $6,100.00, Cleared $2,290.40) and minutes saved per bill against a two-full-days-a-month baseline. Path to production: Postgres and Convex persistence, a real utility portal, and ACH rails behind the same `PaymentInstruction` contract, plus enterprise SSO. Responsible AI: models never decide money. The append-only audit log is SHA-256 hash-chained and checked on every load. The product runs end to end from intake through match, guardrails, a human exception, and a settlement instruction.

### Convex

Convex is the only backend. Tables: `properties`, `vendors`, `vendorAccounts`, `bills`, `auditEvents`, `payments`, `aliases`, `investigations`. Queries are reactive, so a brief moving to done shows up without polling. Mutations write the bill and one audit row in one transaction and do not call the network. Actions are the only place HTTP is allowed (`processBill`, `extractBill`, `verifyVendor`, `investigate`). Seed history stays when the operator resets the live demo. Keys for Claude, CREAO, and CRS live in the Convex environment.

## Challenges

- CREAO cold starts take long enough that investigation runs after the decision. Form and feed bills stay off the model path so they return without waiting on a run.
- The Claude fallback ships as one `messages.create` call on Claude Sonnet 5.5 (`claude-sonnet-5-5`) with the shared brief schema. Forced tool use is a 400 on Opus 5.5, so the spec's tool-runner shape was not the path that landed.
- The CRS FCRA BLJ payload is PitchPoint XML turned into JSON: PascalCase keys, and a single filing arrives as an object rather than a one-element array. The parser normalizes that. It does not fill in a judgment the report did not return.
- The fuzzy-duplicate window is 20 days, not 30, because monthly flat fees (trash, landscaping) recur about 30 days apart and must not block themselves.
- A second opening replay would flag the first cleared bill as its own duplicate. `replayOpening` wipes live bills, live audit rows, investigations, and aliases, then runs the four inputs again. Seed history stays.

## Accomplishments

- Opening replay totals are produced by the engine on every load: Blocked $680.00, Held $6,100.00, Cleared $2,290.40. Verdicts are not stored.
- Human alias learning: assign `1880 Lombard #B` once; the twin bill matches by `HUMAN_ALIAS` at confidence 1.00.
- Golden tests cover the master-spec demo inputs with no network.
- Investigator runs on the live CREAO agent above, with the Claude Sonnet 5.5 fallback behind it.
- CRS vendor check is a live Stitch sandbox call for P08, gated by `LINTEL_CRS_ENABLED`.
- The audit drawer verifies a SHA-256 hash chain.

## What's next

- Commit redacted bill fixtures under `fixtures/bills/` (the CLI exists; the folder is still empty aside from `.gitkeep`).
- Submit on Devpost by Sunday 8:45 AM.
- Production persistence on Postgres beside Convex, real utility-portal and ACH rails behind `PaymentInstruction`, and enterprise SSO.
- Coinbase x402 on Base Sepolia only for a cleared contractor, and only with a real testnet transaction hash stored on the payment. The stretch is not live in this build.
- Precedent learning is specified as a later add-on and is not on the Sunday demo path.

## Built With

Next.js 16, React 19, TypeScript, Convex, Tailwind CSS, Zod, Vitest, Claude Haiku 5.5, Claude Sonnet 5.5, CREAO, CRS Credit API (Stitch Credit sandbox)

## 2-minute table demo script

One narrator (Pranil). Anmol drives the laptop. Piyush handles the judge and the second laptop. All three stay the full 10:30 to 12:30 window or we are not judged.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:05 | Replay runs on load. Four rows settle, totals land: Blocked $680.00 · Held $6,100.00 · Cleared $2,290.40. | Nothing. |
| 0:05–0:25 | Blotter. | "This is the AP desk for a 250-property book; five properties are loaded. Four bills just came in. PG&E is an enrolled utility, 2% under its usual bill, so it cleared to the portal, simulated. The $680 trash bill was already paid." |
| 0:25–0:50 | Select EBMUD: why-card, usage bars, investigator brief with drafted work order. | "Duplicates and spike math are code, not a model. This water bill is four times the usage at the same rate: probably a leak. The investigator agent already pulled the history and drafted the work order; a person sends it." |
| 0:50–1:15 | Select $420 row, assign Telegraph Hill. Then run the $390 twin chip: `HUMAN_ALIAS`, cleared. | "Unit B isn't in that building, so it stops at 0.80. We assign it once. The next bill from that address matches by what the human taught it and clears on its own." |
| 1:15–1:35 | Turn laptop. Injector open, $686 chip visible. | "Type any bill, or use this one. Same engine." |
| 1:35–2:00 | Judge runs it: BLOCKED, fuzzy duplicate of RW-99201. | "New invoice number, within 2% of one we already paid, five days apart. Blocked. Nothing is set to pay." |

If they hand you paper: drop the photo. If fields are not back in 20 s, the row is already HELD: "It won't decide money on a partial read." Type their total into the form.

**Do not say:** "we stopped $X in losses", "200 doors", any CRS score we did not receive, "settled in USDC" without a hash on screen.
