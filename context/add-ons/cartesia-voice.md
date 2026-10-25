# Add-on: Cartesia voice explainer

Research spec, ready to build. No code has been written for it. Researched Oct 25, 2026 against the code on `main` at `8f0f218`.

A reviewer presses **Listen** on a bill and hears, in one short spoken paragraph, what the desk already says on screen: the verdict, the numbers behind it, and who has to act. Cartesia Sonic turns the text into speech. **Deterministic code writes every word that is spoken.** The voice reads the decision; it never makes one.

> The model reads the bill. Code decides whether it gets paid. **Code writes what the voice says.** A person owns the exceptions.

Cross-links: `context/master-spec.md` §4 (AI allowed vs forbidden), §5.2–§5.3 (status, approver, why-sentence templates); `context/ui-context.md` §1 (story header, cards); `context/code-standards.md` (lane folders); `src/types/bill.ts` (frozen contract). Sibling add-on: `context/add-ons/portfolio-ask.md` (the typed-question drawer; its non-goals exclude voice, this file does not change that).

---

## 1. Why Cartesia, and what the track asks for

- Cartesia is listed as a Cal Hacks 13.0 sponsor on calhacks.io. **The 2026 prize name and judging criteria were not published online** (Devpost returned 403). Most recent public record: Cartesia partnered with Cal Hacks 11.0 (Oct 2024, "Hacktober"; winner SpeakEasy). Source: https://www.cartesia.ai/blog/hacktober.
- **Action before building:** ask at the Cartesia booth or the hacker guide for (a) the exact track criteria, (b) hackathon credits. If the track requires a realtime voice agent (Line) rather than TTS, read §9 Stretch first.
- Why it fits Lintel: the desk's hardest moment for a reviewer is a HELD or BLOCKED bill with eight checks behind it. A 10–20 second spoken explanation ("Blocked. This Recology invoice is within 0.9% of one we paid five days ago…") is the clearest version of the why-card for a loud judging table, and it does not move the AI boundary.

## 2. Current flow, and where voice plugs in

```
processBill (action)
  intake → commitExtraction → commitMatch → [verifyVendor] → commitPolicy(decide)
     │                                                           │
     │                                   CLEARED: ROUTE_PAYMENT "<rail> APPROVED_FOR_PAYMENT"
     │                                   HELD/BLOCKED: schedule investigate (CREAO → Claude)
     ▼
listBills subscription → Desk → story header + 4 cards
humanResume (mutation): assign | approve | reject | send-draft  → re-renders
```

Everything the voice needs already exists on `BillView` once the decision is committed:

| Spoken part | Source field | Who wrote it |
|---|---|---|
| Verdict | `status` | `decide()` |
| Why | `decision.why` | `src/engine/explain.ts` (deterministic templates, master-spec §5.3) |
| Failing checks | `decision.checks[]` where `outcome` is `HALT`/`BLOCK`, `.rationale` | engine |
| Who must act | `decision.required_approver` | engine |
| Human outcome | `status` `CLEARED`/`REJECTED` + `resolved_by: "HUMAN"` | `humanResume` |
| Agent findings (optional, labelled) | `investigation.summary` when `status === "DONE"` | AI investigator, spoken with an "the agent says" prefix |

**New pieces (all additive, nothing on the decision path changes):**

1. `src/voice/script.ts`: pure `buildNarration(bill: BillView): Narration`. No IO, no model, no `Date.now()`. Turns the fields above into a short transcript.
2. `convex/voice/narrate.ts`: Convex **action** `narrateBill({ billId })`. Builds the transcript, checks the cache, calls Cartesia `/tts/bytes` if needed, stores the mp3 in Convex file storage, returns a URL.
3. `narrations` table: cache keyed by `transcript_hash` so replays and re-clicks cost zero credits.
4. UI: a `Listen` button in the story header, plus an audio element. Lives in `src/components/desk/`.

The pipeline (`processBill`, `commitPolicy`, `humanResume`) is **not edited**. Narration is generated on demand when the reviewer presses Listen. That keeps the 2-second FORM path and the decision path untouched.

## 3. Hard rules

1. **No LLM writes the transcript.** `buildNarration` is a template over engine output, the same way `explain.ts` is. The AI investigator's `summary` may be read only when `investigation.status === "DONE"`, only after the deterministic part, and only behind the spoken label "The investigator agent adds:". It is optional (`includeAgent` flag, default `true`).
2. **Never speak a number the engine did not produce.** Amounts, percentages, and days come from `decision.why` and `checks[].rationale` verbatim, or from the same `data` fields `explain.ts` reads, formatted by `src/engine/format.ts`.
3. **Voice cannot act.** No voice command approves, rejects, assigns, or pays. Listen is read-only.
4. **Narration is not a state transition**, so it does not append to the audit chain (AGENTS.md invariant 4 covers state transitions). The `narrations` table records what was spoken, by which model and voice, for review.
5. **Failure is quiet and local.** Cartesia down, no key, or out of credits → the Listen button shows the error inline (`Voice is unavailable: <reason>`). The bill, its status, and every other control are unaffected.
6. **Key stays server-side.** `CARTESIA_API_KEY` lives in the Convex environment like `ANTHROPIC_API_KEY` and `CREAO_API_KEY`. The browser never calls Cartesia directly in v1 (avoids the unverified CORS question, §8).

## 4. Cartesia API facts used by this spec

Legend: **[C]** confirmed in Cartesia docs on Oct 25, 2026. **[U]** unverified.

| Item | Value |
|---|---|
| Base URL | `https://api.cartesia.ai` [C] |
| Auth | `Authorization: Bearer <CARTESIA_API_KEY>` [C] |
| Version header | `Cartesia-Version: 2026-08-14` (docs say it is the only allowed value) [C] |
| Endpoint | `POST /tts/bytes` → audio bytes [C] |
| Model | `sonic-3.6` (alias for latest stable). Pin `sonic-3.6-2026-08-27` for the demo so the voice does not change mid-weekend [C] |
| Output | `{"container":"mp3","sample_rate":44100,"bit_rate":128000}` plays directly in `<audio>` [C] |
| Tuning | `generation_config: { speed: 0.6–1.5, volume: 0.5–2.0, emotion: "neutral" \| "calm" \| … }` (sonic-3+) [C] |
| Voice | `{"id": "<uuid>"}`. Default Skylar `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4` (from docs examples) [C]. For a more "auditor" tone, try Daniel or Jacqueline via `GET /voices?q=Daniel` [C, IDs not looked up] |
| Text normalization | `normalization: "auto"` (default) reads `$5,680.00` and dates naturally [C that the field exists; how well it reads `+281.0%` is U, test it] |
| Per-request char limit | Not documented for Sonic 3.x [U]. Keep transcripts ≤ 450 chars (§5.3) |
| Latency | Vendor claims < 90 ms time to first audio for 3.6 [U]. `/tts/bytes` waits for the full clip; expect well under 1–2 s for 400 chars [U, measure] |
| Pricing | Free: 20K credits/mo, TTS concurrency 2. Pro $5: 100K. 1 credit = 1 character [C]. ~200–450 chars per bill → ~45–100 narrations on free tier, which is why §6 caches |
| SDK | `@cartesia/cartesia-js` exists [C]. **Not needed**: one `fetch` call in a Convex action avoids a new dependency (ai-workflow-rules §4) |

Request the action sends:

```json
POST https://api.cartesia.ai/tts/bytes
Authorization: Bearer $CARTESIA_API_KEY
Cartesia-Version: 2026-08-14
Content-Type: application/json

{
  "model_id": "sonic-3.6-2026-08-27",
  "transcript": "<buildNarration(bill).transcript>",
  "voice": { "id": "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4" },
  "language": "en",
  "output_format": { "container": "mp3", "sample_rate": 44100, "bit_rate": 128000 },
  "generation_config": { "speed": 1.05, "volume": 1, "emotion": "neutral" }
}
```

Sources: https://docs.cartesia.ai/api-reference/tts/bytes, https://docs.cartesia.ai/build-with-cartesia/tts-models, https://cartesia.ai/pricing, https://docs.cartesia.ai/api-reference/voices/list.

## 5. The transcript (`src/voice/script.ts`)

### 5.1 Types (local to `src/voice/`, not in the frozen contract)

```ts
export interface Narration {
  bill_id: BillId;
  /** What is sent to Cartesia. ≤ 450 chars. */
  transcript: string;
  /** Same text split by source, for the on-screen caption and tests. */
  segments: Array<{ source: "CODE" | "AI_INVESTIGATOR"; text: string }>;
  /** sha256(transcript + model_id + voice_id). Cache key. */
  transcript_hash: string;
}
export type BuildNarrationFn = (bill: BillView, opts?: { includeAgent?: boolean }) => Narration;
```

`transcript_hash` uses the same sha256 helper as `src/audit/chain.ts` (read-only import, no edit to that file).

### 5.2 Template, in order

1. **Opener (status + vendor + amount):**
   - CLEARED auto: `"{vendor}, {amount}. Cleared."`
   - CLEARED by human: `"{vendor}, {amount}. Approved by {approver label}."`
   - HELD: `"{vendor}, {amount}. Held for you."`
   - BLOCKED: `"{vendor}, {amount}. Blocked."`
   - REJECTED: `"{vendor}, {amount}. Rejected by a reviewer."`
2. **Why:** `decision.why` verbatim, with two speech substitutions only: a leading `+`/`−` before a percentage becomes "up"/"down" (`+281.0%` → `up 281.0 percent`), and `vs` → `versus`. Nothing else is rewritten.
3. **Who acts (HELD only):** from `required_approver`:
   - `OPERATOR` → `"An operator needs to fix the details before anyone can approve it."`
   - `PROPERTY_MANAGER` → `"It needs a property manager's approval."`
   - `VP_FINANCE` → `"It is over five thousand dollars, so it needs VP Finance."` (only when the amount is above `POLICY` VP threshold; otherwise the generic `"It needs VP Finance's approval."`)
   - BLOCKED → `"Nothing will be paid. Blocked bills have no approve control."`
   - CLEARED → `"Approved for payment via {RAIL_LABEL[rail]}."` If a Capital One payment exists (sibling spec `capital-one-payments.md`), use its status: `"Paid through Capital One, reference ending {last4}."` only when `payment.status === "SENT"`. Never claim money moved without a stored reference (ai-workflow-rules §8).
4. **Other failing checks (max 2):** if more than one check failed, add `"Also: {rationale}."` for up to two more `HALT`/`BLOCK` checks, in `CheckId` order. E.g. BILL-LINESUM speaks the line-sum block, then "Also" the amount spike.
5. **Agent (optional):** if `includeAgent` and the brief is DONE: `"The investigator agent adds: {first sentence of investigation.summary}."` Labelled so a listener knows it is AI.

Labels (`APPROVER_LABEL`, `RAIL_LABEL`) are imported from `src/components/desk/contract.ts` only if that does not pull React in; otherwise duplicate the two small maps in `src/voice/labels.ts`.

### 5.3 Length

If the transcript exceeds 450 chars, drop step 5, then step 4, never steps 1–3. If steps 1–3 alone exceed 450 chars, cut `decision.why` at the last sentence boundary under the limit. Test it.

### 5.4 Golden transcripts (become `tests/voice/script.test.ts`)

Built from master-spec §6 outcomes; exact strings are filled in when `explain.ts` output is captured from the fixtures.

| Bill | Expected transcript starts with | Must contain |
|---|---|---|
| BILL-101 PG&E $2,290.40 | `PG&E, $2,290.40. Cleared.` | `down 2.1 percent`, `utility portal` |
| BILL-102 Recology $680.00 | `Recology, $680.00. Blocked.` | `already paid`, `Nothing will be paid` |
| BILL-103 EBMUD $5,680.00 | `EBMUD, $5,680.00. Held for you.` | `up 281.0 percent`, `VP Finance` |
| BILL-104 Bayline $420.00 | `Bayline Plumbing, $420.00. Held for you.` | `0.80`, `operator` |
| CHIP-FUZZY-DUP $686.00 | `Recology, $686.00. Blocked.` | `RW-99201`, `5 days apart` |
| BILL-LINESUM | `SFPUC, $1,850.00. Blocked.` | `do not add up`, `Also:` |
| Any bill, brief DONE | — | `The investigator agent adds:` appears last, segment source `AI_INVESTIGATOR` |
| Any bill, brief PENDING | — | no agent segment |

Plus: `buildNarration` is pure (same input → same output and hash); added to the boundary test's "no fetch / no model / no Date.now" list.

## 6. Server action and cache (`convex/voice/narrate.ts`)

```
narrateBill({ billId, includeAgent? })  — public action
  1. view = runQuery(getBill)                         → unknown id: ConvexError("Unknown bill.")
  2. n = buildNarration(view, { includeAgent })
  3. hit = runQuery(internal.voice.narrate.byHash, { hash: n.transcript_hash })
     hit → return { url: storage.getUrl(hit.storageId), transcript, segments, cached: true }
  4. !CARTESIA_API_KEY or LINTEL_VOICE_ENABLED !== "true" → ConvexError("Voice is off.")
  5. fetch POST /tts/bytes (body §4), timeout 15 s (AbortController)
     non-2xx → ConvexError(`Voice is unavailable: ${status} ${short body}`)   (402/429 = out of credits / rate limit)
  6. storageId = storage.store(Blob(bytes, "audio/mpeg"))
  7. runMutation(internal.voice.narrate.save, { billId, hash, transcript, model_id, voice_id, storageId, chars, created_at })
  8. return { url, transcript, segments, cached: false }
```

New table (Anmol owns `convex/schema.ts`, additive):

```ts
narrations: defineTable({
  billId: v.string(),
  transcriptHash: v.string(),
  transcript: v.string(),
  modelId: v.string(),
  voiceId: v.string(),
  storageId: v.id("_storage"),
  chars: v.number(),
  createdAt: v.string(),
}).index("by_hash", ["transcriptHash"]).index("by_billId", ["billId"]),
```

Because the hash covers the transcript, a bill whose status changes (HELD → CLEARED after approval) gets a new narration automatically; the old one stays as a record. `resetDemo`-style wipes, if any return, should leave this table alone (it is a pure cache).

Env (Convex dashboard, never `.env` in git): `CARTESIA_API_KEY`, `LINTEL_VOICE_ENABLED=true`, optional `CARTESIA_VOICE_ID`, `CARTESIA_MODEL_ID`.

`PortfolioResponse.flags` gains `voice_enabled: boolean` (**contract change, additive optional field**, needs the 👍 process in ai-workflow-rules §2). Until it lands, the UI can show Listen always and rely on the "Voice is off." error.

## 7. UI (Piyush lane, `src/components/desk/`)

- **Story header:** a quiet secondary `Listen` button with a speaker icon, right of the amount. Not lime (lime is reserved for the one primary action, ui-context §2).
- States: idle `Listen` → `Preparing…` (spinner, only on a cache miss) → playing `Pause` with a thin progress line → ended back to `Listen`. Error renders inline in red under the header, never `alert()`.
- **Caption:** while playing, show the transcript under the verdict in 14px muted text, with the `AI_INVESTIGATOR` segment prefixed by the AI actor chip so it is visually labelled the same way it is spoken.
- **Keyboard:** `L` toggles Listen on the selected bill (`J` stays Test a bill). Add to `useDesk`.
- `DeskActions` gains `narrate(billId: string): Promise<{ url: string; transcript: string; segments: … }>`, wired in `useConvexDesk.ts` with `useAction(api.voice.narrate.narrateBill)`.
- Switching bills stops playback. Reduced motion: no progress animation, text only.
- Optional, judging table only: an `Auto-explain` toggle in the top bar that plays the narration when a HELD/BLOCKED bill is selected. Default off.

## 8. Risks and open questions

| # | Question | Plan |
|---|---|---|
| 1 | Exact Cartesia Cal Hacks 13.0 track criteria | Ask at booth before building. If they want realtime / agent, see §9 |
| 2 | Hackathon credits | Ask at booth. Free tier (20K chars) is enough with the cache |
| 3 | How Sonic reads `RW-99201`, `4491-882-01`, `0.80`, `$1,234.56` | Spike test on day one with five strings; if bad, add a speech-substitution table in `script.ts` (spell IDs with spaces) or use `pronunciation_dict_id` |
| 4 | Browser CORS for direct Cartesia calls | Not needed in v1 (server proxy). Only matters for §9 streaming |
| 5 | Convex action returning bytes vs URL | Return a storage URL, not bytes, to stay well under action return-size limits |
| 6 | `boundary.test.ts` allows `fetch` only in `convex/intake|crs|payments|pipeline` | Add `convex/voice/` to the allowlist (Anmol's file), or place the action in `convex/pipeline/narrate.ts` to avoid touching the test |

## 9. Stretch (only after v1 ships)

- **Streaming:** switch to `POST /tts/sse` (raw PCM chunks) or the WebSocket with a short-lived `POST /access-token` (`grants: { tts: true }`, `expires_in` ≤ 300) so audio starts in under a second for long transcripts. Needs the CORS check.
- **Ask why, by voice:** Cartesia Ink STT (`wss://api.cartesia.ai/stt/websocket`, model `ink-2`, `keyterm` = vendor names) turns a spoken question into text, then feeds the existing **Portfolio ask** add-on (`portfolio-ask.md`), whose answer is again template text spoken by Sonic. The model still only parses the question into a typed query.
- **Line voice agent:** Cartesia's hosted agent platform. Only acceptable if its tools are read-only (`getBill`, `listBills`) and every spoken fact is a tool result. It must not have approve/reject/pay tools. Higher risk for a weekend; pick only if the track requires it.

## 10. Build plan (each step has a check)

| # | Step | Owner lane | Verify |
|---|---|---|---|
| 1 | Booth: confirm track criteria + credits; get API key into Convex env | any | key works with the curl in §4, mp3 plays |
| 2 | Spike: speak five hard strings (§8 #3), choose voice + speed | any | listen; pick substitutions |
| 3 | `src/voice/script.ts` + `tests/voice/script.test.ts` golden rows (§5.4) | new folder, Piyush or Pranil | `npm test` green, boundary test includes `src/voice` |
| 4 | `narrations` table + `convex/voice/narrate.ts` (or `convex/pipeline/narrate.ts`) | Anmol (schema), Pranil (action) | call `narrateBill` from the Convex dashboard on BILL-103: returns a URL; second call `cached: true`, no credits used |
| 5 | `voice_enabled` flag in `PortfolioResponse` (contract 👍) | Anmol | `getPortfolio` shows it |
| 6 | Listen button, caption, `L` key, inline errors | Piyush | play every golden bill in the browser; kill the key → inline error, bill unchanged |
| 7 | Demo line: on EBMUD, press Listen at 0:25 instead of narrating the why-card | Pranil (script) | full 2-minute run twice, no console errors |

Estimated effort: steps 3–6 ≈ 3–4 focused hours.

## Checklist (update only this list)

- [ ] Track criteria + credits confirmed at the Cartesia booth
- [ ] Voice spike: hard strings read correctly, voice chosen
- [ ] `buildNarration` + golden tests
- [ ] `narrations` cache table + `narrateBill` action
- [ ] `voice_enabled` flag (contract change approved)
- [ ] Listen button + caption + `L` shortcut
- [ ] Demo script updated
