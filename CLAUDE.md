# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes and keep our Cal Hacks 13.0 build fast, deterministic, and merge-conflict-free.

**Tradeoff:** Bias toward clarity, deterministic financial logic, and working end-to-end flows over speculative abstractions.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back on scope creep when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes & Parallel Work Safety

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting outside your assigned scope.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Respect shared data contracts (such as `src/types/`) once frozen; coordinate before mutating shared interfaces.
- When working in a designated owner lane or spec file, stay strictly inside your assigned directories and update only your own progress checklist to avoid merge conflicts.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Core Domain Rule: AI Proposes, Deterministic Code Disposes

Lintel is an autonomous corporate Accounts Payable (AP) and property utility bill System of Work. Across the entire codebase:

- **AI/LLMs** may extract unstructured invoice/utility fields, resolve entities (vendor, service address, property, meter, GL code), and attach explicit confidence scores (`0.00` to `1.00`) and plain-English reasoning.
- **Deterministic code** must enforce all financial math, duplicate bill checks, historical variance/spike thresholds, approval limits, and policy guardrails with zero LLM calls.
- **Human-in-the-loop escalation:** Any low-confidence extraction or failed policy guardrail must halt autonomous settlement and route to the operator exception queue with an immutable audit log entry.

## 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Wire integration" -> "Verify against the shared TypeScript contract and seeded test bills"

For multi-step tasks, state a brief plan:

```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

Read and follow AGENTS.md
