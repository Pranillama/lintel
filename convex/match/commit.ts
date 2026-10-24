import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import { matchBill } from "../../src/match/matchBill";
import type { AuditEvent } from "../../src/types/bill";
import { billById, eventsFor, loadLedger, readBill, saveBill, saveEvents } from "../lib/records";

/** Loads the ledger and runs matchBill. The matcher itself is Pranil's. */
export const commitMatch = internalMutation({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const row = await billById(ctx, args.billId);
    if (!row) throw new Error(`Unknown bill ${args.billId}`);
    const bill = readBill(row.record);
    const ledger = await loadLedger(ctx);
    const match = matchBill(bill.extracted, ledger);
    const previous = await eventsFor(ctx, bill.id);
    const drafts: Array<Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash">> = [
      {
        bill_id: bill.id,
        ts: bill.created_at,
        actor: "DETERMINISTIC_RULE",
        action: "RESOLVE_VENDOR",
        decision: match.vendor_id ? "PASS" : "HALT",
        rationale: match.vendor_id ? `${match.vendor_match} ${match.vendor_id}` : "Unknown vendor.",
        data: {},
      },
      {
        bill_id: bill.id,
        ts: bill.created_at,
        actor: match.method === "HUMAN_ALIAS" ? "HUMAN_ALIAS" : "DETERMINISTIC_RULE",
        action: "RESOLVE_PROPERTY",
        decision: match.property_id ? "PASS" : "HALT",
        rationale: match.property_id ? `${match.method} ${match.property_id} ${match.confidence.toFixed(2)}` : "Unresolved property.",
        data: {},
      },
    ];
    await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, drafts));
    const next = { ...bill, match };
    await saveBill(ctx, next);
    return next;
  },
});
