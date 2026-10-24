## Application Building Context

Lintel is our Cal Hacks 13.0 project: an autonomous property utility and vendor bill System of Work for multi-property portfolios (intake, property/GL matching, deterministic duplicate and spike guardrails, vendor verification, human-in-the-loop exception handling, auditable decision logs, and settlement).

Read the following files in order (as they are added inside `context/`) before implementing or making any architectural decision:

1. `context/master-spec.md` — product definition, system boundaries, shared data contract, seeded demo scenarios, and sponsor tracks
2. `context/ui-context.md` — operator queue UX, exception review workflow, audit log presentation, and component conventions
3. `context/code-standards.md` — implementation rules, TypeScript conventions, and the strict boundary between AI extraction and deterministic financial guardrails
4. `context/ai-workflow-rules.md` — contract-first workflow, branch hygiene, and how multiple teammates and coding agents work in parallel without merge conflicts
5. Owner lane specs / progress trackers inside `context/` — the active scope, checklist, and next steps for your current workstream

Update only your active progress tracker after each meaningful implementation change.

If implementation changes the architecture, shared types, scope, or standards documented in `context/`, update the relevant context file before continuing.

## Architectural Invariants

1. **Contract-First Development:** Shared interfaces (such as bill records, guardrail evaluations, and audit log entries) are the single source of truth across intake, validation, UI, and external integrations.
2. **Deterministic Financial Safety:** Duplicate invoice detection, historical consumption/cost spike math, and approval routing rules must be 100% deterministic and reproducible. Never delegate financial arithmetic or threshold pass/fail gates to an LLM.
3. **Explicit Confidence & Escalation:** Every AI-extracted or AI-matched field must carry a confidence score and source evidence. Low-confidence fields or failed guardrails escalate to a human operator rather than failing silently or guessing.
4. **Immutable Audit Trail:** Every state transition (intake, extraction, property match, guardrail check, vendor verification, human override, or payment release) appends a timestamped, attributable entry to the bill's audit log.

## Commit Attribution Messages

Do not include "Co-Authored-By" attribution lines in commit messages.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
