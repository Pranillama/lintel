import { describe, expect, it } from "vitest";
import { appendEvents } from "@/audit/append";
import { verifyChain } from "@/audit/chain";
import { decisionAuditDrafts } from "@/audit/drafts";
import { decide } from "@/engine/decide";
import { OPENING_BATCH } from "@/seed/demo-inputs";
import { extractedFrom, match, NOT_RUN, seedLedger } from "./helpers/ledger";

describe("audit chain", () => {
  it("verifies a chained decision and fails after the rationale changes", async () => {
    const row = OPENING_BATCH[0];
    const extracted = extractedFrom(row.form);
    const matched = match({
      vendor_id: "V-PGE",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-001",
      method: "EXACT_ACCOUNT",
      confidence: 1,
    });
    const decision = decide({ bill_id: row.key, extracted, match: matched, crs: NOT_RUN, ledger: seedLedger() });
    const drafts = decisionAuditDrafts({
      bill_id: row.key,
      ts: "2026-10-24T19:00:00.000Z",
      source: "FEED",
      source_label: "Saturday intake",
      extracted,
      match: matched,
      crs: NOT_RUN,
      decision,
    });
    expect(drafts.map((d) => d.action)).toEqual([
      "INTAKE",
      "EXTRACT_FIELDS",
      "RESOLVE_VENDOR",
      "RESOLVE_PROPERTY",
      "CHECK",
      "CHECK",
      "CHECK",
      "CHECK",
      "CHECK",
      "CHECK",
      "CHECK",
      "CHECK",
      "DECISION",
      "ROUTE_PAYMENT",
    ]);
    const events = await appendEvents(null, drafts);
    expect(await verifyChain(events)).toBe(true);
    const tampered = events.map((event, index) => (index === 3 ? { ...event, rationale: "tampered" } : event));
    expect(await verifyChain(tampered)).toBe(false);
  });
});
