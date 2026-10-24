/**
 * AI must not decide duplicates, variance, limits, status, approver, rail,
 * payment, the property match, vendor creation, or audit hashes.
 * master-spec §4. commitPolicy only stores what decide() returns.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import { decide } from "../../src/engine/decide";
import type { AuditEvent, CrsResult } from "../../src/types/bill";
import { billById, eventsFor, loadLedger, readBill, saveBill, saveEvents } from "../lib/records";

export const commitPolicy = internalMutation({
  args: { billId: v.string(), crs: v.string() },
  handler: async (ctx, args) => {
    const row = await billById(ctx, args.billId);
    if (!row) throw new Error(`Unknown bill ${args.billId}`);
    const bill = readBill(row.record);
    const crs = JSON.parse(args.crs) as CrsResult;
    const ledger = await loadLedger(ctx);
    ledger.bills = ledger.bills.filter((item) => item.id !== bill.id);
    const decision = decide({ bill_id: bill.id, extracted: bill.extracted, match: bill.match, crs, ledger });
    const previous = await eventsFor(ctx, bill.id);
    const drafts: Array<Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash">> = decision.checks.map((check) => ({
      bill_id: bill.id,
      ts: bill.created_at,
      actor: "DETERMINISTIC_RULE" as const,
      action: "CHECK" as const,
      decision: check.outcome === "SKIP" ? "INFO" : check.outcome,
      rationale: check.rationale,
      data: { check_id: check.id },
    }));
    drafts.push({
      bill_id: bill.id,
      ts: bill.created_at,
      actor: "DETERMINISTIC_RULE",
      action: "DECISION",
      decision: decision.status === "BLOCKED" ? "BLOCK" : decision.status === "CLEARED" ? "PASS" : "HALT",
      rationale: decision.why,
      data: {},
    });
    const events = await appendEvents(previous.at(-1) ?? null, drafts);
    const next = { ...bill, crs, decision, status: decision.status, resolved_by: "AUTO" as const, payment: null };
    await saveBill(ctx, next);
    await saveEvents(ctx, events);
    return next;
  },
});
