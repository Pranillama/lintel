# AI Workflow Rules

Three people, three coding agents, one repo, about 20 hours. These rules exist so nobody's agent overwrites someone else's work and `main` always runs.

## 1. Every agent session starts the same way

1. `git pull origin main`
2. Read, in order: `CLAUDE.md`, `AGENTS.md`, `context/master-spec.md`, `context/code-standards.md`, this file, `context/ui-context.md` (Piyush required, others skim), and **your own lane spec** in `context/lanes/`.
3. Open `src/types/bill.ts`. That file is the contract. Code against it; do not redefine its types.
4. Pick the next unchecked item in your lane spec's checklist and say which one you are doing.

## 2. Contract-first

- `src/types/bill.ts`, `src/shared/normalize.ts`, and `src/seed/**` are **frozen**. They are already merged so every lane can build on hour one.
- Need a change? Post in `#collaborative-context`: what, why, which lanes it touches. Wait for a 👍 from the other two owners. One person (the requester) makes the change in a PR that touches **only** the frozen files, merges it to `main` quickly, and posts "contract changed, pull now".
- Cheap changes (get a 👍 fast): adding an optional field, adding a new union member that the engine handles. Expensive changes (avoid): renaming, removing, changing a field's type.
- Never work around the contract with a local type or a cast. If the type is wrong, fix the contract.

## 3. Lanes and file ownership

You may create or edit files **only** inside your lane's folders (table in `code-standards.md` §2). Reading anything is fine.

| Owner | Folders |
|---|---|
| Anmol | `src/engine/`, `src/audit/`, `convex/schema.ts`, `convex/bills.ts`, `convex/pipeline.ts`, `convex/engine.ts`, `convex/audit.ts`, `convex/seed.ts`, `tests/` (except Pranil's two subfolders) |
| Pranil | `src/intake/`, `src/agents/`, `src/match/`, `src/integrations/`, `convex/intake.ts`, `convex/match.ts`, `convex/crs.ts`, `convex/payments.ts`, `fixtures/`, `tests/match/`, `tests/intake/`, `README.md` |
| Piyush | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/`, `public/` |

If you need something from another lane (a new API field, a new helper), ask its owner in Slack. Do not "just quickly fix it" in their folder. If they are asleep and it blocks you, write the change as a patch file in your Slack message instead.

## 4. Shared files (`package.json`, lockfile, configs)

- Dependencies are pre-installed by the scaffold. Adding one: post in `#collaborative-context` first, then add it in a tiny PR that touches only `package.json` + `package-lock.json`, merge it fast, and tell everyone to `npm install`.
- Never reformat or reorder shared config files.

## 5. Branches and merging

- Branch names: `pranil/<topic>`, `anmol/<topic>`, `piyush/<topic>`. Short-lived: merge to `main` at least every 2 hours, smaller is better.
- Before merging: `git pull origin main` into your branch, then `npm test && npm run lint && npm run build`. All three green or it does not merge.
- Merge by PR (self-merge allowed) or a fast-forward push to `main` after the checks. Never force-push `main`.
- Commit messages: imperative, scoped: `engine: add fuzzy duplicate rule`, `ui: judge drawer chips`. No co-author trailers.
- Merge conflicts should be impossible if lanes are respected. If one happens in a file you do not own, stop and ask the owner.

## 6. Keep the trackers honest

- Each lane spec ends with a checklist. After each meaningful change, update **only your own** lane spec checklist (`[x]` + one line on what landed) in the same commit.
- Post a one-liner in your `#<name>-update` channel when you merge something another lane depends on (e.g. "`decide()` real for all golden rows, on main").
- If your work changes the architecture, the contract, or the scope, update the relevant `context/` file **before** writing the code, via §2.

## 7. Stubs first, so nobody waits

At scaffold time every lane function in `bill.ts` exists as a typed stub that returns a safe value (for example `decide()` returns HELD with reason `MISSING_FIELD`). Replace your stubs with real code; keep the signature. This lets Piyush build the UI against a running API at 1 PM and lets Anmol test the pipeline before the matcher is real.

## 8. Things agents must not do

- Call a model from `src/engine/` or `src/match/`, or let model output set a status.
- Store a demo verdict anywhere (seed, fixtures, mocks used by the real page).
- Add a "demo mode" branch in code that changes outcomes for chips or demo keys. Chips prefill inputs only.
- Commit `.env*`, `data/*.db`, API keys, or CRS test identity data beyond what CRS published for hackathon use.
- Delete or rewrite audit rows.
- Edit `CHANGELOG`-style or generated files by hand.
- Invent sponsor facts (CRS scores, CREAO run links, tx hashes). If it did not run, it is not on screen.

## 9. When stuck

- Same bug, three failed attempts: stop, write down what you tried, post in your update channel, and ask for a second pair of eyes.
- Blocked on another lane for more than 20 minutes: say so in Slack and move to the next checklist item.
- At 6:00 PM and 2:00 AM we stop and check the gates in master-spec.md §9 together.
